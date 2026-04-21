import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

interface TestSessionRecord {
  id: string;
  userId: string;
  lifecycleVersion: number;
  sandboxState: { type: "local-fs"; sandboxDir: string; currentBranch: string } | null;
  vercelProjectId: string | null;
  vercelProjectName: string | null;
  vercelTeamId: string | null;
  globalSkillRefs: Array<{ source: string; skillName: string }>;
  snapshotUrl: string | null;
}

interface KickCall {
  sessionId: string;
  reason: string;
}

const kickCalls: KickCall[] = [];
const updateCalls: Array<{
  sessionId: string;
  patch: Record<string, unknown>;
}> = [];
const cloneCalls: Array<{
  repoUrl: string;
  branch: string;
  isNewBranch: boolean;
}> = [];
const execCalls: Array<{ command: string }> = [];

let sessionRecord: TestSessionRecord;
let currentGitHubToken: string | null;
let cloneError: Error | null;

mock.module("@/lib/auth/api-key", () => ({
  requireApiKey: async () => ({
    ok: true as const,
    userId: "user-1",
    username: "nico",
    authProvider: "api-key" as const,
  }),
}));

mock.module("@/lib/db/accounts", () => ({
  getGitHubAccount: async () => ({
    externalUserId: "12345",
    username: "nico-gh",
    accessToken: "token",
    refreshToken: null,
    expiresAt: null,
  }),
}));

mock.module("@/lib/github/user-token", () => ({
  getUserGitHubToken: async () => currentGitHubToken,
}));

mock.module("@/lib/db/sessions", () => ({
  getChatsBySessionId: async () => [],
  getSessionById: async () => sessionRecord,
  updateSession: async (sessionId: string, patch: Record<string, unknown>) => {
    updateCalls.push({ sessionId, patch });
    return { ...sessionRecord, ...patch };
  },
}));

mock.module("@/lib/sandbox/lifecycle-kick", () => ({
  kickSandboxLifecycleWorkflow: (input: KickCall) => {
    kickCalls.push(input);
  },
}));

// Mock the local-fs sandbox factory
mock.module("@open-harness/sandbox/local-fs", () => ({
  createLocalFsSandbox: async (
    sessionId: string,
    workingDirectory: string | undefined,
    branch: string,
  ) => ({
    sandboxDir: `/var/sandboxes/session_${sessionId}`,
    workingDirectory: workingDirectory ?? `/var/sandboxes/session_${sessionId}`,
    getState: () => ({
      type: "local-fs" as const,
      sandboxDir: `/var/sandboxes/session_${sessionId}`,
      currentBranch: branch,
    }),
    exec: async (command: string) => {
      execCalls.push({ command });
      return { success: true, exitCode: 0, stdout: "/root", stderr: "", truncated: false };
    },
    writeFile: async () => {},
    stop: async () => {},
  }),
  connectLocalFsSandbox: (state: { sandboxDir: string; currentBranch: string }) => ({
    sandboxDir: state.sandboxDir,
    workingDirectory: state.sandboxDir,
    getState: () => ({ type: "local-fs" as const, ...state }),
    exec: async (command: string) => {
      execCalls.push({ command });
      return { success: true, exitCode: 0, stdout: "", stderr: "", truncated: false };
    },
    writeFile: async () => {},
    stop: async () => {},
  }),
}));

// Mock git-clone helper
mock.module("@/lib/sandbox/git-clone", () => ({
  cloneRepoToSandbox: async (input: {
    repoUrl: string;
    branch: string;
    isNewBranch: boolean;
  }) => {
    cloneCalls.push(input);
    if (cloneError) throw cloneError;
    return input.branch;
  },
}));

mock.module("@open-harness/agent", () => ({
  discoverSkills: async () => [],
  installGlobalSkills: async () => {},
}));

const routeModulePromise = import("./route");

describe("/api/sandbox lifecycle kicks", () => {
  beforeEach(() => {
    kickCalls.length = 0;
    updateCalls.length = 0;
    cloneCalls.length = 0;
    execCalls.length = 0;
    currentGitHubToken = null;
    cloneError = null;
    sessionRecord = {
      id: "session-1",
      userId: "user-1",
      lifecycleVersion: 3,
      sandboxState: null,
      vercelProjectId: null,
      vercelProjectName: null,
      vercelTeamId: null,
      globalSkillRefs: [],
      snapshotUrl: null,
    };
  });

  test("creates a local-fs sandbox and returns mode=local-fs", async () => {
    const { POST } = await routeModulePromise;

    const request = new Request("http://localhost/api/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "session-1" }),
    });

    const response = await POST(request);
    expect(response.ok).toBe(true);

    const payload = (await response.json()) as { mode: string; timeout: null };
    expect(payload.mode).toBe("local-fs");
    expect(payload.timeout).toBeNull();
  });

  test("persists local-fs sandbox state to session after creation", async () => {
    const { POST } = await routeModulePromise;

    const request = new Request("http://localhost/api/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "session-1" }),
    });

    await POST(request);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]?.patch).toMatchObject({
      sandboxState: { type: "local-fs" },
      lifecycleState: "active",
    });
  });

  test("clones repo when repoUrl is provided", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      new Request("http://localhost/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "session-1",
          repoUrl: "https://github.com/acme/repo",
          branch: "feature/test",
        }),
      }),
    );

    expect(response.ok).toBe(true);
    expect(cloneCalls).toHaveLength(1);
    expect(cloneCalls[0]).toMatchObject({
      repoUrl: "https://github.com/acme/repo",
      branch: "feature/test",
    });
  });

  test("returns 500 when repo clone fails", async () => {
    const { POST } = await routeModulePromise;
    cloneError = new Error("git clone failed");

    const response = await POST(
      new Request("http://localhost/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "session-1",
          repoUrl: "https://github.com/acme/repo",
        }),
      }),
    );

    expect(response.status).toBe(500);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("clone");
  });

  test("resumes existing local-fs sandbox when sandboxState is already set", async () => {
    sessionRecord.sandboxState = {
      type: "local-fs",
      sandboxDir: "/var/sandboxes/session_session-1",
      currentBranch: "main",
    };

    const { POST } = await routeModulePromise;

    const response = await POST(
      new Request("http://localhost/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "session-1" }),
      }),
    );

    expect(response.ok).toBe(true);
    // No clone should happen on resume
    expect(cloneCalls).toHaveLength(0);
  });

  test("rejects unsupported sandbox types", async () => {
    const { POST } = await routeModulePromise;

    const request = new Request("http://localhost/api/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "session-1",
        sandboxType: "invalid",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe("Invalid sandbox type");
  });
});
