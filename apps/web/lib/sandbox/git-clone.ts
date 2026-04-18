/**
 * Server-side git clone helper for local-fs sandbox.
 *
 * In self-hosted mode, git operations are performed by the web server process
 * using child_process, instead of inside a Vercel cloud VM.
 *
 * Security notes:
 *   - repoUrl is validated to be a GitHub HTTPS URL before calling this function
 *   - branch names are sanitised to prevent shell injection
 *   - the target directory is always inside the sandbox boundary
 */

import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import type { LocalFsSandbox } from "@open-harness/sandbox/local-fs";

const execFileAsync = promisify(execFile);

/** Allowed characters in a git branch name (conservative allowlist) */
const SAFE_BRANCH_RE = /^[a-zA-Z0-9._\-/]+$/;

function sanitiseBranch(branch: string): string {
  if (!SAFE_BRANCH_RE.test(branch)) {
    throw new Error(`Unsafe branch name: "${branch}"`);
  }
  return branch;
}

/** Validate that the URL is a GitHub HTTPS URL */
function validateRepoUrl(repoUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(repoUrl);
  } catch {
    throw new Error(`Invalid repository URL: "${repoUrl}"`);
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") {
    throw new Error(
      `Only GitHub HTTPS URLs are supported (got: "${repoUrl}")`,
    );
  }
}

export interface CloneRepoParams {
  sandbox: LocalFsSandbox;
  repoUrl: string;
  branch: string;
  isNewBranch?: boolean;
  /** GitHub personal access token for private repos */
  githubToken?: string;
}

/**
 * Clone a GitHub repository into the sandbox working directory.
 * Returns the actual branch that was checked out.
 */
export async function cloneRepoToSandbox(
  params: CloneRepoParams,
): Promise<string> {
  const { sandbox, repoUrl, branch, isNewBranch = false, githubToken } = params;

  validateRepoUrl(repoUrl);
  const safeBranch = sanitiseBranch(branch);

  const targetDir = sandbox.workingDirectory;

  // Ensure target directory exists and is empty
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(targetDir);
  if (entries.length > 0) {
    // Already cloned — just ensure we're on the right branch
    await execFileAsync("git", ["-C", targetDir, "fetch", "--quiet", "origin"], {
      env: buildGitEnv(githubToken),
    });
    if (isNewBranch) {
      await execFileAsync(
        "git",
        ["-C", targetDir, "checkout", "-b", safeBranch],
        { env: buildGitEnv(githubToken) },
      );
    } else {
      await execFileAsync(
        "git",
        ["-C", targetDir, "checkout", safeBranch],
        { env: buildGitEnv(githubToken) },
      );
    }
    return safeBranch;
  }

  // Build authenticated URL if token is provided
  const cloneUrl = githubToken
    ? repoUrl.replace("https://", `https://x-access-token:${githubToken}@`)
    : repoUrl;

  if (isNewBranch) {
    // Clone default branch, then create new branch
    await execFileAsync(
      "git",
      ["clone", "--quiet", "--depth", "1", cloneUrl, targetDir],
      { env: buildGitEnv(githubToken) },
    );
    await execFileAsync(
      "git",
      ["-C", targetDir, "checkout", "-b", safeBranch],
      { env: buildGitEnv(githubToken) },
    );
  } else {
    // Clone specific branch
    await execFileAsync(
      "git",
      [
        "clone",
        "--quiet",
        "--depth",
        "1",
        "--branch",
        safeBranch,
        cloneUrl,
        targetDir,
      ],
      { env: buildGitEnv(githubToken) },
    );
  }

  return safeBranch;
}

function buildGitEnv(
  githubToken?: string,
): Record<string, string> {
  const env: Record<string, string> = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
  };
  if (githubToken) {
    env["GIT_ASKPASS"] = "echo";
    env["GIT_USERNAME"] = "x-access-token";
    env["GIT_PASSWORD"] = githubToken;
  }
  return env;
}
