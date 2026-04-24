/**
 * Self-hosted auth uses API keys (Bearer) instead of OAuth cookies.
 * Browser `fetch` calls do not automatically send that header, so when
 * `NEXT_PUBLIC_SELF_HOSTED_API_KEY` is set (local dev only), we can opt into
 * custom fetch behavior for same-origin `/api/*` requests.
 */
export function installSelfHostedFetch(): void {
  if (typeof window === "undefined") {
    return;
  }

  const key = process.env.NEXT_PUBLIC_SELF_HOSTED_API_KEY;
  if (!key) {
    return;
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

    // Let route handlers read the SSO/login cookie as source of truth.
    // We intentionally avoid forcing Authorization here because it can
    // override the active browser login identity.
    return originalFetch(input, init);
  }

  const extras: Partial<typeof fetch> = {};
  if (typeof originalFetch.preconnect === "function") {
    extras.preconnect = originalFetch.preconnect.bind(originalFetch);
  }

  window.fetch = Object.assign(patchedFetch, extras) as typeof fetch;
}
