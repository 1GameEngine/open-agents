import { cookies, headers } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  SELF_HOSTED_API_KEY_COOKIE_NAME,
} from "./constants";
import { getSessionFromRawApiKey } from "./api-key-session";
import { getSessionFromCookie } from "./server";
import { cache } from "react";

async function getSessionFromSelfHostedApiKeyCookie() {
  const store = await cookies();
  const rawKey = store.get(SELF_HOSTED_API_KEY_COOKIE_NAME)?.value;
  if (!rawKey) {
    return undefined;
  }

  return getSessionFromRawApiKey(rawKey);
}

async function getSessionFromAuthorizationHeader() {
  const headerStore = await headers();
  const authorization = headerStore.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return undefined;
  }

  const rawKey = authorization.slice("Bearer ".length).trim();
  return getSessionFromRawApiKey(rawKey);
}

export const getServerSession = cache(async () => {
  const store = await cookies();
  const cookieValue = store.get(SESSION_COOKIE_NAME)?.value;
  const fromCookie = await getSessionFromCookie(cookieValue);
  if (fromCookie) {
    return fromCookie;
  }

  const fromApiKeyCookie = await getSessionFromSelfHostedApiKeyCookie();
  if (fromApiKeyCookie) {
    return fromApiKeyCookie;
  }

  return getSessionFromAuthorizationHeader();
});
