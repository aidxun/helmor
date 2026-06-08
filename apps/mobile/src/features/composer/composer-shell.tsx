import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import type React from "react";
import { StyleSheet, View } from "react-native";

const GLASS = isLiquidGlassAvailable();

export function ComposerInputShell({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<View className="shadow-composer" style={[styles.shell]}>
			{GLASS ? (
				<GlassView
					isInteractive
					glassEffectStyle="regular"
					style={[styles.fill]}
				>
					{children}
				</GlassView>
			) : (
				<BlurView
					tint="systemChromeMaterial"
					intensity={92}
					style={[styles.fill]}
				>
					{children}
				</BlurView>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	shell: {
		borderRadius: 24,
		overflow: "hidden",
	},
	fill: {
		overflow: "hidden",
	},
});
