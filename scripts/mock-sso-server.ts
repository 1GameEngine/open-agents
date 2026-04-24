/**
 * Local mock for the full 1game SSO browser flow used by `apps/web`.
 *
 * 1. **Verify API** (default port 8840): `GET /main/sso/verify?ticket=...`
 *    — same as before; `apps/web` calls this from `/api/auth/sso`.
 * 2. **BBS jump page** (default port 8841): serves a tiny HTML shell that reads
 *    `#/sso/jump?sso_callback_url=...` (matching `app/page.tsx`) and redirects
 *    the browser to the callback with a fresh `ticket` query param.
 *
 * Usage:
 *   bun run mock:sso
 *
 * Environment (all optional):
 *   MOCK_SSO_PORT        — verify API port (default 8840)
 *   MOCK_SSO_BBS_PORT    — BBS / hash jump page port (default 8841)
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
const verifyPort = readEnvInt("MOCK_SSO_PORT", 8840);
const bbsPort = readEnvInt("MOCK_SSO_BBS_PORT", 8841);
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

const verifyJson = JSON.stringify({
  data: payload,
  success: true,
} satisfies MbbsApiResponse<MbbsVerifyPayload>);

/** Minimal client redirect: hash is never sent to the server. */
const bbsJumpHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Mock SSO jump</title>
</head>
<body>
  <p id="m">Redirecting…</p>
  <script>
(function () {
  var msg = document.getElementById("m");
  var hash = location.hash || "";
  if (!hash || hash.length < 2) {
    msg.textContent = "Missing hash. Open this origin from the app home redirect (expects #/sso/jump?sso_callback_url=…).";
    return;
  }
  var withoutHash = hash.slice(1);
  var q = withoutHash.indexOf("?");
  if (q < 0) {
    msg.textContent = "Missing query in hash.";
    return;
  }
  var qs = withoutHash.slice(q + 1);
  var params = new URLSearchParams(qs);
  var callback = params.get("sso_callback_url");
  if (!callback) {
    msg.textContent = "Missing sso_callback_url in hash.";
    return;
  }
  var ticket = "mock-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
  var target = new URL(callback);
  target.searchParams.set("ticket", ticket);
  location.replace(target.toString());
})();
  </script>
</body>
</html>`;

Bun.serve({
  hostname: host,
  port: verifyPort,
  fetch(req) {
    const url = new URL(req.url);
    if (req.method !== "GET" || url.pathname !== verifyPath) {
      return new Response("Not Found", { status: 404 });
    }
    if (!url.searchParams.get("ticket")) {
      return new Response("Missing ticket", { status: 400 });
    }
    return new Response(verifyJson, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    });
  },
});

Bun.serve({
  hostname: host,
  port: bbsPort,
  fetch(req) {
    if (req.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    return new Response(bbsJumpHtml, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  },
});

console.log(
  `[mock-sso] verify API: http://${host}:${verifyPort}${verifyPath} — user id: ${String(payload.id)}`,
);
console.log(
  `[mock-sso] BBS jump (hash): http://${host}:${bbsPort}/#/sso/jump?... — same ports as apps/web/.env`,
);
console.log(
  `[mock-sso] point MBBS_API_BASE_URL at http://${host}:${verifyPort}/main`,
);
