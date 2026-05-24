import "@/global.css";

import type { Href } from "expo-router";
import {
	Circle,
	CircleCheck,
	CircleDashed,
	CircleDotDashed,
	CircleX,
	type LucideIcon,
	MessageCircle,
	Pin,
	Plus,
} from "lucide-react-native";
import type React from "react";
import { createContext, use, useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { TouchableGlass } from "@/components/touchable-glass";
import { SafeAreaView } from "@/components/tw";
import {
	type MobileWorkspaceGroup,
	type MobileWorkspaceRow,
	useWorkspaces,
	workspaceStatusLabel,
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
	chats: "text-muted-foreground",
	done: "text-workspace-status-done",
	review: "text-workspace-status-review",
	progress: "text-workspace-status-progress",
	backlog: "text-workspace-status-backlog",
	canceled: "text-workspace-status-canceled",
};

const STATUS_DOT_CLASS: Record<MobileWorkspaceRow["status"], string> = {
	"in-progress": "bg-workspace-status-progress",
	review: "bg-workspace-status-review",
	done: "bg-workspace-status-done",
	backlog: "bg-workspace-status-backlog",
	canceled: "bg-workspace-status-canceled",
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
			<Text className="text-base text-foreground">{label}</Text>
		</Pressable>
	);
}

function DrawerWorkspaceGroup({
	group,
	activeWorkspaceId,
	onSelectWorkspace,
}: {
	group: MobileWorkspaceGroup;
	activeWorkspaceId: string | null;
	onSelectWorkspace: (workspaceId: string) => void;
}) {
	return (
		<View className="pt-4">
			<View className="flex-row items-center gap-2 px-6 pb-1.5">
				<DrawerGroupIcon group={group} />
				<Text className="flex-1 text-[13px] font-semibold text-muted-foreground">
					{group.label}
				</Text>
				<Text className="text-[12px] text-muted-foreground">
					{group.rows.length}
				</Text>
			</View>
			{group.rows.map((workspace) => (
				<DrawerWorkspaceItem
					key={workspace.id}
					workspace={workspace}
					active={workspace.id === activeWorkspaceId}
					onPress={() => onSelectWorkspace(workspace.id)}
				/>
			))}
		</View>
	);
}

function DrawerGroupIcon({ group }: { group: MobileWorkspaceGroup }) {
	const className = cn("h-3.5 w-3.5", GROUP_TONE_CLASS[group.tone]);

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
	const status = workspaceStatusLabel(workspace.status);

	return (
		<Pressable
			onPress={onPress}
			className={cn(
				"px-4 py-2.5 mx-2 rounded-[10px] active:bg-accent",
				active && "bg-muted",
			)}
		>
			<View className="flex-row items-start gap-2.5">
				<View
					className={cn(
						"mt-1.5 h-2.5 w-2.5 rounded-full",
						STATUS_DOT_CLASS[workspace.status],
						!workspace.hasUnread && "opacity-70",
					)}
				/>
				<View className="flex-1 gap-0.5">
					<Text
						numberOfLines={1}
						className={cn(
							"text-[15px]",
							active ? "text-foreground" : "text-muted-foreground",
						)}
					>
						{workspace.title}
					</Text>
					<Text numberOfLines={1} className="text-[12px] text-muted-foreground">
						{subtitle}
					</Text>
					<View className="flex-row items-center gap-2">
						<Text className="text-[11px] text-muted-foreground">{status}</Text>
						{workspace.unreadSessionCount > 0 && (
							<Text className="rounded-full bg-foreground px-1.5 py-0.5 text-[11px] font-medium text-background">
								{workspace.unreadSessionCount} unread
							</Text>
						)}
					</View>
				</View>
			</View>
		</Pressable>
	);
}

export function DrawerContent({
	onNavigate,
	onOpenModal,
}: {
	onNavigate: (path: Href) => void;
	onOpenModal: (path: Href) => void;
}) {
	const { visibleGroups, selectedWorkspaceId, selectWorkspace } =
		useWorkspaces();

	const handleSelectWorkspace = useCallback(
		(workspaceId: string) => {
			selectWorkspace(workspaceId);
			onNavigate("/");
		},
		[onNavigate, selectWorkspace],
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
			</View>

			{/* Nav + workspace list */}
			<ScrollView
				className="flex-1"
				contentContainerStyle={{ paddingBottom: 8 }}
			>
				<DrawerNavItem label="Sessions" onPress={() => onNavigate("/chats")} />
				<DrawerNavItem
					label="Settings"
					onPress={() => {
						if (process.env.EXPO_OS === "android") {
							onNavigate("/(settings)/settings");
						}
						onOpenModal("/(settings)/settings");
					}}
				/>

				{visibleGroups.map((group) => (
					<DrawerWorkspaceGroup
						key={group.id}
						group={group}
						activeWorkspaceId={selectedWorkspaceId}
						onSelectWorkspace={handleSelectWorkspace}
					/>
				))}
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
					onPress={() => onNavigate("/")}
					className="w-10 h-10 rounded-full bg-foreground active:bg-muted items-center justify-center"
				>
					<Icon icon={Plus} className="w-6 h-6 text-background" />
				</TouchableGlass>
			</View>
		</SafeAreaView>
	);
}
