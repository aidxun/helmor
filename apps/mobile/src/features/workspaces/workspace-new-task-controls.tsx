import { Pressable, Text, View } from "react-native";

type RepositoryOption = {
	id: string;
	name: string;
	defaultBranch?: string | null;
	repoInitials?: string | null;
};

type NewWorkspaceTarget =
	| { kind: "chat" }
	| { kind: "repo"; repoId: string; mode: "worktree" | "local" };

export function NewWorkspaceControls({
	repositories,
	target,
	onChangeTarget,
}: {
	repositories: RepositoryOption[];
	target: NewWorkspaceTarget;
	onChangeTarget: (target: NewWorkspaceTarget) => void;
}) {
	const selectedRepo =
		target.kind === "repo"
			? repositories.find((repo) => repo.id === target.repoId)
			: null;
	const repoTarget = (mode: "worktree" | "local" = "worktree") => {
		const repoId =
			target.kind === "repo" ? target.repoId : (repositories[0]?.id ?? "");
		if (!repoId) return;
		onChangeTarget({ kind: "repo", repoId, mode });
	};

	return (
		<View className="mx-6 gap-3 rounded-2xl border border-border bg-card/70 p-3">
			<View className="flex-row gap-2">
				<SegmentButton
					label="Chat"
					active={target.kind === "chat"}
					onPress={() => onChangeTarget({ kind: "chat" })}
				/>
				<SegmentButton
					label="Repository"
					active={target.kind === "repo"}
					disabled={repositories.length === 0}
					onPress={() => repoTarget()}
				/>
			</View>
			{target.kind === "repo" ? (
				<View className="gap-3">
					<View className="max-h-40 gap-2">
						{repositories.map((repo) => (
							<Pressable
								key={repo.id}
								onPress={() =>
									onChangeTarget({
										kind: "repo",
										repoId: repo.id,
										mode: target.mode,
									})
								}
								className={`flex-row items-center gap-2 rounded-xl px-3 py-2 ${
									repo.id === selectedRepo?.id ? "bg-foreground" : "bg-muted"
								}`}
							>
								<View className="h-7 w-7 items-center justify-center rounded-full bg-background">
									<Text className="text-[11px] font-semibold text-foreground">
										{repo.repoInitials ?? repo.name.slice(0, 2).toUpperCase()}
									</Text>
								</View>
								<View className="flex-1">
									<Text
										numberOfLines={1}
										className={`text-[13px] font-semibold ${
											repo.id === selectedRepo?.id
												? "text-background"
												: "text-foreground"
										}`}
									>
										{repo.name}
									</Text>
									<Text
										numberOfLines={1}
										className={`text-[11px] ${
											repo.id === selectedRepo?.id
												? "text-background/70"
												: "text-muted-foreground"
										}`}
									>
										{repo.defaultBranch ?? "default branch"}
									</Text>
								</View>
							</Pressable>
						))}
					</View>
					<View className="flex-row gap-2">
						<SegmentButton
							label="Worktree"
							active={target.mode === "worktree"}
							onPress={() => repoTarget("worktree")}
						/>
						<SegmentButton
							label="Local"
							active={target.mode === "local"}
							onPress={() => repoTarget("local")}
						/>
					</View>
				</View>
			) : null}
		</View>
	);
}

function SegmentButton({
	label,
	active,
	disabled,
	onPress,
}: {
	label: string;
	active: boolean;
	disabled?: boolean;
	onPress: () => void;
}) {
	return (
		<Pressable
			disabled={disabled}
			onPress={onPress}
			className={`flex-1 rounded-xl px-3 py-2 ${
				active ? "bg-foreground" : "bg-muted"
			} ${disabled ? "opacity-40" : ""}`}
		>
			<Text
				className={`text-center text-[12px] font-semibold ${
					active ? "text-background" : "text-foreground"
				}`}
			>
				{label}
			</Text>
		</Pressable>
	);
}
