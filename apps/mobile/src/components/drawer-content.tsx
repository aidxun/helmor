import "@/global.css";

import type { Href } from "expo-router";
import {
	ChevronDown,
	Circle,
	CircleCheck,
	CircleDashed,
	CircleDotDashed,
	CircleX,
	GitBranch,
	Laptop,
	type LucideIcon,
	MessageCircle,
	MonitorUp,
	Pin,
	Plus,
	RefreshCw,
} from "lucide-react-native";
import type React from "react";
import { createContext, use, useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
	FadeIn,
	FadeOut,
	LinearTransition,
	useAnimatedStyle,
	withTiming,
} from "react-native-reanimated";
import { Icon } from "@/components/icon";
import { TouchableGlass } from "@/components/touchable-glass";
import { SafeAreaView } from "@/components/tw";
import {
	type MobileWorkspaceGroup,
	type MobileWorkspaceRow,
	useWorkspaces,
	workspaceSubtitle,
} from "@/features/workspaces";
import { cn } from "@/utils/tailwind";

type DrawerContextValue = {
	isOpen: boolean;
	openDrawer: () => void;
	closeDrawer: () => void;
};

const GROUP_TONE_CLASS: Record<MobileWorkspaceGroup["tone"], string> = {
	pinned: "text-workspace-status-neutral",
	chats: "text-foreground",
	done: "text-workspace-status-done",
	review: "text-workspace-status-review",
	progress: "text-workspace-status-progress",
	backlog: "text-workspace-status-backlog",
	canceled: "text-workspace-status-canceled",
};

const DrawerContext = createContext<DrawerContextValue | null>(null);

export function DrawerProvider({ children }: { children: React.ReactNode }) {
	const [isOpen, setIsOpen] = useState(false);

	const openDrawer = useCallback(() => setIsOpen(true), []);
	const closeDrawer = useCallback(() => setIsOpen(false), []);

	return (
		<DrawerContext value={{ isOpen, openDrawer, closeDrawer }}>
			{children}
		</DrawerContext>
	);
}

export function useDrawer() {
	const context = use(DrawerContext);
	if (!context) {
		throw new Error("useDrawer must be used within a DrawerProvider");
	}
	return context;
}

function DrawerNavItem({
	label,
	onPress,
}: {
	label: string;
	onPress: () => void;
}) {
	return (
		<Pressable
			onPress={onPress}
			className="px-4 py-3 mx-2 rounded-[10px] active:bg-muted"
		>
			<Text className="text-base font-semibold text-foreground">{label}</Text>
		</Pressable>
	);
}

function DrawerWorkspaceGroup({
	group,
	activeWorkspaceId,
	collapsed,
	onOpenChange,
	onSelectWorkspace,
}: {
	group: MobileWorkspaceGroup;
	activeWorkspaceId: string | null;
	collapsed: boolean;
	onOpenChange: (open: boolean) => void;
	onSelectWorkspace: (workspaceId: string) => void;
}) {
	const chevronStyle = useAnimatedStyle(() => ({
		transform: [
			{
				rotateZ: withTiming(collapsed ? "-90deg" : "0deg", {
					duration: 160,
				}),
			},
		],
	}));

	return (
		<Animated.View layout={LinearTransition.duration(180)} className="pt-4">
			<Pressable
				onPress={() => onOpenChange(collapsed)}
				accessibilityRole="button"
				accessibilityState={{ expanded: !collapsed }}
				className="mx-2 flex-row items-center gap-2.5 rounded-[10px] py-0 pb-2 pl-2 pr-4 active:opacity-70"
			>
				<DrawerGroupIcon group={group} />
				<Text className="flex-1 text-base font-semibold text-foreground">
					{group.label}
				</Text>
				<Text className="text-sm font-semibold text-foreground">
					{group.rows.length}
				</Text>
				<Animated.View style={chevronStyle}>
					<Icon icon={ChevronDown} className="h-4 w-4 text-foreground" />
				</Animated.View>
			</Pressable>
			{collapsed ? null : (
				<Animated.View
					entering={FadeIn.duration(120)}
					exiting={FadeOut.duration(100)}
					layout={LinearTransition.duration(180)}
					className="gap-1"
				>
					{group.rows.map((workspace) => (
						<DrawerWorkspaceItem
							key={workspace.id}
							workspace={workspace}
							active={workspace.id === activeWorkspaceId}
							onPress={() => onSelectWorkspace(workspace.id)}
						/>
					))}
				</Animated.View>
			)}
		</Animated.View>
	);
}

function DrawerGroupIcon({ group }: { group: MobileWorkspaceGroup }) {
	const className = cn("h-5 w-5", GROUP_TONE_CLASS[group.tone]);

	if (group.id === "chats") {
		return (
			<Icon icon={MessageCircle} className={className} strokeWidth={1.9} />
		);
	}

	const iconByTone: Partial<Record<MobileWorkspaceGroup["tone"], LucideIcon>> =
		{
			pinned: Pin,
			done: CircleCheck,
			review: CircleDotDashed,
			progress: CircleDashed,
			backlog: Circle,
			canceled: CircleX,
		};
	const icon = iconByTone[group.tone] ?? Circle;

	return <Icon icon={icon} className={className} strokeWidth={1.9} />;
}

function DrawerWorkspaceModeIcon({
	mode,
}: {
	mode: MobileWorkspaceRow["mode"];
}) {
	if (mode === "chat") {
		return null;
	}

	const icon = mode === "local" ? Laptop : GitBranch;

	return (
		<Icon
			icon={icon}
			className="h-3.5 w-3.5 shrink-0 text-foreground"
			strokeWidth={1.9}
		/>
	);
}

function DrawerWorkspaceItem({
	workspace,
	onPress,
	active,
}: {
	workspace: MobileWorkspaceRow;
	onPress: () => void;
	active?: boolean;
}) {
	const subtitle = workspaceSubtitle(workspace);

	return (
		<Pressable
			onPress={onPress}
			className={cn(
				"ml-8 mr-2 rounded-[10px] px-3 py-2.5 active:bg-accent",
				active && "bg-accent",
			)}
		>
			<View
				className={cn(
					"flex-row items-start",
					workspace.mode !== "chat" && "gap-2.5",
				)}
			>
				{workspace.mode !== "chat" && (
					<View className="mt-1">
						<DrawerWorkspaceModeIcon mode={workspace.mode} />
					</View>
				)}
				<View className="flex-1 gap-0.5">
					<Text numberOfLines={1} className="text-[15px] text-foreground">
						{workspace.title}
					</Text>
					<Text numberOfLines={1} className="text-[12px] text-muted-foreground">
						{subtitle}
					</Text>
					{workspace.unreadSessionCount > 0 && (
						<View className="flex-row">
							<Text className="rounded-full bg-foreground px-1.5 py-0.5 text-[11px] font-medium text-background">
								{workspace.unreadSessionCount} unread
							</Text>
						</View>
					)}
				</View>
			</View>
		</Pressable>
	);
}

function DrawerWorkspaceEmpty({
	connected,
	syncing,
}: {
	connected: boolean;
	syncing: boolean;
}) {
	const icon = syncing ? RefreshCw : MonitorUp;
	return (
		<View className="mx-4 mt-6 items-center gap-2 rounded-[12px] border border-border bg-muted/40 px-4 py-5">
			<Icon icon={icon} className="h-5 w-5 text-muted-foreground" />
			<Text className="text-center text-[13px] font-medium text-foreground">
				{connected
					? syncing
						? "Syncing workspaces"
						: "No workspaces synced"
					: "No desktop connected"}
			</Text>
			<Text className="text-center text-[12px] leading-4 text-muted-foreground">
				{connected
					? "Refresh after the desktop finishes loading workspace data."
					: "Pair a desktop to show its workspaces here."}
			</Text>
		</View>
	);
}

export function DrawerContent({
	onNavigate,
	onOpenModal,
}: {
	onNavigate: (path: Href) => void;
	onOpenModal: (path: Href) => void;
}) {
	const {
		visibleGroups,
		selectedWorkspaceId,
		selectWorkspace,
		startNewWorkspace,
		activeDesktop,
		syncStatus,
	} = useWorkspaces();
	const [collapsedGroups, setCollapsedGroups] = useState<
		Partial<Record<MobileWorkspaceGroup["id"], boolean>>
	>({});

	const handleSelectWorkspace = useCallback(
		(workspaceId: string) => {
			selectWorkspace(workspaceId);
			onNavigate("/");
		},
		[onNavigate, selectWorkspace],
	);

	const handleStartNewWorkspace = useCallback(() => {
		startNewWorkspace();
		onNavigate("/");
	}, [onNavigate, startNewWorkspace]);

	const setGroupOpen = useCallback(
		(groupId: MobileWorkspaceGroup["id"], open: boolean) => {
			setCollapsedGroups((previous) => ({
				...previous,
				[groupId]: !open,
			}));
		},
		[],
	);

	return (
		<SafeAreaView
			// NOTE: Some issue with uniwind that prevents updates for this component.
			className="flex-1"
			edges={["top", "bottom", "left"]}
		>
			{/* Header */}
			<View className="px-4 pt-2 pb-3">
				<Text className="text-[28px] font-bold text-foreground">Helmor</Text>
				<Text numberOfLines={1} className="text-[13px] text-muted-foreground">
					{activeDesktop
						? `${activeDesktop.desktopName}${syncStatus === "syncing" ? " - syncing" : ""}`
						: "No desktop connected"}
				</Text>
			</View>

			{/* Nav + workspace list */}
			<ScrollView
				className="flex-1"
				contentContainerStyle={{ paddingBottom: 8 }}
			>
				<DrawerNavItem
					label="Desktops"
					onPress={() => onOpenModal("/(settings)/desktops")}
				/>

				{visibleGroups.length === 0 ? (
					<DrawerWorkspaceEmpty
						connected={Boolean(activeDesktop)}
						syncing={syncStatus === "syncing"}
					/>
				) : (
					visibleGroups.map((group) => (
						<DrawerWorkspaceGroup
							key={group.id}
							group={group}
							activeWorkspaceId={selectedWorkspaceId}
							collapsed={collapsedGroups[group.id] === true}
							onOpenChange={(open) => setGroupOpen(group.id, open)}
							onSelectWorkspace={handleSelectWorkspace}
						/>
					))
				)}
			</ScrollView>

			{/* Footer */}
			<View
				className="flex-row items-center px-4 py-3 border-t border-border"
				style={{ borderTopWidth: StyleSheet.hairlineWidth }}
			>
				<TouchableGlass
					onPress={() => onOpenModal("/(settings)/settings")}
					className="rounded-full p-2 flex-row items-center gap-2.5 active:opacity-60"
				>
					<View className="w-8 h-8 rounded-full bg-muted items-center justify-center">
						<Text className="text-[13px] font-semibold text-foreground">
							HM
						</Text>
					</View>
					<Text className="text-sm text-foreground">Helmor</Text>
				</TouchableGlass>
				<View className="flex-1" />
				<TouchableGlass
					onPress={handleStartNewWorkspace}
					accessibilityLabel="New workspace"
					className="h-10 rounded-full bg-foreground px-3.5 active:bg-muted flex-row items-center justify-center gap-1.5"
				>
					<Icon icon={Plus} className="h-4 w-4 text-background" />
					<Text className="text-[13px] font-semibold text-background">
						New workspace
					</Text>
				</TouchableGlass>
			</View>
		</SafeAreaView>
	);
}
