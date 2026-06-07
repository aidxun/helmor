import {
	DrawerContent,
	DrawerProvider,
	useDrawer,
} from "@/components/drawer-content";
import { DrawerLayout } from "@/components/drawer-layout";
import "@/global.css";
import "@/utils/fetch-polyfill";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Stack, useRouter } from "expo-router";
import {
	DarkTheme,
	DefaultTheme,
	ThemeProvider as RNTheme,
} from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaListener } from "react-native-safe-area-context";
import { Uniwind, useCSSVariable } from "uniwind";
import { ModelProvider } from "@/components/model-context";
import { WorkspaceProvider } from "@/features/workspaces";
import {
	MobileSettingsProvider,
	useMobileSettings,
} from "@/lib/mobile-settings";
import { useSystemBackgroundColor } from "@/utils/use-system-background-color";

const GLASS = isLiquidGlassAvailable();
const IS_ANDROID = process.env.EXPO_OS === "android";
function ThemeProvider(props: { children: React.ReactNode }) {
	const colorScheme = useColorScheme();
	const { settings } = useMobileSettings();
	const resolvedTheme =
		settings.themeMode === "system" ? colorScheme : settings.themeMode;

	useEffect(() => {
		Uniwind.setTheme(settings.themeMode);
	}, [settings.themeMode]);

	return (
		<RNTheme value={resolvedTheme === "dark" ? DarkTheme : DefaultTheme}>
			<SafeAreaListener onChange={({ insets }) => Uniwind.updateInsets(insets)}>
				{props.children}
			</SafeAreaListener>
		</RNTheme>
	);
}

export const unstable_settings = {
	anchor: "index",
};

export default function RootLayout() {
	return (
		<MobileSettingsProvider>
			<ThemeProvider>
				<KeyboardProvider>
					<ModelProvider>
						<WorkspaceProvider>
							<DrawerProvider>
								<RootDrawer />
							</DrawerProvider>
						</WorkspaceProvider>
					</ModelProvider>
					{process.env.EXPO_OS !== "ios" && <StatusBar style="auto" />}
				</KeyboardProvider>
			</ThemeProvider>
		</MobileSettingsProvider>
	);
}

function RootDrawer() {
	const router = useRouter();
	const { isOpen, openDrawer, closeDrawer } = useDrawer();

	useSystemBackgroundColor();

	return (
		<DrawerLayout
			open={isOpen}
			onOpen={openDrawer}
			onClose={closeDrawer}
			drawerContent={
				<DrawerContent
					onNavigate={(path) => {
						closeDrawer();
						router.replace(path, { withAnchor: true });
					}}
					onOpenModal={(path) => {
						router.navigate(path);
					}}
				/>
			}
		>
			<StackLayout />
		</DrawerLayout>
	);
}

function StackLayout() {
	const appForeground = useCSSVariable("--app-foreground") as string;
	const appBackground = useCSSVariable("--app-background") as string;

	return (
		<Stack
			screenOptions={{
				headerTransparent: GLASS,
				headerBackButtonDisplayMode: GLASS ? "minimal" : "default",
				headerTintColor: appForeground,
				headerShadowVisible: IS_ANDROID ? false : undefined,
				headerStyle: IS_ANDROID
					? {
							backgroundColor: appBackground,
						}
					: undefined,
			}}
		>
			<Stack.Screen
				name="index"
				dangerouslySingular
				options={{
					title: "Helmor",
					animation: "none",
					gestureEnabled: false,
					headerShown: false,
				}}
			/>

			<Stack.Screen
				name="chats"
				options={{
					title: "Sessions",
					animation: "none",
					headerLargeTitleShadowVisible: false,
					gestureEnabled: false,
				}}
			/>

			<Stack.Screen
				name="attachments"
				options={{
					title: "Add to Helmor",
					presentation: "formSheet",
					sheetAllowedDetents: [0.55],
					// following https://m3.material.io/components/bottom-sheets/specs
					sheetCornerRadius: IS_ANDROID ? 28 : undefined,
					sheetGrabberVisible: true,
					headerTransparent: GLASS,
					headerLargeTitleShadowVisible: false,
				}}
			/>

			<Stack.Screen
				name="model-picker"
				options={{
					title: "Composer",
					presentation: "formSheet",
					sheetAllowedDetents: "fitToContents",
					sheetCornerRadius: IS_ANDROID ? 28 : undefined,
					sheetGrabberVisible: true,
					headerTransparent: GLASS,
					headerLargeTitleShadowVisible: false,
				}}
			/>

			<Stack.Screen
				name="workspace-summary"
				options={{
					title: "Workspace",
					presentation: "formSheet",
					sheetAllowedDetents: [0.72],
					sheetCornerRadius: IS_ANDROID ? 28 : undefined,
					sheetGrabberVisible: true,
					headerTransparent: GLASS,
					headerLargeTitleShadowVisible: false,
				}}
			/>

			<Stack.Screen
				name="pair"
				options={{
					title: "Pair Desktop",
					presentation: "modal",
					headerShown: false,
				}}
			/>

			<Stack.Screen
				name="(settings)"
				options={{
					presentation: IS_ANDROID ? undefined : "modal",
					headerShown: false,
				}}
			/>
		</Stack>
	);
}
