import {
	Button,
	Host,
	HStack,
	Menu,
	Section,
	Image as SUIImage,
	Text as SUIText,
	VStack,
} from "@expo/ui/swift-ui";
import {
	controlSize,
	font,
	foregroundStyle,
} from "@expo/ui/swift-ui/modifiers";
import { Stack, useRouter } from "expo-router";
import { useColorScheme } from "react-native";
import { useWorkspaces } from "@/features/workspaces";
import { useDrawer } from "./drawer-content";

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
	const router = useRouter();
	const colorScheme = useColorScheme();
	const isDark = colorScheme === "dark";
	const headerFg = isDark ? "#fff" : "#000";
	const headerFgMuted = isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.5)";
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
		<Host
			style={{
				minWidth: 220,
				maxWidth: 280,
				minHeight: subtitle ? 42 : 34,
			}}
		>
			<Menu
				label={
					<VStack spacing={0}>
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
						{subtitle ? (
							<SUIText
								modifiers={[foregroundStyle(headerFgMuted), font({ size: 12 })]}
							>
								{subtitle}
							</SUIText>
						) : null}
					</VStack>
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
				<Section title="Workspace">
					<Button
						systemImage="info.circle"
						label="Workspace summary"
						onPress={() => router.navigate("/workspace-summary")}
					/>
				</Section>
			</Menu>
		</Host>
	);
}

export function MainHeader() {
	const { openDrawer } = useDrawer();
	const router = useRouter();

	return (
		<>
			<Stack.Screen.Title asChild>
				<HeaderTitleMenu />
			</Stack.Screen.Title>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button icon="list.bullet" onPress={openDrawer} />
			</Stack.Toolbar>
			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button
					icon="info.circle"
					onPress={() => router.navigate("/workspace-summary")}
				/>
			</Stack.Toolbar>
		</>
	);
}
