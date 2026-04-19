import { describe, test } from "bun:test";

// Self-hosted mode: bashTool has been removed.
// bash-renderer.tsx is an intentional empty stub.
// These tests document that the component is no longer available.

describe("BashRenderer (self-hosted)", () => {
  test("bash tool is removed in self-hosted mode — no renderer exported", async () => {
    const mod = await import("./bash-renderer");
    // The module should not export BashRenderer in self-hosted mode
    const keys = Object.keys(mod);
    // Only the empty export {} is present; BashRenderer should not be exported
    const hasBashRenderer = keys.includes("BashRenderer");
    if (hasBashRenderer) {
      throw new Error(
        "BashRenderer should not be exported in self-hosted mode",
      );
    }
  });
});
