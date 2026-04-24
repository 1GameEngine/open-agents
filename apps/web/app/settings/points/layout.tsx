import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Daily points",
  description: "View your daily points balance usage and session links.",
};

export default function PointsSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
