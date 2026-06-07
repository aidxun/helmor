import {
	Button,
	Host,
	HStack,
	Menu,
	Section,
	Image as SUIImage,
	Text as SUIText,
} from "@expo/ui/swift-ui";
import {
	controlSize,
	font,
	foregroundStyle,
} from "@expo/ui/swift-ui/modifiers";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, useColorScheme, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolImage } from "@/components/symbol-image";
import { useWorkspaces } from "@/features/workspaces";
import { useDrawer } from "./drawer-content";

type MainHeaderProps = {
	showBottomBorder?: boolean;
};

function HeaderTitleMenu() {
	const {
		selectedWorkspace,
		selectedWorkspaceSessionTab,
		selectWorkspaceSession,
		sessionTabs,
		activeDesktop,
		isNewWorkspaceDraft,
		syncStatus,
	} = useWorkspaces();
	const colorScheme = useColorScheme();
	const isDark = colorScheme === "dark";
	const headerFg = isDark ? "#fff" : "#000";
	const title = isNewWorkspaceDraft
		? "New chat"
		: (selectedWorkspaceSessionTab?.title ??
			selectedWorkspace?.title ??
			(activeDesktop
				? syncStatus === "syncing"
					? "Syncing"
					: "Workspaces"
				: "Helmor"));

	return (
		<Host
			style={{
				minWidth: 220,
				maxWidth: 280,
				minHeight: 34,
			}}
		>
			<Menu
				label={
					<HStack spacing={4} alignment="center">
						<SUIText
							modifiers={[
								foregroundStyle(headerFg),
								font({ weight: "semibold", size: 17 }),
							]}
						>
							{title}
						</SUIText>
						<SUIImage systemName="chevron.down" size={10} color={headerFg} />
					</HStack>
				}
				modifiers={[controlSize("regular")]}
			>
				{sessionTabs.length > 0 ? (
					<Section title="Sessions">
						{sessionTabs.map((tab) => (
							<Button
								key={tab.id}
								systemImage={
									tab.id === selectedWorkspaceSessionTab?.id
										? "checkmark.circle"
										: "message"
								}
								label={tab.title}
								onPress={() => selectWorkspaceSession(tab.id)}
							/>
						))}
					</Section>
				) : null}
			</Menu>
		</Host>
	);
}

export function MainHeader({ showBottomBorder = false }: MainHeaderProps) {
	const { openDrawer } = useDrawer();
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const colorScheme = useColorScheme();
	const headerFg = colorScheme === "dark" ? "#fff" : "#000";

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
					<SymbolImage name="list.bullet" size={19} tintColor={headerFg} />
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
					<SymbolImage name="info.circle" size={20} tintColor={headerFg} />
				</Pressable>
			</View>
		</View>
	);
}
