import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const themeInitializationScript = `
(() => {
  const storageKey = "open-agents-theme";
  const darkModeMediaQuery = "(prefers-color-scheme: dark)";
  const storedTheme = window.localStorage.getItem(storageKey);

  const theme =
    storedTheme === "light" || storedTheme === "dark" || storedTheme === "system"
      ? storedTheme
      : "system";

  const resolvedTheme =
    theme === "system"
      ? window.matchMedia(darkModeMediaQuery).matches
        ? "dark"
        : "light"
      : theme;

  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
})();
`;

const metadataBase = process.env.APP_URL
  ? new URL(process.env.APP_URL)
  : new URL("http://localhost:3000");

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "Open Agents",
    template: "%s | Open Agents",
  },
  description:
    "Self-hosted AI coding agents powered by AI SDK, Gateway, and Workflow SDK.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans overflow-x-hidden antialiased`}
      >
        <script
          dangerouslySetInnerHTML={{ __html: themeInitializationScript }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
