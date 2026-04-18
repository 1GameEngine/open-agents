import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/auth/api-key";
import { getUserGitHubToken } from "@/lib/github/user-token";
import { fetchGitHubOrgs } from "@/lib/github/api";

export async function GET() {
  const authResult = await requireApiKey();
  if (!authResult.ok) return authResult.response;
  const session = { authProvider: authResult.authProvider, user: { id: authResult.userId, username: authResult.username } };

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "GitHub not connected" },
      { status: 401 },
    );
  }

  const token = await getUserGitHubToken();

  if (!token) {
    return NextResponse.json(
      { error: "GitHub not connected" },
      { status: 401 },
    );
  }

  try {
    const orgs = await fetchGitHubOrgs(token);

    if (!orgs) {
      return NextResponse.json(
        { error: "Failed to fetch organizations" },
        { status: 500 },
      );
    }

    return NextResponse.json(orgs);
  } catch (error) {
    console.error("Error fetching organizations:", error);
    return NextResponse.json(
      { error: "Failed to fetch organizations" },
      { status: 500 },
    );
  }
}
