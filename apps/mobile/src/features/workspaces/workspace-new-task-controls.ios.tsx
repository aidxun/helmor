import {
	Button,
	Host,
	HStack,
	Menu,
	Picker,
	Section,
	Image as SUIImage,
	Text as SUIText,
} from "@expo/ui/swift-ui";
import {
	controlSize,
	font,
	foregroundStyle,
	pickerStyle,
	tag,
} from "@expo/ui/swift-ui/modifiers";
import { GitBranch, Laptop, MessageCircle } from "lucide-react-native";
import { Text, useColorScheme, View } from "react-native";
import { Icon } from "@/components/icon";
import type { MobileRepositoryOption, WorkspaceSendTarget } from "@/lib/remote";
import { cn } from "@/utils/tailwind";
import {
	modeFromTarget,
	type NewChatMode,
	targetForMode,
	targetForRepository,
} from "./workspace-new-chat-target";

const MODE_OPTIONS: {
	mode: NewChatMode;
	label: string;
	title: string;
	description: string;
}[] = [
	{
		mode: "chat",
		label: "Just Chat",
		title: "Just Chat",
		description:
			"Ask a question without attaching the session to a repository.",
	},
	{
		mode: "worktree",
		label: "Worktree",
		title: "New Worktree",
		description: "Create an isolated branch workspace for code changes.",
	},
	{
		mode: "local",
		label: "Local",
		title: "Local Repo",
		description: "Work directly in the selected source repository.",
	},
];

export function NewChatStartPage({
	repositories,
	target,
	onChangeTarget,
}: {
	repositories: MobileRepositoryOption[];
	target: WorkspaceSendTarget;
	onChangeTarget: (target: WorkspaceSendTarget) => void;
}) {
	const colorScheme = useColorScheme();
	const foreground = colorScheme === "dark" ? "#fff" : "#000";
	const muted =
		colorScheme === "dark" ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.58)";
	const mode = modeFromTarget(target);
	const selectedOption =
		MODE_OPTIONS.find((option) => option.mode === mode) ?? MODE_OPTIONS[0];
	const selectedRepo =
		target.kind === "repo"
			? repositories.find((repo) => repo.id === target.repoId)
			: null;

	return (
		<View className="w-full max-w-[430px] gap-5 px-5">
			<View className="items-center gap-2">
				<View className="h-12 w-12 items-center justify-center rounded-2xl bg-foreground">
					<ModeIcon mode={mode} active />
				</View>
				<Text className="text-center text-[30px] font-bold text-foreground">
					New chat
				</Text>
				<Text className="max-w-[330px] text-center text-[14px] leading-5 text-muted-foreground">
					Start a standalone conversation or attach the first prompt to a
					repository workflow.
				</Text>
			</View>

			<View className="gap-4 rounded-[22px] border border-border bg-card/85 p-4 shadow-card">
				<Host style={{ minHeight: 36, width: "100%" }}>
					<Picker
						selection={mode}
						onSelectionChange={(nextMode) => {
							if (nextMode !== "chat" && repositories.length === 0) return;
							onChangeTarget(
								targetForMode({ mode: nextMode, target, repositories }),
							);
						}}
						modifiers={[pickerStyle("segmented"), controlSize("regular")]}
					>
						{MODE_OPTIONS.map((option) => (
							<SUIText key={option.mode} modifiers={[tag(option.mode)]}>
								{option.label}
							</SUIText>
						))}
					</Picker>
				</Host>

				<View className="gap-2">
					<View className="flex-row items-center gap-3">
						<View className="h-9 w-9 items-center justify-center rounded-xl bg-muted">
							<ModeIcon mode={mode} />
						</View>
						<View className="flex-1">
							<Text className="text-[16px] font-semibold text-foreground">
								{selectedOption.title}
							</Text>
							<Text className="text-[13px] leading-5 text-muted-foreground">
								{selectedOption.description}
							</Text>
						</View>
					</View>
					{mode !== "chat" && repositories.length === 0 ? (
						<Text className="rounded-xl bg-muted px-3 py-2 text-[12px] leading-4 text-muted-foreground">
							Sync a repository from your desktop before starting a repository
							chat.
						</Text>
					) : null}
				</View>

				{target.kind === "repo" && repositories.length > 0 ? (
					<View className="gap-2">
						<Text className="px-1 text-[12px] font-semibold uppercase text-muted-foreground">
							Repository
						</Text>
						<Host style={{ minHeight: 44, width: "100%" }}>
							<Menu
								label={
									<HStack spacing={8} alignment="center">
										<SUIText
											modifiers={[
												foregroundStyle(foreground),
												font({ weight: "semibold", size: 15 }),
											]}
										>
											{selectedRepo?.name ?? repositories[0].name}
										</SUIText>
										<SUIText
											modifiers={[
												foregroundStyle(muted),
												font({ weight: "regular", size: 13 }),
											]}
										>
											{selectedRepo?.defaultBranch ??
												repositories[0].defaultBranch ??
												"default branch"}
										</SUIText>
										<SUIImage
											systemName="chevron.down"
											size={11}
											color={muted}
										/>
									</HStack>
								}
								modifiers={[controlSize("regular")]}
							>
								<Section title="Repositories">
									{repositories.map((repo) => (
										<Button
											key={repo.id}
											systemImage={
												repo.id === (selectedRepo?.id ?? repositories[0].id)
													? "checkmark.circle"
													: "folder"
											}
											label={repo.name}
											onPress={() =>
												onChangeTarget(
													targetForRepository({
														repoId: repo.id,
														target,
														repositories,
													}),
												)
											}
										/>
									))}
								</Section>
							</Menu>
						</Host>
					</View>
				) : null}
			</View>
		</View>
	);
}

function ModeIcon({ mode, active }: { mode: NewChatMode; active?: boolean }) {
	const icon =
		mode === "chat" ? MessageCircle : mode === "local" ? Laptop : GitBranch;
	return (
		<Icon
			icon={icon}
			className={cn("h-5 w-5", active ? "text-background" : "text-foreground")}
			strokeWidth={1.9}
		/>
	);
}
