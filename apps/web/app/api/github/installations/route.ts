import { NextResponse } from "next/server";
import { getInstallationsByUserId } from "@/lib/db/installations";
import { getInstallationManageUrl } from "@/lib/github/installation-url";
import { requireApiKey } from "@/lib/auth/api-key";

export async function GET() {
  const authResult = await requireApiKey();
  if (!authResult.ok) return authResult.response;
  const session = {
    authProvider: authResult.authProvider,
    user: { id: authResult.userId, username: authResult.username },
  };

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const installations = await getInstallationsByUserId(session.user.id);

    return NextResponse.json(
      installations.map((installation) => ({
        installationId: installation.installationId,
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
        repositorySelection: installation.repositorySelection,
        installationUrl: getInstallationManageUrl(
          installation.installationId,
          installation.installationUrl,
        ),
      })),
    );
  } catch (error) {
    console.error("Failed to fetch GitHub installations:", error);
    return NextResponse.json(
      { error: "Failed to fetch installations" },
      { status: 500 },
    );
  }
}
