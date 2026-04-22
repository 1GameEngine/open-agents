import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session/get-server-session";

const BBS_BASE_URL = process.env.NEXT_PUBLIC_BBS_BASE_URL;
const AGENTS_SSO_BASE_URL = process.env.NEXT_PUBLIC_AGENTS_SSO_BASE_URL;

/**
 * 根路由。
 * - 已登录：直接进入 /sessions。
 * - 未登录：构造 SSO 回调地址，跳转至 1game-server 中转页重新鉴权。
 *   中转页拿到 Ticket 后追加参数跳回 /api/auth/sso，完成无缝续期。
 */
export default async function Home() {
  const session = await getServerSession();

  if (session?.user) {
    redirect("/sessions");
  }

  // 将自身 SSO 路由地址作为回调传给 1game-server 中转页，
  // 中转页无需感知 agents 域名，只需在此地址后追加 ticket 参数即可。
  const ssoCallbackUrl = `${AGENTS_SSO_BASE_URL}?redirect=/sessions`;
  // 1game-server 使用 hash 路由，中转页路径为 /#/sso/jump
  const mbbsJumpUrl = `${BBS_BASE_URL}/#/sso/jump?sso_callback_url=${encodeURIComponent(ssoCallbackUrl)}`;
  redirect(mbbsJumpUrl);
}
