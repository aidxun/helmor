import { useRouter } from "expo-router";
import { ChevronDown, Info, Menu } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icon";
import { useWorkspaces } from "@/features/workspaces";
import { useDrawer } from "./drawer-content";

type MainHeaderProps = {
	showBottomBorder?: boolean;
};

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
		</Pressable>
	);
}

export function MainHeader({ showBottomBorder = false }: MainHeaderProps) {
	const { openDrawer } = useDrawer();
	const router = useRouter();
	const insets = useSafeAreaInsets();

	return (
		<View
			className="border-border/50 bg-background"
			style={{
				paddingTop: insets.top,
				borderBottomWidth: showBottomBorder ? StyleSheet.hairlineWidth : 0,
			}}
		>
			<View className="h-11 flex-row items-center px-3">
				<Pressable
					onPress={openDrawer}
					accessibilityLabel="Open drawer"
					accessibilityRole="button"
					className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
				>
					<Icon icon={Menu} className="w-6 h-6 text-foreground" />
				</Pressable>
				<View className="flex-1 items-center">
					<HeaderTitleMenu />
				</View>
				<Pressable
					onPress={() => router.navigate("/workspace-summary")}
					accessibilityLabel="Workspace summary"
					accessibilityRole="button"
					className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
				>
					<Icon icon={Info} className="w-6 h-6 text-foreground" />
				</Pressable>
			</View>
		</View>
	);
}
