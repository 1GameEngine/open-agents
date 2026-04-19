/**
 * Sandbox management API — self-hosted mode.
 *
 * POST   /api/sandbox  — create or resume a local-fs sandbox for a session
 * DELETE /api/sandbox  — stop (no-op for local-fs) and clear sandbox state
 *
 * In self-hosted mode the sandbox is a lightweight local filesystem directory.
 * No Vercel cloud VM is used. Git operations (clone, checkout) are performed
 * by the web server process using the `simple-git` library.
 */
import * as path from "path";
import { createLocalFsSandbox, connectLocalFsSandbox, type LocalFsState } from "@open-harness/sandbox/local-fs";
import {
  requireAuthenticatedUser,
  requireOwnedSession,
  type SessionRecord,
} from "@/app/api/sessions/_lib/session-context";
import { updateSession } from "@/lib/db/sessions";
import { installGlobalSkills } from "@/lib/skills/global-skill-installer";
import {
  canOperateOnSandbox,
  clearSandboxState,
  hasResumableSandboxState,
} from "@/lib/sandbox/utils";
import type { SandboxState } from "@open-harness/sandbox";

/** Root directory for all session sandboxes */
const SANDBOX_ROOT_DIR =
  process.env.SANDBOX_ROOT_DIR ?? "/tmp/open-agents-sandboxes";

interface CreateSandboxRequest {
  repoUrl?: string;
  branch?: string;
  isNewBranch?: boolean;
  sessionId?: string;
  /** Accepted for API compatibility; only "local-fs" is supported in self-hosted mode */
  sandboxType?: string;
}

async function installSessionGlobalSkills(params: {
  sessionRecord: SessionRecord;
  sandbox: Awaited<ReturnType<typeof createLocalFsSandbox>>;
}): Promise<void> {
  const globalSkillRefs = params.sessionRecord.globalSkillRefs ?? [];
  if (globalSkillRefs.length === 0) {
    return;
  }
  await installGlobalSkills({
    sandbox: params.sandbox,
    globalSkillRefs,
  });
}

export async function POST(req: Request) {
  let body: CreateSandboxRequest;
  try {
    body = (await req.json()) as CreateSandboxRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { repoUrl, branch = "main", isNewBranch = false, sessionId, sandboxType } = body;

  // Only local-fs is supported in self-hosted mode
  if (sandboxType !== undefined && sandboxType !== "local-fs") {
    return Response.json({ error: "Invalid sandbox type" }, { status: 400 });
  }

  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) return authResult.response;

  // Validate session ownership
  let sessionRecord: SessionRecord | undefined;
  if (sessionId) {
    const sessionContext = await requireOwnedSession({
      userId: authResult.userId,
      sessionId,
    });
    if (!sessionContext.ok) {
      return sessionContext.response;
    }
    sessionRecord = sessionContext.sessionRecord;
  }

  const startTime = Date.now();

  // ─── Create or resume local-fs sandbox ───────────────────────────────────
  let sandbox: Awaited<ReturnType<typeof createLocalFsSandbox>>;
  let currentBranch = branch;

  const existingState = sessionRecord?.sandboxState as LocalFsState | null | undefined;

  if (existingState?.type === "local-fs" && existingState.sandboxDir) {
    // Resume existing sandbox
    sandbox = connectLocalFsSandbox(existingState);
    currentBranch = existingState.currentBranch ?? branch;
  } else {
    // Create new sandbox directory
    const workingDirectory = repoUrl
      ? path.join(SANDBOX_ROOT_DIR, `session_${sessionId ?? "tmp"}`, "repo")
      : undefined;

    sandbox = await createLocalFsSandbox(
      sessionId ?? `tmp_${Date.now()}`,
      workingDirectory,
      branch,
    );

    // If a repo URL is provided, clone it using git (server-side)
    if (repoUrl && sessionId) {
      try {
        const { cloneRepoToSandbox } = await import("@/lib/sandbox/git-clone");
        currentBranch = await cloneRepoToSandbox({
          sandbox,
          repoUrl,
          branch,
          isNewBranch,
        });
      } catch (error) {
        console.error(`Failed to clone repo for session ${sessionId}:`, error);
        return Response.json(
          { error: "Failed to clone repository" },
          { status: 500 },
        );
      }
    }
  }

  // Persist sandbox state to the session record
  if (sessionId) {
    const nextState = sandbox.getState() as SandboxState;
    await updateSession(sessionId, {
      sandboxState: nextState,
      snapshotUrl: null,
      snapshotCreatedAt: null,
      lifecycleState: "active",
      lifecycleVersion: (sessionRecord?.lifecycleVersion ?? 0) + 1,
      lastActivityAt: new Date(),
    });

    if (sessionRecord) {
      try {
        await installSessionGlobalSkills({ sessionRecord, sandbox });
      } catch (error) {
        console.error(
          `Failed to install global skills for session ${sessionId}:`,
          error,
        );
      }
    }
  }

  const readyMs = Date.now() - startTime;

  return Response.json({
    createdAt: Date.now(),
    timeout: null, // local-fs sandboxes do not expire
    currentBranch: repoUrl ? currentBranch : undefined,
    mode: "local-fs",
    timing: { readyMs },
  });
}

export async function DELETE(req: Request) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("sessionId" in body) ||
    typeof (body as Record<string, unknown>).sessionId !== "string"
  ) {
    return Response.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const { sessionId } = body as { sessionId: string };

  const sessionContext = await requireOwnedSession({
    userId: authResult.userId,
    sessionId,
  });
  if (!sessionContext.ok) {
    return sessionContext.response;
  }

  const { sessionRecord } = sessionContext;

  // If there's no sandbox to stop, return success (idempotent)
  if (!canOperateOnSandbox(sessionRecord.sandboxState)) {
    return Response.json({ success: true, alreadyStopped: true });
  }

  // For local-fs, stop() is a no-op; just clear the state
  const clearedState = clearSandboxState(sessionRecord.sandboxState);
  await updateSession(sessionId, {
    sandboxState: clearedState,
    snapshotUrl: null,
    snapshotCreatedAt: null,
    lifecycleState:
      hasResumableSandboxState(clearedState) || !!sessionRecord.snapshotUrl
        ? "hibernated"
        : "provisioning",
    sandboxExpiresAt: null,
    hibernateAfter: null,
    lifecycleRunId: null,
    lifecycleError: null,
  });

  return Response.json({ success: true });
}
