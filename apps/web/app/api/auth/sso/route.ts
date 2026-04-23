import { type NextRequest, NextResponse } from "next/server";
import { createApiKey } from "@/lib/db/api-keys";
import { upsertUser } from "@/lib/db/users";
import { SELF_HOSTED_API_KEY_COOKIE_NAME } from "@/lib/session/constants";

const MBBS_API_BASE_URL = process.env.MBBS_API_BASE_URL;

/** 1game-server 接口的通用包装格式 */
interface MbbsApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

interface MbbsUserInfo {
  id: number | string;
  username: string;
  nickname?: string;
  avatar?: string;
}

/**
 * GET /api/auth/sso
 *
 * 1game SSO 登录入口。由 1game-server 中转页携带一次性 Ticket 跳转至此。
 * 验证 Ticket → 同步用户 → 生成 API Key → 写入 Cookie → 重定向至目标页面。
 *
 * Query params:
 *   ticket  - 由 1game-server 颁发的一次性短期票据（必填）
 *   redirect - 登录成功后的落地路径，默认 /sessions（可选）
 */
export async function GET(req: NextRequest) {
  const ticket = req.nextUrl.searchParams.get("ticket");
  const redirectTo = req.nextUrl.searchParams.get("redirect") || "/sessions";

  if (!ticket) {
    return NextResponse.redirect(new URL("/error?msg=missing_ticket", req.url));
  }

  if (!MBBS_API_BASE_URL) {
    console.error("[SSO] MBBS_API_BASE_URL is not configured");
    return NextResponse.redirect(
      new URL("/error?msg=sso_not_configured", req.url),
    );
  }

  // 1. 向 1game-server 后端验证 Ticket（服务端对服务端）
  let userInfo: MbbsUserInfo;
  try {
    // MBBS_API_BASE_URL 已含 /main/ 后缀（如 https://api.1game.design/main/）
    const verifyRes = await fetch(
      `${MBBS_API_BASE_URL.replace(/\/$/, "")}/sso/verify?ticket=${encodeURIComponent(ticket)}`,
    );
    if (!verifyRes.ok) {
      return NextResponse.redirect(
        new URL("/error?msg=invalid_ticket", req.url),
      );
    }
    // 1game-server 全局拦截器会把所有响应包装为 { data: ..., success: true }
    const verifyBody =
      (await verifyRes.json()) as MbbsApiResponse<MbbsUserInfo>;
    userInfo = verifyBody.data;
    if (!userInfo?.id) {
      return NextResponse.redirect(
        new URL("/error?msg=invalid_ticket", req.url),
      );
    }
  } catch {
    return NextResponse.redirect(
      new URL("/error?msg=sso_verify_failed", req.url),
    );
  }

  // 2. 在 open-agents 中同步用户，provider 标记为 "1game"
  const userId = await upsertUser({
    provider: "1game",
    externalId: `1game:${userInfo.id}`,
    accessToken: "",
    username: userInfo.username,
    name: userInfo.nickname,
    avatarUrl: userInfo.avatar,
  });

  // 3. 生成 24 小时有效的 API Key
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const { rawKey } = await createApiKey(userId, "1game-sso", expiresAt);

  // 4. 写入 Cookie 并重定向至目标页面
  const response = NextResponse.redirect(new URL(redirectTo, req.url));
  response.cookies.set(SELF_HOSTED_API_KEY_COOKIE_NAME, rawKey, {
    path: "/",
    maxAge: 86400, // 24 小时
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  });

  return response;
}
