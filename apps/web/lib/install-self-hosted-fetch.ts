import { SELF_HOSTED_API_KEY_COOKIE_NAME } from "./session/constants";

/**
 * Self-hosted auth uses API keys (Bearer) instead of OAuth cookies.
 * Browser `fetch` calls do not automatically send that header, so when
 * `NEXT_PUBLIC_SELF_HOSTED_API_KEY` is set (local dev only), patch `fetch` to
 * attach `Authorization` for same-origin `/api/*` requests.
 */
export function installSelfHostedFetch(): void {
  if (typeof window === "undefined") {
    return;
  }

  const key = process.env.NEXT_PUBLIC_SELF_HOSTED_API_KEY;
  if (!key) {
    return;
  }

  // Full-page navigations (RSC) do not send `Authorization`. Mirror the key in
  // a first-party cookie so `getServerSession()` can authenticate chat pages.
  const cookieName = SELF_HOSTED_API_KEY_COOKIE_NAME;
  if (!document.cookie.includes(`${cookieName}=`)) {
    const encoded = encodeURIComponent(key);
    // Cookie Store API is not universally available; this is dev-only glue for RSC auth.
    // eslint-disable-next-line unicorn/no-document-cookie -- mirror API key for server components
    document.cookie = `${cookieName}=${encoded};path=/;max-age=31536000;samesite=lax`;
  }

  const w = window as Window & { __openAgentsFetchPatched?: boolean };
  if (w.__openAgentsFetchPatched) {
    return;
  }
  w.__openAgentsFetchPatched = true;

  const originalFetch = window.fetch.bind(window);

  function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    let apiPath: string | null = null;

    if (typeof input === "string") {
      apiPath = input.startsWith("/api/") ? input : null;
    } else if (input instanceof URL) {
      if (input.origin === window.location.origin) {
        const p = `${input.pathname}${input.search}`;
        apiPath = p.startsWith("/api/") ? p : null;
      }
    } else if (input instanceof Request) {
      try {
        const resolved = new URL(input.url, window.location.origin);
        if (resolved.origin === window.location.origin) {
          const p = `${resolved.pathname}${resolved.search}`;
          apiPath = p.startsWith("/api/") ? p : null;
        }
      } catch {
        apiPath = null;
      }
    }

    if (!apiPath) {
      return originalFetch(input, init);
    }

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${key}`);
    }

    if (input instanceof Request) {
      return originalFetch(
        new Request(input, {
          ...init,
          headers,
        }),
      );
    }

    return originalFetch(input, { ...init, headers });
  }

  window.fetch = Object.assign(patchedFetch, {
    preconnect: originalFetch.preconnect.bind(originalFetch),
  }) as typeof fetch;
}
