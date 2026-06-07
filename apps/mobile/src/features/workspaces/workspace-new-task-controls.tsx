import { MessageCircle } from "lucide-react-native";
import { Text, View } from "react-native";
import { Icon } from "@/components/icon";

export function NewChatStartPage() {
	return (
		<View className="w-full max-w-[380px] items-center gap-3 px-6">
			<View className="h-12 w-12 items-center justify-center rounded-2xl bg-foreground">
				<Icon icon={MessageCircle} className="h-5 w-5 text-background" />
			</View>
			<Text className="text-center text-[30px] font-bold text-foreground">
				New chat
			</Text>
			<Text className="max-w-[320px] text-center text-[14px] leading-5 text-muted-foreground">
				Start a standalone conversation or attach the first prompt to a
				repository from the composer.
			</Text>
		</View>
	);
}
