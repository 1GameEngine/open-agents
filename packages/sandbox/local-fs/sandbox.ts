/**
 * LocalFsSandbox — lightweight, process-isolated file system sandbox.
 *
 * Design goals for self-hosted deployments:
 *   - No external VM or container runtime required
 *   - Each session gets an isolated directory under SANDBOX_ROOT_DIR
 *   - All file operations are confined to that directory via path traversal checks
 *   - exec() is intentionally NOT supported (no bashTool in self-hosted mode)
 *   - git operations are handled by the web layer directly, not via exec()
 */

import * as fsSync from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import type { Dirent, ExecResult, Sandbox, SandboxStats } from "../interface";

/** Root directory under which all session sandboxes are created. */
const SANDBOX_ROOT_DIR =
  process.env.SANDBOX_ROOT_DIR ?? "/home/open-agents/sandboxes";

/**
 * Ensure the sandbox root directory exists.
 */
async function ensureSandboxRoot(): Promise<void> {
  await fs.mkdir(SANDBOX_ROOT_DIR, { recursive: true });
}

/**
 * Resolve and validate that a user-supplied path stays within the sandbox root.
 * Throws if the resolved path escapes the sandbox boundary.
 */
function resolveAndGuard(sandboxDir: string, userPath: string): string {
  const resolved = path.isAbsolute(userPath)
    ? path.resolve(userPath)
    : path.resolve(sandboxDir, userPath);

  // Normalise both sides before comparison to handle symlinks in the root path
  const normSandbox = path.resolve(sandboxDir);
  const normResolved = path.resolve(resolved);

  if (
    !normResolved.startsWith(normSandbox + path.sep) &&
    normResolved !== normSandbox
  ) {
    throw new Error(
      `Path traversal detected: "${userPath}" resolves outside sandbox boundary`,
    );
  }
  return normResolved;
}

/**
 * Convert fs.Stats to the SandboxStats interface.
 */
function toSandboxStats(stats: fsSync.Stats): SandboxStats {
  return {
    isFile: () => stats.isFile(),
    isDirectory: () => stats.isDirectory(),
    isSymbolicLink: () => stats.isSymbolicLink(),
    size: stats.size,
    mtimeMs: stats.mtimeMs,
  };
}

export interface LocalFsState {
  /** Discriminator for the sandbox factory */
  type: "local-fs";
  /** Absolute path to the session's isolated directory */
  sandboxDir: string;
  /** Working directory relative to sandboxDir (usually the repo root) */
  workingDirectory: string;
  /** Current git branch (informational only) */
  currentBranch?: string;
}

/**
 * Create a new LocalFsSandbox for a session.
 *
 * @param sessionId - Used to derive the sandbox directory name
 * @param workingDirectory - Absolute path to the working directory (must be inside sandboxDir)
 * @param currentBranch - Optional git branch name for display
 */
export async function createLocalFsSandbox(
  sessionId: string,
  workingDirectory?: string,
  currentBranch?: string,
): Promise<LocalFsSandbox> {
  await ensureSandboxRoot();
  const sandboxDir = path.join(SANDBOX_ROOT_DIR, `session_${sessionId}`);
  await fs.mkdir(sandboxDir, { recursive: true });

  const wd = workingDirectory ?? sandboxDir;
  await fs.mkdir(wd, { recursive: true });

  return new LocalFsSandbox({
    type: "local-fs",
    sandboxDir,
    workingDirectory: wd,
    currentBranch,
  });
}

/**
 * Reconnect to an existing LocalFsSandbox by its state.
 */
export function connectLocalFsSandbox(state: LocalFsState): LocalFsSandbox {
  return new LocalFsSandbox(state);
}

/**
 * Lightweight sandbox that provides file system isolation via directory confinement.
 * Does NOT support exec() — the bashTool is intentionally removed in self-hosted mode.
 */
export class LocalFsSandbox implements Sandbox {
  readonly type = "cloud" as const; // kept as "cloud" to satisfy SandboxType
  readonly workingDirectory: string;
  readonly currentBranch?: string;
  readonly environmentDetails =
    "Self-hosted local filesystem sandbox. File operations are confined to the session directory. Shell execution is not available.";

  private readonly sandboxDir: string;

  constructor(state: LocalFsState) {
    this.sandboxDir = state.sandboxDir;
    this.workingDirectory = state.workingDirectory;
    this.currentBranch = state.currentBranch;
  }

  // ─── File System Operations ───────────────────────────────────────────────

  async readFile(filePath: string, encoding: "utf-8"): Promise<string> {
    const resolved = resolveAndGuard(this.sandboxDir, filePath);
    return fs.readFile(resolved, encoding);
  }

  async writeFile(
    filePath: string,
    content: string,
    encoding: "utf-8",
  ): Promise<void> {
    const resolved = resolveAndGuard(this.sandboxDir, filePath);
    // Ensure parent directory exists
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    return fs.writeFile(resolved, content, encoding);
  }

  async stat(filePath: string): Promise<SandboxStats> {
    const resolved = resolveAndGuard(this.sandboxDir, filePath);
    const stats = await fs.stat(resolved);
    return toSandboxStats(stats);
  }

  async access(filePath: string): Promise<void> {
    const resolved = resolveAndGuard(this.sandboxDir, filePath);
    return fs.access(resolved);
  }

  async mkdir(
    dirPath: string,
    options?: { recursive?: boolean },
  ): Promise<void> {
    const resolved = resolveAndGuard(this.sandboxDir, dirPath);
    await fs.mkdir(resolved, options);
  }

  async readdir(
    dirPath: string,
    options: { withFileTypes: true },
  ): Promise<Dirent[]> {
    const resolved = resolveAndGuard(this.sandboxDir, dirPath);
    // fs.Dirent satisfies the Dirent interface exported from ../interface
    return fs.readdir(resolved, options) as Promise<Dirent[]>;
  }

  // ─── exec: intentionally not supported ───────────────────────────────────

  async exec(
    _command: string,
    _cwd: string,
    _timeoutMs: number,
    _options?: { signal?: AbortSignal },
  ): Promise<ExecResult> {
    return {
      success: false,
      exitCode: 1,
      stdout: "",
      stderr:
        "Shell execution is disabled in self-hosted mode. " +
        "The bashTool has been removed. Use file read/write tools instead.",
      truncated: false,
    };
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async stop(): Promise<void> {
    // No-op: the directory persists for the session lifetime.
    // Cleanup is handled by the session archival process.
  }

  /**
   * Return the state object for persistence in the database.
   */
  getState(): LocalFsState {
    return {
      type: "local-fs",
      sandboxDir: this.sandboxDir,
      workingDirectory: this.workingDirectory,
      currentBranch: this.currentBranch,
    };
  }
}
