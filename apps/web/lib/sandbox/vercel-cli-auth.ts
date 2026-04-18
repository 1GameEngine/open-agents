/**
 * Vercel CLI authentication helpers — removed in self-hosted mode.
 *
 * The Vercel CLI is not used in self-hosted deployments. This file is kept
 * as a stub so that any remaining import sites compile without errors.
 */
import "server-only";

export interface VercelCliProjectLink {
  orgId: string;
  projectId: string;
  projectName?: string;
}

export interface VercelCliAuthConfig {
  token: string;
  expiresAt: number;
}

export interface VercelCliSandboxSetup {
  auth: VercelCliAuthConfig | null;
  projectLink: VercelCliProjectLink | null;
}

/** Always returns null auth and null project link in self-hosted mode. */
export async function getVercelCliSandboxSetup(): Promise<VercelCliSandboxSetup> {
  return { auth: null, projectLink: null };
}

/** No-op in self-hosted mode. */
export async function syncVercelCliAuthToSandbox(): Promise<void> {
  // Not applicable in self-hosted mode
}
