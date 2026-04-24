/**
 * Minimal mock for 1game-server `/main/sso/verify` used by `apps/web` SSO flow.
 *
 * The web app calls: `${MBBS_API_BASE_URL}/sso/verify?ticket=...`
 * with `MBBS_API_BASE_URL` like `http://127.0.0.1:8840/main` (trailing slash optional).
 *
 * Also serves a tiny **mock BBS** on `MOCK_BBS_PORT` (default 8841): `GET /` returns
 * static HTML that reads `/#/sso/jump?sso_callback_url=...` from `location.hash` and
 * redirects the browser to that URL with `ticket` appended — same behavior the real
 * BBS SPA would perform after login, so `NEXT_PUBLIC_BBS_BASE_URL=http://localhost:8841`
 * works without a separate frontend.
 *
 * Usage:
 *   bun run mock:sso
 *
 * Environment (all optional):
 *   MOCK_SSO_PORT        — verify API listen port (default 8840)
 *   MOCK_SSO_HOST        — verify API bind address (default 127.0.0.1)
 *   MOCK_BBS_PORT        — mock BBS static page port (default 8841)
 *   MOCK_BBS_HOST        — mock BBS bind address (default 127.0.0.1)
 *   MOCK_SSO_USER_ID     — fixed `data.id` in verify response (default dev-local-1)
 *   MOCK_SSO_USERNAME    — fixed username (default dev-user)
 *   MOCK_SSO_NICKNAME    — fixed nickname (default Local Dev)
 *   MOCK_SSO_AVATAR      — optional avatar URL in response
 *   MOCK_SSO_TICKET     — ticket appended by mock BBS redirect (default local-dev)
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

const verifyHost = process.env.MOCK_SSO_HOST ?? "127.0.0.1";
const verifyPort = readEnvInt("MOCK_SSO_PORT", 8840);
const verifyPath = "/main/sso/verify";

const bbsHost = process.env.MOCK_BBS_HOST ?? "127.0.0.1";
const bbsPort = readEnvInt("MOCK_BBS_PORT", 8841);
const mockTicket = process.env.MOCK_SSO_TICKET ?? "local-dev";

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

/** Minimal page: parse `/#/sso/jump?sso_callback_url=...` and redirect with ticket. */
const mockBbsJumpHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Mock SSO jump</title>
  </head>
  <body>
    <p id="s">Completing sign-in…</p>
    <script>
      (function () {
        var h = location.hash || "";
        var q = h.indexOf("?");
        var qs = q >= 0 ? h.slice(q + 1) : "";
        var sp = new URLSearchParams(qs);
        var cb = sp.get("sso_callback_url");
        var el = document.getElementById("s");
        if (!cb) {
          if (el) el.textContent = "Missing sso_callback_url in hash (expected #/sso/jump?...).";
          return;
        }
        try {
          var u = new URL(cb);
          u.searchParams.set("ticket", ${JSON.stringify(mockTicket)});
          location.replace(u.toString());
        } catch (e) {
          if (el) el.textContent = "Invalid sso_callback_url: " + cb;
        }
      })();
    </script>
  </body>
</html>
`;

Bun.serve({
  hostname: verifyHost,
  port: verifyPort,
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

Bun.serve({
  hostname: bbsHost,
  port: bbsPort,
  fetch(req) {
    if (req.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    return new Response(mockBbsJumpHtml, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  },
});

console.log(
  `[mock-sso] verify API http://${verifyHost}:${verifyPort}${verifyPath} — user id: ${String(payload.id)} (set MOCK_SSO_USER_ID to override)`,
);
console.log(
  `[mock-sso] mock BBS jump page http://${bbsHost}:${bbsPort}/ — redirects with ticket=${mockTicket}`,
);
console.log(
  `[mock-sso] point MBBS_API_BASE_URL at http://${verifyHost}:${verifyPort}/main in apps/web/.env.local`,
);
