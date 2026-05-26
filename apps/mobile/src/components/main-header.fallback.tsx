import { Stack, useRouter } from "expo-router";
import { ChevronDown, Info, Menu } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { useWorkspaces } from "@/features/workspaces";
import { useDrawer } from "./drawer-content";

function HeaderTitleMenu() {
	const {
		activeDesktop,
		isNewWorkspaceDraft,
		selectedWorkspace,
		selectedWorkspaceSessionTab,
		syncStatus,
	} = useWorkspaces();
	const router = useRouter();
	const title = isNewWorkspaceDraft
		? "New workspace"
		: (selectedWorkspaceSessionTab?.title ??
			selectedWorkspace?.title ??
			(activeDesktop
				? syncStatus === "syncing"
					? "Syncing"
					: "Workspaces"
				: "Helmor"));
	const subtitle =
		!isNewWorkspaceDraft && selectedWorkspaceSessionTab && selectedWorkspace
			? selectedWorkspace.title
			: undefined;

	return (
		<Pressable
			onPress={() => router.navigate("/workspace-summary")}
			accessibilityRole="button"
			className="flex-col items-center self-center rounded-md px-2 py-1 active:bg-muted"
		>
			<View className="max-w-[280px] flex-row items-center gap-1">
				<Text
					numberOfLines={1}
					className="text-[17px] font-semibold text-foreground"
				>
					{title}
				</Text>
				<Icon icon={ChevronDown} className="h-3 w-3 text-foreground" />
			</View>
			{subtitle ? (
				<Text
					numberOfLines={1}
					className="max-w-[280px] text-[12px] text-muted-foreground"
				>
					{subtitle}
				</Text>
			) : null}
		</Pressable>
	);
}

export function MainHeader() {
	const { openDrawer } = useDrawer();
	const router = useRouter();

	return (
		<>
			{process.env.EXPO_OS === "ios" ? (
				<Stack.Toolbar placement="left">
					<Stack.Toolbar.Button icon="list.bullet" onPress={openDrawer} />
				</Stack.Toolbar>
			) : (
				// TODO: Migrate to unified Toolbar support for Android in SDK 56
				<Stack.Toolbar placement="left" asChild>
					<Pressable
						onPress={openDrawer}
						accessibilityLabel="Open drawer"
						accessibilityRole="button"
						className="p-2 -ml-1 active:opacity-60"
					>
						<Icon icon={Menu} className="w-6 h-6 text-foreground" />
					</Pressable>
				</Stack.Toolbar>
			)}

			<Stack.Screen.Title asChild>
				<HeaderTitleMenu />
			</Stack.Screen.Title>

			{process.env.EXPO_OS === "ios" ? (
				<Stack.Toolbar placement="right">
					<Stack.Toolbar.Button
						icon="info.circle"
						onPress={() => router.navigate("/workspace-summary")}
					/>
				</Stack.Toolbar>
			) : (
				// TODO: Migrate to unified Toolbar support for Android in SDK 56
				<Stack.Toolbar placement="right" asChild>
					<Pressable
						onPress={() => router.navigate("/workspace-summary")}
						accessibilityLabel="Workspace summary"
						accessibilityRole="button"
						className="p-2 -mr-1 active:opacity-60"
					>
						<Icon icon={Info} className="w-6 h-6 text-foreground" />
					</Pressable>
				</Stack.Toolbar>
			)}
		</>
	);
}
