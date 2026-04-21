import { beforeEach, describe, expect, mock, test } from "bun:test";

// Self-hosted pr-deployment route only supports GitHub PR-based deployment lookup.
// Vercel project / branch-preview lookup has been removed.

const currentSessionRecord = {
  userId: "user-1",
  repoOwner: "vercel" as string | null,
  repoName: "open-harness" as string | null,
  branch: "feature/preview",
  prNumber: null as number | null,
};

let currentPullRequestDeploymentResult: {
  success: boolean;
  deploymentUrl?: string | null;
} = { success: false };

const getUserGitHubTokenMock = mock(async () => "repo-token");
const findLatestVercelDeploymentUrlForPullRequestMock = mock(
  async () => currentPullRequestDeploymentResult,
);

mock.module("@/app/api/sessions/_lib/session-context", () => ({
  requireAuthenticatedUser: async () => ({
    ok: true,
    userId: "user-1",
  }),
  requireOwnedSession: async () => ({
    ok: true,
    sessionRecord: currentSessionRecord,
  }),
}));

mock.module("@/lib/github/user-token", () => ({
  getUserGitHubToken: getUserGitHubTokenMock,
}));

mock.module("@/lib/github/client", () => ({
  findLatestVercelDeploymentUrlForPullRequest:
    findLatestVercelDeploymentUrlForPullRequestMock,
}));

const routeModulePromise = import("./route");

function createRouteContext(sessionId = "session-1") {
  return {
    params: Promise.resolve({ sessionId }),
  };
}

describe("/api/sessions/[sessionId]/pr-deployment", () => {
  beforeEach(() => {
    currentSessionRecord.repoOwner = "vercel";
    currentSessionRecord.repoName = "open-harness";
    currentSessionRecord.branch = "feature/preview";
    currentSessionRecord.prNumber = null;
    currentPullRequestDeploymentResult = { success: false };
    getUserGitHubTokenMock.mockClear();
    findLatestVercelDeploymentUrlForPullRequestMock.mockClear();
  });

  test("returns null when session has no PR number", async () => {
    const { GET } = await routeModulePromise;
    currentSessionRecord.prNumber = null;

    const response = await GET(
      new Request("http://localhost/api/sessions/session-1/pr-deployment"),
      createRouteContext(),
    );
    const body = (await response.json()) as { deploymentUrl: string | null };

    expect(response.status).toBe(200);
    expect(body.deploymentUrl).toBeNull();
    expect(findLatestVercelDeploymentUrlForPullRequestMock).toHaveBeenCalledTimes(0);
  });

  test("returns null when session has no repo info", async () => {
    const { GET } = await routeModulePromise;
    currentSessionRecord.repoOwner = null;
    currentSessionRecord.prNumber = 42;

    const response = await GET(
      new Request("http://localhost/api/sessions/session-1/pr-deployment"),
      createRouteContext(),
    );
    const body = (await response.json()) as { deploymentUrl: string | null };

    expect(response.status).toBe(200);
    expect(body.deploymentUrl).toBeNull();
  });

  test("uses the PR-based lookup when the session has a PR number", async () => {
    const { GET } = await routeModulePromise;
    currentSessionRecord.prNumber = 7;
    currentPullRequestDeploymentResult = {
      success: true,
      deploymentUrl: "https://pr-7.vercel.app",
    };

    const response = await GET(
      new Request("http://localhost/api/sessions/session-1/pr-deployment"),
      createRouteContext(),
    );
    const body = (await response.json()) as { deploymentUrl: string | null };

    expect(response.status).toBe(200);
    expect(body.deploymentUrl).toBe("https://pr-7.vercel.app");
    expect(findLatestVercelDeploymentUrlForPullRequestMock).toHaveBeenCalledWith({
      owner: "vercel",
      repo: "open-harness",
      prNumber: 7,
      token: "repo-token",
    });
  });

  test("returns null when GitHub deployment lookup fails", async () => {
    const { GET } = await routeModulePromise;
    currentSessionRecord.prNumber = 7;
    currentPullRequestDeploymentResult = { success: false };

    const response = await GET(
      new Request("http://localhost/api/sessions/session-1/pr-deployment"),
      createRouteContext(),
    );
    const body = (await response.json()) as { deploymentUrl: string | null };

    expect(response.status).toBe(200);
    expect(body.deploymentUrl).toBeNull();
  });

  test("returns null for mismatched prNumber query param", async () => {
    const { GET } = await routeModulePromise;
    currentSessionRecord.prNumber = 7;

    const response = await GET(
      new Request(
        "http://localhost/api/sessions/session-1/pr-deployment?prNumber=99",
      ),
      createRouteContext(),
    );
    const body = (await response.json()) as { deploymentUrl: string | null };

    expect(response.status).toBe(200);
    expect(body.deploymentUrl).toBeNull();
    expect(findLatestVercelDeploymentUrlForPullRequestMock).toHaveBeenCalledTimes(0);
  });

  test("does not return failedDeploymentUrl for PR-based lookups", async () => {
    const { GET } = await routeModulePromise;
    currentSessionRecord.prNumber = 7;
    currentPullRequestDeploymentResult = {
      success: true,
      deploymentUrl: "https://pr-7.vercel.app",
    };

    const response = await GET(
      new Request(
        "http://localhost/api/sessions/session-1/pr-deployment?prNumber=7",
      ),
      createRouteContext(),
    );
    const body = (await response.json()) as {
      deploymentUrl: string | null;
      failedDeploymentUrl?: string | null;
    };

    expect(response.status).toBe(200);
    expect(body.deploymentUrl).toBe("https://pr-7.vercel.app");
    // Self-hosted route does not expose failedDeploymentUrl
    expect(body.failedDeploymentUrl).toBeUndefined();
  });
});
