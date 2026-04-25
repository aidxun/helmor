import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	claudeRateLimitsQueryOptions,
	codexRateLimitsQueryOptions,
} from "@/lib/query-client";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import {
	parseRateLimitSnapshot,
	type RateLimitWindowDisplay,
} from "../context-usage-ring/parse";
import { LimitRow } from "../context-usage-ring/popover-parts";

type Props = {
	agentType: "claude" | "codex" | null;
	disabled?: boolean;
	className?: string;
};

const HOVER_OPEN_DELAY_MS = 180;
const HOVER_CLOSE_DELAY_MS = 80;

export function UsageStatsIndicator({ agentType, disabled, className }: Props) {
	const { settings } = useSettings();
	const [open, setOpen] = useState(false);
	const show =
		settings.showUsageStats &&
		(agentType === "claude" || agentType === "codex");

	const { data: codexRaw = null } = useQuery({
		...codexRateLimitsQueryOptions(),
		enabled: show && !disabled && agentType === "codex",
	});
	const { data: claudeResult = null } = useQuery(
		claudeRateLimitsQueryOptions(show && !disabled && agentType === "claude"),
	);

	const stats = useMemo(() => {
		const raw = agentType === "claude" ? claudeResult?.snapshot : codexRaw;
		return parseRateLimitSnapshot(raw);
	}, [agentType, claudeResult, codexRaw]);
	const errorMessage =
		agentType === "claude" && claudeResult?.error
			? usageStatsErrorMessage(claudeResult.error.kind)
			: null;

	if (!show || (!stats && !errorMessage)) return null;
	if (stats && !stats.primary && !stats.secondary && !errorMessage) return null;

	return (
		<HoverCard
			open={open}
			onOpenChange={setOpen}
			openDelay={HOVER_OPEN_DELAY_MS}
			closeDelay={HOVER_CLOSE_DELAY_MS}
		>
			<HoverCardTrigger asChild>
				<button
					type="button"
					disabled={disabled}
					aria-label="Usage Stats"
					className={cn(
						"flex size-7 cursor-pointer items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-50",
						className,
					)}
				>
					<UsageStatsGlyph
						primary={stats?.primary ?? null}
						secondary={stats?.secondary ?? null}
						hasError={!!errorMessage}
					/>
				</button>
			</HoverCardTrigger>
			<HoverCardContent side="top" align="end" className="w-[280px]">
				<div className="flex flex-col gap-3 px-1 py-1">
					<div className="flex items-center justify-between">
						<div className="text-[14px] font-semibold text-foreground">
							Usage Stats
						</div>
						<div className="text-[12px] text-muted-foreground">
							{agentType === "claude" ? "Claude" : "Codex"}
						</div>
					</div>
					{stats ? (
						<div className="flex flex-col gap-2.5">
							{stats.primary ? <LimitRow window={stats.primary} /> : null}
							{stats.secondary ? <LimitRow window={stats.secondary} /> : null}
							{stats.tertiary ? <LimitRow window={stats.tertiary} /> : null}
							{stats.extraWindows.map((entry) => (
								<LimitRow
									key={entry.id}
									window={{ ...entry.window, label: entry.title }}
								/>
							))}
						</div>
					) : null}
					{errorMessage ? (
						<div className="text-[12px] leading-5 text-muted-foreground">
							{errorMessage}
						</div>
					) : null}
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}

function UsageStatsGlyph({
	primary,
	secondary,
	hasError,
}: {
	primary: RateLimitWindowDisplay | null;
	secondary: RateLimitWindowDisplay | null;
	hasError?: boolean;
}) {
	const primaryWidth = hasError ? "100%" : `${primary?.usedPercent ?? 0}%`;
	const secondaryWidth = hasError ? "70%" : `${secondary?.usedPercent ?? 0}%`;
	const primaryClassName = hasError
		? "bg-destructive"
		: usageFillClassName(primary);
	const secondaryClassName = hasError
		? "bg-destructive/70"
		: usageFillClassName(secondary);

	return (
		<div
			className="flex h-[18px] w-[22px] flex-col justify-center gap-[3px]"
			aria-hidden
		>
			<div className="h-[7px] w-[22px] overflow-hidden rounded-full bg-muted">
				<div
					className={cn("h-full rounded-full", primaryClassName)}
					style={{ width: primaryWidth }}
				/>
			</div>
			<div className="h-[5px] w-[18px] overflow-hidden rounded-full bg-muted">
				<div
					className={cn("h-full rounded-full", secondaryClassName)}
					style={{ width: secondaryWidth }}
				/>
			</div>
		</div>
	);
}

function usageFillClassName(window: RateLimitWindowDisplay | null) {
	if (!window) return "bg-foreground/45";
	if (window.usedPercent >= 80) return "bg-destructive";
	if (window.usedPercent >= 60) return "bg-amber-500";
	return "bg-foreground/65";
}

function usageStatsErrorMessage(
	kind: "noCredentials" | "unauthorized" | "network" | "unknown",
) {
	if (kind === "noCredentials") {
		return "Claude usage is unavailable. Run `claude` once in Terminal, then try again.";
	}
	if (kind === "unauthorized") {
		return "Claude authorization needs to be refreshed. Run `claude` in Terminal to re-authenticate.";
	}
	if (kind === "network") {
		return "Claude usage could not be refreshed because the network request failed.";
	}
	return "Claude usage could not be refreshed.";
}
