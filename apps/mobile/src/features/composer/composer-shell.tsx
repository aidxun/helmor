import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import type React from "react";
import { StyleSheet, useColorScheme, View } from "react-native";

const GLASS = isLiquidGlassAvailable();

export function ComposerInputShell({
	children,
}: {
	children: React.ReactNode;
}) {
	const colorScheme = useColorScheme();
	const backgroundColor =
		colorScheme === "dark" ? "rgba(34,34,34,0.96)" : "rgba(255,255,255,0.97)";

	return (
		<View
			className="shadow-composer"
			style={[
				styles.shell,
				{
					backgroundColor,
					borderColor:
						colorScheme === "dark"
							? "rgba(255,255,255,0.14)"
							: "rgba(0,0,0,0.08)",
				},
			]}
		>
			{GLASS ? (
				<GlassView
					isInteractive
					glassEffectStyle="regular"
					style={[styles.fill, { backgroundColor }]}
				>
					{children}
				</GlassView>
			) : (
				<BlurView
					tint="systemChromeMaterial"
					intensity={92}
					style={[styles.fill, { backgroundColor }]}
				>
					{children}
				</BlurView>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	shell: {
		borderCurve: "continuous",
		borderRadius: 28,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	fill: {
		overflow: "hidden",
	},
});
