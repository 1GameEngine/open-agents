import type { NextRequest } from "next/server";
import type { Session } from "./types";
import {
  SELF_HOSTED_API_KEY_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "./constants";
import { decryptJWE } from "@/lib/jwe/decrypt";
import { getSessionFromRawApiKey } from "./api-key-session";

export async function getSessionFromCookie(
  cookieValue?: string,
): Promise<Session | undefined> {
  if (cookieValue) {
    const decrypted = await decryptJWE<Session>(cookieValue);
    if (decrypted) {
      return {
        created: decrypted.created,
        authProvider: decrypted.authProvider,
        user: decrypted.user,
      };
    }
  }
}

export async function getSessionFromReq(
  req: NextRequest,
): Promise<Session | undefined> {
  const authorization = req.headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer ")) {
    const rawKey = authorization.slice("Bearer ".length).trim();
    const fromBearer = await getSessionFromRawApiKey(rawKey);
    if (fromBearer) {
      return fromBearer;
    }
  }

  const apiKeyCookie = req.cookies.get(SELF_HOSTED_API_KEY_COOKIE_NAME)?.value;
  if (apiKeyCookie) {
    const fromApiKeyCookie = await getSessionFromRawApiKey(apiKeyCookie);
    if (fromApiKeyCookie) {
      return fromApiKeyCookie;
    }
  }

  const cookieValue = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  return getSessionFromCookie(cookieValue);
}
