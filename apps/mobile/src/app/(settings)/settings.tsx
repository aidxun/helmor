import * as Application from "expo-application";
import { type Href, Link } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import {
	Database,
	Info,
	MonitorSmartphone,
	RefreshCcw,
	Trash2,
	Vibrate,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { useWorkspaces } from "@/features/workspaces";
import {
	clearLocalCache,
	getLocalCacheSummary,
	type LocalCacheSummary,
} from "@/lib/local-cache/db";
import { type MobileThemeMode, useMobileSettings } from "@/lib/mobile-settings";

const THEME_OPTIONS: { value: MobileThemeMode; label: string }[] = [
	{ value: "system", label: "System" },
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
];

export default function SettingsScreen() {
	const {
		activeDesktop,
		desktopState,
		visibleGroups,
		repositories,
		syncStatus,
		syncError,
		refreshWorkspaces,
		removeDesktop,
		reloadDesktopConnections,
	} = useWorkspaces();
	const { settings, updateSettings } = useMobileSettings();
	const [cacheSummary, setCacheSummary] = useState<LocalCacheSummary | null>(
		null,
	);
	const [busyAction, setBusyAction] = useState<
		"sync" | "cache" | "desktops" | null
	>(null);

	const refreshCacheSummary = useCallback(async () => {
		setCacheSummary(await getLocalCacheSummary());
	}, []);

	useEffect(() => {
		let canceled = false;
		const timer = setTimeout(() => {
			void getLocalCacheSummary().then((summary) => {
				if (!canceled) setCacheSummary(summary);
			});
		}, 0);
		return () => {
			canceled = true;
			clearTimeout(timer);
		};
	}, []);

	const workspaceCount = useMemo(
		() => visibleGroups.reduce((sum, group) => sum + group.rows.length, 0),
		[visibleGroups],
	);

	const handleSync = useCallback(async () => {
		if (!activeDesktop) return;
		setBusyAction("sync");
		try {
			await refreshWorkspaces();
			await refreshCacheSummary();
		} finally {
			setBusyAction(null);
		}
	}, [activeDesktop, refreshCacheSummary, refreshWorkspaces]);

	const handleClearCache = useCallback(() => {
		Alert.alert("Clear local cache?", "Local snapshots will be removed.", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Clear cache",
				style: "destructive",
				onPress: () => {
					void (async () => {
						setBusyAction("cache");
						try {
							await clearLocalCache();
							await refreshCacheSummary();
						} finally {
							setBusyAction(null);
						}
					})();
				},
			},
		]);
	}, [refreshCacheSummary]);

	const handleForgetAllDesktops = useCallback(() => {
		if (desktopState.connections.length === 0) return;
		Alert.alert(
			"Forget all desktops?",
			"Paired desktop credentials will be removed.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Forget",
					style: "destructive",
					onPress: () => {
						void (async () => {
							setBusyAction("desktops");
							try {
								for (const desktop of desktopState.connections) {
									await removeDesktop(desktop.desktopId);
								}
								await reloadDesktopConnections();
								await refreshCacheSummary();
							} finally {
								setBusyAction(null);
							}
						})();
					},
				},
			],
		);
	}, [
		desktopState.connections,
		refreshCacheSummary,
		reloadDesktopConnections,
		removeDesktop,
	]);

	return (
		<ScrollView
			className="flex-1 bg-background"
			contentInsetAdjustmentBehavior="automatic"
			contentContainerClassName="px-5 pt-4 pb-10"
		>
			<Section title="Desktop">
				<View className="rounded-2xl border border-border bg-card p-4">
					<View className="flex-row items-start gap-3">
						<View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
							<Icon
								icon={MonitorSmartphone}
								className="h-5 w-5 text-foreground"
							/>
						</View>
						<View className="min-w-0 flex-1 gap-1">
							<Text className="text-[17px] font-semibold text-foreground">
								{activeDesktop?.desktopName ?? "No desktop connected"}
							</Text>
							<Text
								numberOfLines={1}
								className="text-[13px] text-muted-foreground"
							>
								{activeDesktop?.host ?? "Not connected"}
							</Text>
							<Text className="text-[13px] text-muted-foreground">
								{desktopStatusText(activeDesktop?.lastSyncedAt, syncStatus)}
							</Text>
						</View>
					</View>
					{syncError ? (
						<Text className="pt-3 text-[13px] leading-5 text-red-500">
							{syncError}
						</Text>
					) : null}
					<View className="mt-4 flex-row gap-2">
						<ActionButton
							label={busyAction === "sync" ? "Syncing" : "Sync now"}
							icon={RefreshCcw}
							disabled={!activeDesktop || busyAction !== null}
							onPress={handleSync}
						/>
						<SmallLinkButton href="/(settings)/desktops" label="Manage" />
					</View>
				</View>
			</Section>

			<Section title="Mobile">
				<View className="rounded-2xl border border-border bg-card">
					<View className="px-4 pt-4 pb-3">
						<Text className="text-[15px] font-semibold text-foreground">
							Appearance
						</Text>
						<View className="mt-3 flex-row rounded-xl bg-muted p-1">
							{THEME_OPTIONS.map((option) => (
								<Pressable
									key={option.value}
									onPress={() =>
										void updateSettings({ themeMode: option.value })
									}
									className={
										settings.themeMode === option.value
											? "flex-1 items-center rounded-lg bg-card px-3 py-2"
											: "flex-1 items-center rounded-lg px-3 py-2 active:opacity-70"
									}
								>
									<Text
										className={
											settings.themeMode === option.value
												? "text-[13px] font-semibold text-foreground"
												: "text-[13px] font-semibold text-muted-foreground"
										}
									>
										{option.label}
									</Text>
								</Pressable>
							))}
						</View>
					</View>
					<Divider />
					<SwitchRow
						icon={Vibrate}
						label="Haptic feedback"
						value={settings.hapticsEnabled}
						onValueChange={(hapticsEnabled) =>
							void updateSettings({ hapticsEnabled })
						}
					/>
				</View>
			</Section>

			<Section title="Local data">
				<View className="rounded-2xl border border-border bg-card">
					<InfoRow
						icon={Database}
						label="Cached data"
						detail={cacheSummaryText(cacheSummary)}
					/>
					<Divider />
					<InfoRow
						icon={Info}
						label="Current content"
						detail={`${workspaceCount} workspaces, ${repositories.length} repositories`}
					/>
					<Divider />
					<ActionRow
						icon={Trash2}
						label={busyAction === "cache" ? "Clearing cache" : "Clear cache"}
						disabled={busyAction !== null}
						onPress={handleClearCache}
						destructive
					/>
				</View>
			</Section>

			<Section title="About">
				<View className="rounded-2xl border border-border bg-card">
					<InfoRow
						icon={Info}
						label={Application.applicationName ?? "Helmor"}
						detail={`Version ${Application.nativeApplicationVersion ?? "unknown"} (${Application.nativeBuildVersion ?? "unknown"})`}
					/>
					<Divider />
					<ActionRow
						icon={Trash2}
						label={
							busyAction === "desktops"
								? "Forgetting desktops"
								: "Forget all desktops"
						}
						detail={`${desktopState.connections.length} paired desktop${
							desktopState.connections.length === 1 ? "" : "s"
						}`}
						disabled={
							desktopState.connections.length === 0 || busyAction !== null
						}
						onPress={handleForgetAllDesktops}
						destructive
					/>
				</View>
			</Section>
		</ScrollView>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<View className="mb-6 gap-2">
			<Text className="px-1 text-[13px] font-semibold uppercase text-muted-foreground">
				{title}
			</Text>
			{children}
		</View>
	);
}

function InfoRow({
	icon,
	label,
	detail,
}: {
	icon: LucideIcon;
	label: string;
	detail: string;
}) {
	return (
		<View className="flex-row items-center gap-3 px-4 py-3.5">
			<Icon icon={icon} className="h-5 w-5 text-foreground" />
			<View className="min-w-0 flex-1 gap-0.5">
				<Text className="text-[16px] text-foreground">{label}</Text>
				<Text className="text-[13px] leading-5 text-muted-foreground">
					{detail}
				</Text>
			</View>
		</View>
	);
}

function SwitchRow({
	icon,
	label,
	detail,
	value,
	onValueChange,
}: {
	icon: LucideIcon;
	label: string;
	detail?: string;
	value: boolean;
	onValueChange: (value: boolean) => void;
}) {
	return (
		<View className="flex-row items-center gap-3 px-4 py-3.5">
			<Icon icon={icon} className="h-5 w-5 text-foreground" />
			<View className="min-w-0 flex-1 gap-0.5">
				<Text className="text-[16px] text-foreground">{label}</Text>
				{detail ? (
					<Text className="text-[13px] leading-5 text-muted-foreground">
						{detail}
					</Text>
				) : null}
			</View>
			<Switch value={value} onValueChange={onValueChange} />
		</View>
	);
}

function ActionRow({
	icon,
	label,
	detail,
	disabled,
	onPress,
	destructive,
}: {
	icon: LucideIcon;
	label: string;
	detail?: string;
	disabled?: boolean;
	onPress: () => void;
	destructive?: boolean;
}) {
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			className="flex-row items-center gap-3 px-4 py-3.5 active:bg-muted disabled:opacity-50"
		>
			<Icon
				icon={icon}
				className={
					destructive ? "h-5 w-5 text-red-500" : "h-5 w-5 text-foreground"
				}
			/>
			<View className="min-w-0 flex-1 gap-0.5">
				<Text
					className={
						destructive
							? "text-[16px] text-red-500"
							: "text-[16px] text-foreground"
					}
				>
					{label}
				</Text>
				{detail ? (
					<Text className="text-[13px] leading-5 text-muted-foreground">
						{detail}
					</Text>
				) : null}
			</View>
		</Pressable>
	);
}

function ActionButton({
	icon,
	label,
	disabled,
	onPress,
}: {
	icon: LucideIcon;
	label: string;
	disabled?: boolean;
	onPress: () => void;
}) {
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			className="flex-row items-center gap-2 rounded-full bg-foreground px-4 py-2 active:opacity-70 disabled:opacity-50"
		>
			<Icon icon={icon} className="h-4 w-4 text-background" />
			<Text className="text-[14px] font-semibold text-background">{label}</Text>
		</Pressable>
	);
}

function SmallLinkButton({ href, label }: { href: Href; label: string }) {
	return (
		<Link href={href} asChild>
			<Pressable className="rounded-full bg-muted px-4 py-2 active:opacity-70">
				<Text className="text-[14px] font-semibold text-foreground">
					{label}
				</Text>
			</Pressable>
		</Link>
	);
}

function Divider() {
	return <View className="mx-4 h-px bg-border" />;
}

function desktopStatusText(
	lastSyncedAt: string | null | undefined,
	syncStatus: "idle" | "syncing" | "error",
): string {
	if (syncStatus === "syncing") return "Syncing now";
	if (syncStatus === "error") return "Last sync failed";
	if (!lastSyncedAt) return "Not synced yet";
	return `Last synced ${formatDate(lastSyncedAt)}`;
}

function cacheSummaryText(summary: LocalCacheSummary | null): string {
	if (!summary) return "Checking cache";
	return `${summary.desktopCount} desktop snapshots, ${summary.threadCount} threads, ${summary.selectionCount} selections`;
}

function formatDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(date);
}
