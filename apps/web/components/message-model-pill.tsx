"use client";

import type { WebAgentMessageMetadata } from "@/app/types";
import type { ModelOption } from "@/lib/model-options";
import {
  ProviderIcon,
  getProviderFromModelId,
  stripProviderPrefix,
} from "@/components/provider-icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePointsBalance } from "@/hooks/use-points-balance";
import { usdToPoints } from "@/lib/points/cost-to-points";

interface MessageModelPillProps {
  metadata: WebAgentMessageMetadata;
  modelOptions: ModelOption[];
}

/**
 * Format a points count for compact display (turn charge or balance).
 * e.g. 10000 → "10,000 pts"  |  500 → "500 pts"
 */
function formatPoints(pts: number): string {
  return pts.toLocaleString("en-US") + " pts";
}

/**
 * Compact pill shown on hover below an assistant message to indicate which
 * model produced the response.
 *
 * - Normal turn: shows the model display name.
 * - Variant turn: shows the variant label; tooltip reveals the resolved model.
 * - When the gateway reports a cost, the same USD amount is converted to
 *   billable points (matching server deduction) and shown next to the model name.
 * - When points balance is available, remaining quota is shown after that
 *   (e.g. "· 9,750 pts left") so you see per-turn charge and daily balance.
 */
export function MessageModelPill({
  metadata,
  modelOptions,
}: MessageModelPillProps) {
  const {
    selectedModelId,
    modelId: resolvedModelId,
    totalMessageCost,
  } = metadata;

  const { balance, dailyMax } = usePointsBalance();

  if (!selectedModelId && !resolvedModelId) {
    return null;
  }

  const selectedOption = selectedModelId
    ? modelOptions.find((o) => o.id === selectedModelId)
    : undefined;
  const resolvedOption = resolvedModelId
    ? modelOptions.find((o) => o.id === resolvedModelId)
    : undefined;

  const option = selectedOption ?? resolvedOption;
  const displayLabel =
    option?.shortLabel ?? option?.label ?? selectedModelId ?? resolvedModelId;

  if (!displayLabel) {
    return null;
  }

  const provider =
    option?.provider ??
    getProviderFromModelId(selectedModelId ?? resolvedModelId ?? "");

  const shortLabel = option
    ? (option.shortLabel ?? stripProviderPrefix(option.label, provider))
    : displayLabel;

  const isVariant = selectedOption?.isVariant ?? false;
  const hasCost =
    typeof totalMessageCost === "number" &&
    Number.isFinite(totalMessageCost) &&
    totalMessageCost >= 0;

  const turnPointsCharged = hasCost ? usdToPoints(totalMessageCost) : null;

  const hasBalance =
    typeof balance === "number" && typeof dailyMax === "number";

  // Colour the balance based on remaining ratio
  const balanceRatio = hasBalance ? balance / dailyMax : 1;
  const balanceColor =
    balanceRatio <= 0.1
      ? "text-red-400/70"
      : balanceRatio <= 0.3
        ? "text-yellow-400/70"
        : "text-muted-foreground/50";

  // For variants, tooltip shows the underlying model that actually ran.
  // When cost is available we also surface it in the tooltip so the exact
  // value is visible even if the compact display rounds.
  const tooltipParts: string[] = [];
  if (isVariant && resolvedModelId && resolvedModelId !== selectedModelId) {
    tooltipParts.push(resolvedOption?.label ?? resolvedModelId);
  }
  if (hasCost) {
    const usd = totalMessageCost as number;
    tooltipParts.push(
      `Points charged: ${formatPoints(usdToPoints(usd))}`,
      `Gateway cost: $${usd.toFixed(6)} USD`,
    );
  }
  if (hasBalance) {
    tooltipParts.push(
      `Remaining today: ${formatPoints(balance)} / ${formatPoints(dailyMax)}`,
    );
  }

  const pill = (
    <span className="inline-flex max-w-[420px] items-center gap-1 rounded px-1.5 py-0.5 text-[11px] leading-tight text-muted-foreground/50 transition-colors hover:text-muted-foreground/80">
      <ProviderIcon provider={provider} className="size-3 shrink-0" />
      <span className="truncate">{shortLabel}</span>
      {hasCost && turnPointsCharged !== null && (
        <>
          <span aria-hidden className="text-muted-foreground/30">
            ·
          </span>
          <span className="tabular-nums">
            {formatPoints(turnPointsCharged)}
          </span>
        </>
      )}
      {hasBalance && (
        <>
          <span aria-hidden className="text-muted-foreground/30">
            ·
          </span>
          <span className={`tabular-nums ${balanceColor}`}>
            {formatPoints(balance)} left
          </span>
        </>
      )}
    </span>
  );

  if (tooltipParts.length === 0) {
    return pill;
  }

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{pill}</TooltipTrigger>
      <TooltipContent side="top" align="start">
        <span className="text-xs whitespace-pre-line">
          {tooltipParts.join("\n")}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
