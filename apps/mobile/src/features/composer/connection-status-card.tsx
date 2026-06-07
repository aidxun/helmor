import { ActivityIndicator, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import type { ComposerConnectionBanner } from "./composer-format";

export function ConnectionStatusCard({
	banner,
}: {
	banner: ComposerConnectionBanner | null;
}) {
	if (!banner) return null;

	return (
		<Animated.View
			entering={FadeIn.duration(180)}
			exiting={FadeOut.duration(120)}
			className="px-1 pb-2"
		>
			<View className="min-h-[76px] flex-row items-center gap-3 rounded-[24px] border border-border/70 bg-card/95 px-4 py-3 shadow-float">
				<View className="h-9 w-9 items-center justify-center rounded-full bg-secondary">
					{banner.tone === "loading" ? (
						<ActivityIndicator
							size="small"
							colorClassName="tint-muted-foreground"
						/>
					) : (
						<View className="h-2.5 w-2.5 rounded-full bg-red-500" />
					)}
				</View>
				<View className="min-w-0 flex-1 gap-1">
					<Text
						numberOfLines={1}
						className="text-[12px] font-medium text-muted-foreground"
					>
						{banner.title}
					</Text>
					<Text
						numberOfLines={2}
						className="text-[17px] font-semibold leading-6 text-foreground"
					>
						{banner.message}
					</Text>
				</View>
			</View>
		</Animated.View>
	);
}
