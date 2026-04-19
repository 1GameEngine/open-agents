import { describe, expect, test } from "bun:test";

// Self-hosted mode: vercel-cli-auth.ts is a no-op stub.
// The Vercel CLI is not used in self-hosted deployments.

const modulePromise = import("./vercel-cli-auth");

describe("vercel-cli-auth (self-hosted stub)", () => {
  test("getVercelCliSandboxSetup returns null auth and null projectLink", async () => {
    const { getVercelCliSandboxSetup } = await modulePromise;
    const setup = await getVercelCliSandboxSetup();
    expect(setup.auth).toBeNull();
    expect(setup.projectLink).toBeNull();
  });

  test("syncVercelCliAuthToSandbox is a no-op and resolves without error", async () => {
    const { syncVercelCliAuthToSandbox } = await modulePromise;
    // Should resolve without throwing
    await expect(syncVercelCliAuthToSandbox()).resolves.toBeUndefined();
  });
});
