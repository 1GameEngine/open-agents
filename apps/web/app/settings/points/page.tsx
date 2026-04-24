import type { Metadata } from "next";
import { PointsLedgerSection } from "./points-ledger-section";

export const metadata: Metadata = {
  title: "每日积分",
  description: "查看每日免费积分余额与今日消耗明细。",
};

export default function PointsSettingsPage() {
  return <PointsLedgerSection />;
}
