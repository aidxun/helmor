import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useRef } from "react";
import { TextInput } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useChatContext, useConversationContext } from "@/components/chat";
import { useModel } from "@/components/model-context";
import { useWorkspaces } from "@/features/workspaces";
import type { WorkspaceSendTarget } from "@/lib/remote";
import { cn } from "@/utils/tailwind";
import { compactModelLabel, composerConnectionBanner } from "./composer-format";
import { ComposerInputShell } from "./composer-shell";
import { ComposerToolbar } from "./composer-toolbar";
import { ConnectionStatusCard } from "./connection-status-card";

export function MobileWorkspaceComposer({
	disabled = false,
	target,
}: {
	disabled?: boolean;
	target?: WorkspaceSendTarget;
}) {
	const { input, setInput, isGenerating, onSend, error } = useChatContext();
	const {
		activeDesktop,
		connectionState,
		repositories,
		setNewWorkspaceTarget,
		syncStatus,
		syncError,
	} = useWorkspaces();
	const {
		modelSections,
		selectedModelId,
		selectedModel,
		effortLevel,
		fastMode,
		setFastMode,
		selectModel,
		selectEffort,
		configLoading,
	} = useModel();
	const { promptInputStyle, onPromptInputLayout } = useConversationContext();
	const inputRef = useRef<TextInput>(null);
	const insets = useSafeAreaInsets();
	const trimmed = input.trim();
	const submitDisabled = disabled || isGenerating || !trimmed;
	const supportsFastMode = selectedModel?.supportsFastMode === true;
	const modelLabel = configLoading
		? "Loading"
		: compactModelLabel(selectedModel?.label ?? "Select model");
	const connectionBanner = composerConnectionBanner({
		hasActiveDesktop: Boolean(activeDesktop),
		connectionState,
		syncStatus,
		syncError,
		sendError: error?.message ?? null,
	});

	useEffect(() => {
		if (input === "") inputRef.current?.clear();
	}, [input]);

	const handleSubmit = useCallback(() => {
		if (submitDisabled) return;
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
		onSend({
			prompt: trimmed,
			modelId: selectedModel?.id ?? selectedModelId,
			effortLevel,
			fastMode: supportsFastMode ? fastMode : false,
		});
	}, [
		effortLevel,
		fastMode,
		onSend,
		selectedModel,
		selectedModelId,
		submitDisabled,
		supportsFastMode,
		trimmed,
	]);

	const handleToggleFast = useCallback(() => {
		void Haptics.selectionAsync().catch(() => {});
		setFastMode(!fastMode);
	}, [fastMode, setFastMode]);

	const handleCameraAttachment = useCallback(() => {
		void pickImage("camera");
	}, []);

	const handleLibraryAttachment = useCallback(() => {
		void pickImage("library");
	}, []);

	return (
		<Animated.View
			entering={FadeIn.duration(180)}
			onLayout={onPromptInputLayout}
			pointerEvents="box-none"
			style={[
				{
					position: "absolute",
					left: 0,
					right: 0,
					bottom: 0,
					zIndex: 30,
					paddingBottom: Math.max(insets.bottom, 10),
				},
				promptInputStyle,
			]}
			className="px-5 pt-2"
		>
			<ConnectionStatusCard banner={connectionBanner} />
			<ComposerInputShell>
				<TextInput
					ref={inputRef}
					nativeID="composer"
					cursorColorClassName="tint-foreground"
					selectionColorClassName="tint-foreground"
					className={cn(
						"max-h-32 min-h-[70px] px-4 pb-1 pt-3.5 text-[17px] leading-6 text-foreground",
						disabled || isGenerating ? "opacity-70" : undefined,
					)}
					value={input}
					onChangeText={setInput}
					editable={!disabled && !isGenerating}
					placeholder="Ask Helmor anything..."
					placeholderTextColor="rgb(170, 170, 170)"
					multiline
					maxLength={4000}
					returnKeyType="default"
					textAlignVertical="top"
				/>

				<ComposerToolbar
					disabled={disabled}
					isGenerating={isGenerating}
					submitDisabled={submitDisabled}
					target={target}
					repositories={repositories}
					modelLabel={modelLabel}
					modelSections={modelSections}
					selectedModelId={selectedModelId}
					effortLevel={effortLevel}
					effortLevels={selectedModel?.effortLevels ?? []}
					supportsFastMode={supportsFastMode}
					fastMode={fastMode}
					onCameraAttachment={handleCameraAttachment}
					onLibraryAttachment={handleLibraryAttachment}
					onSubmit={handleSubmit}
					onToggleFast={handleToggleFast}
					onChangeTarget={setNewWorkspaceTarget}
					onSelectModel={selectModel}
					onSelectEffort={selectEffort}
				/>
			</ComposerInputShell>
		</Animated.View>
	);
}

type ImageSource = "camera" | "library";

async function pickImage(source: ImageSource) {
	const permission =
		source === "camera"
			? await ImagePicker.requestCameraPermissionsAsync()
			: await ImagePicker.requestMediaLibraryPermissionsAsync();
	if (!permission.granted) return;

	if (source === "camera") {
		await ImagePicker.launchCameraAsync({
			mediaTypes: ["images"],
			quality: 0.9,
		});
		return;
	}

	await ImagePicker.launchImageLibraryAsync({
		mediaTypes: ["images"],
		allowsMultipleSelection: true,
		quality: 0.9,
	});
}
