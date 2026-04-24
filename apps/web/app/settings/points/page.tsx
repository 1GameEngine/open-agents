"use client";

import { PointsActivitySection } from "./points-activity-section";

export default function PointsActivityPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">积分</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        每日免费额度按 UTC
        自然日重置；以下为近期流水，可从「来源会话」进入对应对话。
      </p>
      <div className="mt-8">
        <PointsActivitySection />
      </div>
    </>
  );
}
