export interface Session {
  created: number;
  authProvider: "vercel" | "github" | "api-key";
  user: {
    id: string;
    username: string;
    email?: string | null;
    avatar?: string | null;
    name?: string | null;
  };
}

export interface SessionUserInfo {
  user: Session["user"] | undefined;
  authProvider?: "vercel" | "github" | "api-key";
  hasGitHub?: boolean;
  hasGitHubAccount?: boolean;
  hasGitHubInstallations?: boolean;
  vercelReconnectRequired?: boolean;
}
