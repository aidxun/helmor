import { Check, RefreshCcw, Trash2 } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { useWorkspaces } from "@/features/workspaces";

export default function DesktopsScreen() {
	const {
		desktopState,
		activeDesktop,
		setActiveDesktop,
		removeDesktop,
		refreshWorkspaces,
		syncStatus,
		syncError,
	} = useWorkspaces();

	return (
		<ScrollView
			className="flex-1 bg-background"
			contentInsetAdjustmentBehavior="automatic"
			contentContainerClassName="px-5 py-5 gap-4"
		>
			<View className="gap-2">
				<Text className="text-[28px] font-bold text-foreground">Desktops</Text>
				<Text className="text-[15px] leading-5 text-muted-foreground">
					Pair Helmor desktop apps by scanning their QR codes.
				</Text>
			</View>

			{desktopState.connections.length === 0 ? (
				<View className="rounded-2xl border border-border bg-card p-4">
					<Text className="text-[16px] font-semibold text-foreground">
						No desktops connected
					</Text>
					<Text className="pt-1 text-[14px] leading-5 text-muted-foreground">
						Open Mobile Access in the desktop app, then scan the QR code with
						the iPhone camera.
					</Text>
				</View>
			) : null}

			{desktopState.connections.map((desktop) => {
				const isActive = activeDesktop?.desktopId === desktop.desktopId;
				return (
					<View
						key={desktop.desktopId}
						className="rounded-2xl border border-border bg-card p-4"
					>
						<View className="flex-row items-start gap-3">
							<View className="flex-1 gap-1">
								<Text className="text-[17px] font-semibold text-foreground">
									{desktop.desktopName}
								</Text>
								<Text className="text-[13px] text-muted-foreground">
									{desktop.hosts[0] ?? "unknown"}:{desktop.port}
								</Text>
								<Text
									numberOfLines={1}
									className="text-[12px] text-muted-foreground"
								>
									{desktop.hostKeyFingerprint}
								</Text>
							</View>
							{isActive ? (
								<Icon icon={Check} className="h-5 w-5 text-foreground" />
							) : null}
						</View>
						<View className="mt-4 flex-row gap-2">
							{isActive ? (
								<Pressable
									onPress={() => void refreshWorkspaces()}
									className="flex-row items-center gap-2 rounded-full bg-foreground px-4 py-2 active:opacity-70"
								>
									<Icon icon={RefreshCcw} className="h-4 w-4 text-background" />
									<Text className="font-semibold text-background">
										{syncStatus === "syncing" ? "Syncing" : "Sync"}
									</Text>
								</Pressable>
							) : (
								<Pressable
									onPress={() => void setActiveDesktop(desktop.desktopId)}
									className="rounded-full bg-foreground px-4 py-2 active:opacity-70"
								>
									<Text className="font-semibold text-background">Use</Text>
								</Pressable>
							)}
							<Pressable
								onPress={() => void removeDesktop(desktop.desktopId)}
								className="flex-row items-center gap-2 rounded-full bg-muted px-4 py-2 active:opacity-70"
							>
								<Icon icon={Trash2} className="h-4 w-4 text-foreground" />
								<Text className="font-semibold text-foreground">Remove</Text>
							</Pressable>
						</View>
					</View>
				);
			})}

			{syncError ? (
				<Text className="text-[14px] leading-5 text-destructive">
					{syncError}
				</Text>
			) : null}
		</ScrollView>
	);
}
