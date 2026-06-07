import {
	Button,
	Host,
	HStack,
	Menu,
	Section,
	Image as SUIImage,
	Text as SUIText,
} from "@expo/ui/swift-ui";
import {
	controlSize,
	font,
	foregroundStyle,
} from "@expo/ui/swift-ui/modifiers";
import type React from "react";
import { useColorScheme } from "react-native";
import {
	modeFromTarget,
	targetForMode,
	targetForRepository,
} from "@/features/workspaces/workspace-new-chat-target";
import type {
	AgentModelSection,
	MobileRepositoryOption,
	WorkspaceSendTarget,
} from "@/lib/remote";
import { formatEffort, formatEffortCompact } from "./composer-format";

type SUIImageSystemName = React.ComponentProps<typeof SUIImage>["systemName"];

function useMenuColors() {
	const colorScheme = useColorScheme();
	return {
		foreground: colorScheme === "dark" ? "#fff" : "#000",
		muted:
			colorScheme === "dark" ? "rgba(255,255,255,0.58)" : "rgba(0,0,0,0.46)",
	};
}

function MenuLabel({
	label,
	systemName,
}: {
	label: string;
	systemName?: SUIImageSystemName;
}) {
	const { foreground, muted } = useMenuColors();
	const iconOnly = label.length === 0;

	return (
		<HStack spacing={4} alignment="center">
			{systemName ? (
				<SUIImage
					systemName={systemName}
					size={iconOnly ? 20 : 12}
					color={iconOnly ? foreground : muted}
				/>
			) : null}
			{label ? (
				<SUIText
					modifiers={[
						foregroundStyle(foreground),
						font({ weight: "semibold", size: 13 }),
					]}
				>
					{label}
				</SUIText>
			) : null}
		</HStack>
	);
}

export function ComposerModelMenu({
	label,
	modelSections,
	selectedModelId,
	onSelect,
}: {
	label: string;
	modelSections: readonly AgentModelSection[];
	selectedModelId: string;
	onSelect: (modelId: string) => void;
}) {
	return (
		<Host style={{ minHeight: 32, minWidth: 76, maxWidth: 94 }}>
			<Menu
				label={<MenuLabel label={label} />}
				modifiers={[controlSize("regular")]}
			>
				{modelSections.map((section) => (
					<Section key={section.id} title={section.label}>
						{section.options.map((model) => (
							<Button
								key={model.id}
								systemImage={
									model.id === selectedModelId ? "checkmark.circle" : "cpu"
								}
								label={model.label}
								onPress={() => onSelect(model.id)}
							/>
						))}
					</Section>
				))}
			</Menu>
		</Host>
	);
}

export function ComposerAttachmentMenu({
	disabled,
	onCamera,
	onLibrary,
}: {
	disabled?: boolean;
	onCamera: () => void;
	onLibrary: () => void;
}) {
	return (
		<Host style={{ minHeight: 32, minWidth: 34, maxWidth: 38 }}>
			<Menu
				label={<MenuLabel label="" systemName="plus" />}
				modifiers={[controlSize("regular")]}
			>
				<Section title="Add image">
					<Button
						systemImage="camera"
						label="Take photo"
						onPress={() => {
							if (!disabled) onCamera();
						}}
					/>
					<Button
						systemImage="photo"
						label="Choose from library"
						onPress={() => {
							if (!disabled) onLibrary();
						}}
					/>
				</Section>
			</Menu>
		</Host>
	);
}

export function ComposerTargetMenu({
	target,
	repositories,
	onChange,
}: {
	target: WorkspaceSendTarget;
	repositories: readonly MobileRepositoryOption[];
	onChange: (target: WorkspaceSendTarget) => void;
}) {
	const mode = modeFromTarget(target);
	const selectedRepo =
		target.kind === "repo"
			? repositories.find((repo) => repo.id === target.repoId)
			: null;
	return (
		<Host style={{ minHeight: 32, minWidth: 58, maxWidth: 76 }}>
			<Menu
				label={
					<MenuLabel
						label={compactTargetLabel(target)}
						systemName={targetIcon(target)}
					/>
				}
				modifiers={[controlSize("regular")]}
			>
				<Section title="Start as">
					<Button
						systemImage={mode === "chat" ? "checkmark.circle" : "bubble.left"}
						label="Just Chat"
						onPress={() => onChange({ kind: "chat" })}
					/>
					<Button
						systemImage={
							mode === "worktree" ? "checkmark.circle" : "arrow.triangle.branch"
						}
						label="Worktree"
						onPress={() =>
							onChange(
								targetForMode({
									mode: "worktree",
									target,
									repositories: [...repositories],
								}),
							)
						}
					/>
					<Button
						systemImage={
							mode === "local" ? "checkmark.circle" : "laptopcomputer"
						}
						label="Local Repo"
						onPress={() =>
							onChange(
								targetForMode({
									mode: "local",
									target,
									repositories: [...repositories],
								}),
							)
						}
					/>
				</Section>

				{repositories.length > 0 ? (
					<Section title="Repository">
						{repositories.map((repo) => (
							<Button
								key={repo.id}
								systemImage={
									repo.id === selectedRepo?.id ? "checkmark.circle" : "folder"
								}
								label={repo.name}
								onPress={() => {
									const repoTarget =
										target.kind === "repo"
											? target
											: targetForMode({
													mode: "worktree",
													target,
													repositories: [...repositories],
												});
									onChange(
										targetForRepository({
											repoId: repo.id,
											target: repoTarget,
											repositories: [...repositories],
										}),
									);
								}}
							/>
						))}
					</Section>
				) : null}
			</Menu>
		</Host>
	);
}

export function ComposerEffortMenu({
	level,
	levels,
	onSelect,
}: {
	level: string | null;
	levels: readonly string[];
	onSelect: (level: string) => void;
}) {
	if (!level || levels.length === 0) return null;

	return (
		<Host style={{ minHeight: 32, minWidth: 42, maxWidth: 52 }}>
			<Menu
				label={<MenuLabel label={formatEffortCompact(level)} />}
				modifiers={[controlSize("regular")]}
			>
				<Section title="Effort">
					{levels.map((option) => (
						<Button
							key={option}
							systemImage={option === level ? "checkmark.circle" : "brain"}
							label={formatEffort(option)}
							onPress={() => onSelect(option)}
						/>
					))}
				</Section>
			</Menu>
		</Host>
	);
}

function targetIcon(target: WorkspaceSendTarget): SUIImageSystemName {
	if (target.kind === "chat") return "bubble.left";
	return target.mode === "local" ? "laptopcomputer" : "arrow.triangle.branch";
}

function compactTargetLabel(target: WorkspaceSendTarget): string {
	if (target.kind === "chat") return "Chat";
	return target.mode === "local" ? "Local" : "Work";
}
