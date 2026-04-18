import type { SandboxState } from "@open-harness/sandbox";
import { SANDBOX_EXPIRES_BUFFER_MS } from "./config";

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function getSandboxType(state: unknown): string | undefined {
  if (!state || typeof state !== "object") return undefined;
  const t = (state as { type?: unknown }).type;
  return typeof t === "string" ? t : undefined;
}

/**
 * Returns true if the state represents a local-fs sandbox.
 * local-fs sandboxes are always considered "active" (no expiry concept).
 */
function isLocalFsState(state: unknown): boolean {
  return getSandboxType(state) === "local-fs";
}

function getSandboxExpiresAt(state: unknown): number | undefined {
  if (!state || typeof state !== "object") {
    return undefined;
  }

  const expiresAt = (state as { expiresAt?: unknown }).expiresAt;
  return typeof expiresAt === "number" ? expiresAt : undefined;
}

function getLegacySandboxId(state: unknown): string | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const sandboxId = (state as { sandboxId?: unknown }).sandboxId;
  return hasNonEmptyString(sandboxId) ? sandboxId : null;
}

export function getSessionSandboxName(sessionId: string): string {
  return `session_${sessionId}`;
}

export function getPersistentSandboxName(state: unknown): string | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const sandboxName = (state as { sandboxName?: unknown }).sandboxName;
  return hasNonEmptyString(sandboxName) ? sandboxName : null;
}

export function getResumableSandboxName(state: unknown): string | null {
  return getPersistentSandboxName(state) ?? getLegacySandboxId(state);
}

export function hasResumableSandboxState(state: unknown): boolean {
  // local-fs sandboxes are always resumable (identified by sandboxDir)
  if (isLocalFsState(state)) {
    const s = state as { sandboxDir?: unknown };
    return hasNonEmptyString(s.sandboxDir);
  }
  return getResumableSandboxName(state) !== null;
}

export function hasPausedSandboxState(state: unknown): boolean {
  return hasResumableSandboxState(state) && !hasRuntimeSandboxState(state);
}

/**
 * Type guard to check if a sandbox is active and ready to accept operations.
 * local-fs sandboxes are always active (no expiry).
 */
export function isSandboxActive(
  state: SandboxState | null | undefined,
): state is SandboxState {
  if (!state) return false;

  // local-fs sandboxes are always active
  if (isLocalFsState(state)) {
    return hasResumableSandboxState(state);
  }

  const expiresAt = getSandboxExpiresAt(state);
  if (expiresAt === undefined) {
    return false;
  }

  if (Date.now() >= expiresAt - SANDBOX_EXPIRES_BUFFER_MS) {
    return false;
  }

  return hasRuntimeState(state);
}

/**
 * Check if we can perform operations on a live sandbox session (stop, extend, etc.).
 */
export function canOperateOnSandbox(
  state: SandboxState | null | undefined,
): state is SandboxState {
  if (!state) return false;
  // local-fs sandboxes can always be operated on
  if (isLocalFsState(state)) return hasResumableSandboxState(state);
  return hasRuntimeState(state);
}

/**
 * Check if an unknown value represents sandbox state with live runtime data.
 */
export function hasRuntimeSandboxState(state: unknown): boolean {
  if (!state || typeof state !== "object") return false;

  // local-fs sandboxes always have runtime state
  if (isLocalFsState(state)) return hasResumableSandboxState(state);

  const expiresAt = getSandboxExpiresAt(state);
  if (expiresAt === undefined) {
    return false;
  }

  return hasResumableSandboxState(state);
}

export function isSandboxNotFoundError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("status code 404") ||
    normalized.includes("sandbox not found")
  );
}

/**
 * Check if an error message indicates the sandbox VM is permanently unavailable.
 */
export function isSandboxUnavailableError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("expected a stream of command data") ||
    normalized.includes("status code 410") ||
    normalized.includes("status code 404") ||
    normalized.includes("sandbox is stopped") ||
    normalized.includes("sandbox not found") ||
    normalized.includes("sandbox probe failed")
  );
}

function hasRuntimeState(state: SandboxState): boolean {
  const expiresAt = getSandboxExpiresAt(state);
  if (expiresAt === undefined) {
    return false;
  }

  return hasResumableSandboxState(state);
}

/**
 * Clear sandbox runtime state while preserving durable resume state when available.
 * For local-fs sandboxes, the state is always preserved (no expiry to clear).
 */
export function clearSandboxState(
  state: SandboxState | null | undefined,
): SandboxState | null {
  if (!state) return null;

  // local-fs: preserve full state (sandboxDir is the resume handle)
  if (isLocalFsState(state)) return state;

  const sandboxName = getPersistentSandboxName(state);
  const sandboxId = sandboxName ? null : getLegacySandboxId(state);

  return {
    type: state.type,
    ...(sandboxName ? { sandboxName } : {}),
    ...(sandboxId ? { sandboxId } : {}),
  } as SandboxState;
}

/**
 * Clear both runtime state and any saved resume handle.
 */
export function clearSandboxResumeState(
  state: SandboxState | null | undefined,
): SandboxState | null {
  if (!state) return null;

  return { type: state.type } as SandboxState;
}

/**
 * Clear sandbox state after an unavailable-sandbox error.
 * Hard 404s wipe the saved resume handle; other unavailable errors preserve it.
 */
export function clearUnavailableSandboxState(
  state: SandboxState | null | undefined,
  message: string,
): SandboxState | null {
  return isSandboxNotFoundError(message)
    ? clearSandboxResumeState(state)
    : clearSandboxState(state);
}
