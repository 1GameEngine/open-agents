import { describe, expect, test } from "bun:test";

// Self-hosted mode: /api/vercel/repo-projects is not supported.
// The route returns 410 Gone to indicate the endpoint has been removed.

const routeModulePromise = import("./route");

describe("/api/vercel/repo-projects", () => {
  test("returns 410 Gone in self-hosted mode (Vercel project linking removed)", async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(
      new Request(
        "http://localhost/api/vercel/repo-projects?repoOwner=vercel&repoName=open-harness",
      ),
    );
    expect(response.status).toBe(410);
  });
});
