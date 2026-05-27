import { useState } from "react";
import { View } from "react-native";
import { MainHeader } from "@/components/main-header";
import { WorkspaceChatSurface } from "@/features/workspaces";

export default function WorkspaceScreen() {
	const [showHeaderBorder, setShowHeaderBorder] = useState(false);

	return (
		<View className="flex-1 bg-background">
			<MainHeader showBottomBorder={showHeaderBorder} />
			<WorkspaceChatSurface onScrolledFromTopChange={setShowHeaderBorder} />
		</View>
	);
}
