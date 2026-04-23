/**
 * Minimal mock for 1game-server `/main/sso/verify` used by `apps/web` SSO flow.
 *
 * The web app calls: `${MBBS_API_BASE_URL}/sso/verify?ticket=...`
 * with `MBBS_API_BASE_URL` like `http://127.0.0.1:8840/main` (trailing slash optional).
 *
 * Usage:
 *   bun run mock:sso
 *
 * Environment (all optional):
 *   MOCK_SSO_PORT        — listen port (default 8840)
 *   MOCK_SSO_HOST        — bind address (default 127.0.0.1)
 *   MOCK_SSO_USER_ID     — fixed `data.id` in verify response (default dev-local-1)
 *   MOCK_SSO_USERNAME    — fixed username (default dev-user)
 *   MOCK_SSO_NICKNAME    — fixed nickname (default Local Dev)
 *   MOCK_SSO_AVATAR      — optional avatar URL in response
 */

interface MbbsVerifyPayload {
  id: number | string;
  username: string;
  nickname?: string;
  avatar?: string;
}

interface MbbsApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

function readEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

const host = process.env.MOCK_SSO_HOST ?? "127.0.0.1";
const port = readEnvInt("MOCK_SSO_PORT", 8840);
const verifyPath = "/main/sso/verify";

const payload: MbbsVerifyPayload = {
  id: process.env.MOCK_SSO_USER_ID ?? "dev-local-1",
  username: process.env.MOCK_SSO_USERNAME ?? "dev-user",
  nickname: process.env.MOCK_SSO_NICKNAME ?? "Local Dev",
};

const avatar = process.env.MOCK_SSO_AVATAR;
if (avatar) {
  payload.avatar = avatar;
}

const body: MbbsApiResponse<MbbsVerifyPayload> = {
  data: payload,
  success: true,
};

const json = JSON.stringify(body);

Bun.serve({
  hostname: host,
  port,
  fetch(req) {
    const url = new URL(req.url);
    if (req.method !== "GET" || url.pathname !== verifyPath) {
      return new Response("Not Found", { status: 404 });
    }
    if (!url.searchParams.get("ticket")) {
      return new Response("Missing ticket", { status: 400 });
    }
    return new Response(json, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    });
  },
});

console.log(
  `[mock-sso] listening on http://${host}:${port}${verifyPath} — user id: ${String(payload.id)} (set MOCK_SSO_USER_ID to override)`,
);
console.log(
  `[mock-sso] point MBBS_API_BASE_URL at http://${host}:${port}/main in apps/web/.env.local`,
);
