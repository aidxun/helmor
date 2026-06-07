import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Stack, useRouter } from "expo-router";
import { useCSSVariable } from "uniwind";

const GLASS = isLiquidGlassAvailable();

export default function SettingsLayout() {
	const router = useRouter();

	const appForeground = useCSSVariable("--app-foreground") as string;

	return (
		<Stack
			screenOptions={{
				headerTransparent: GLASS,
				headerLargeTitleShadowVisible: false,
				headerBackButtonDisplayMode: GLASS ? "minimal" : "default",
				headerTintColor: appForeground,
				headerShadowVisible: false,
			}}
		>
			<Stack.Screen
				name="settings"
				options={{
					headerTransparent: true,
					headerShadowVisible: false,
					headerLargeStyle: {
						backgroundColor: "transparent",
					},
					contentStyle: {
						backgroundColor: "transparent",
					},
					scrollEdgeEffects: {
						top: "automatic",
					},
					headerLeft: () => null,
				}}
			>
				<Stack.Title large>Settings</Stack.Title>
				<Stack.Toolbar placement="left">
					<Stack.Toolbar.Button icon="xmark" onPress={() => router.back()} />
				</Stack.Toolbar>
			</Stack.Screen>
			<Stack.Screen
				name="desktops"
				options={{
					title: "Desktops",
				}}
			/>
		</Stack>
	);
}
