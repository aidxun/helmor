/* eslint-disable react-hooks/immutability, react-hooks/refs */
import { LegendList, type LegendListRef } from "@legendapp/list";
import {
	createContext,
	type ReactElement,
	type ReactNode,
	use,
	useCallback,
	useRef,
	useState,
} from "react";
import {
	type LayoutChangeEvent,
	Pressable,
	StyleSheet,
	Text,
	useColorScheme,
	View,
} from "react-native";
import {
	KeyboardAvoidingView,
	useKeyboardHandler,
} from "react-native-keyboard-controller";
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useDerivedValue,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { SymbolImage } from "@/components/symbol-image";
import { KeyboardGestureArea } from "../tw";
import { useChatContext } from "./chat-context";
import type { ChatMessage } from "./types";

const AnimatedLegendList = Animated.createAnimatedComponent(LegendList);

type AnimatedStyle = object;

type ConversationContextValue = {
	scrollToBottom: () => void;
	/** Animated style reserved for prompt input layout adjustments. */
	promptInputStyle: AnimatedStyle;
	/** Prompt input reports its measured height through this callback. */
	onPromptInputLayout: (e: LayoutChangeEvent) => void;
	/** Animated style for the scroll-to-bottom button. */
	scrollButtonStyle: AnimatedStyle;
};

const ConversationCtx = createContext<ConversationContextValue | null>(null);

export function useConversationContext() {
	const ctx = use(ConversationCtx);
	if (!ctx)
		throw new Error(
			"useConversationContext must be used within <Conversation>",
		);
	return ctx;
}

export function Conversation({
	items,
	renderMessage,
	keyExtractor,
	estimatedItemSize = 80,
	onScrolledFromTopChange,
	emptyState,
	scrollEnabled = true,
	children,
}: {
	/** Override the chat context messages when rendering richer thread rows. */
	items?: unknown[];
	/** Render callback for each row passed to the underlying list. */
	renderMessage: (info: { item: unknown; index: number }) => ReactElement;
	keyExtractor?: (item: unknown, index: number) => string;
	estimatedItemSize?: number;
	onScrolledFromTopChange?: (scrolled: boolean) => void;
	/** Element shown when the message list is empty. */
	emptyState?: ReactElement;
	scrollEnabled?: boolean;
	/** Compound children: <ConversationScrollButton />, <PromptInput />, etc. */
	children?: ReactNode;
}) {
	const { messages } = useChatContext();
	const data = items ?? messages;
	const listRef = useRef<LegendListRef>(null);
	const isScrolledFromTopRef = useRef(false);

	// -- Keyboard tracking --------------------------------------------------

	const scrollToBottomRef = useRef<() => void>(() => {});
	// Tracks whether the current keyboard transition originated from an
	// interactive dismiss gesture (vs a programmatic tap-to-open).
	const wasInteractive = useSharedValue(false);
	useKeyboardHandler(
		{
			onInteractive: (e) => {
				"worklet";
				if (e.height > 0) {
					wasInteractive.value = true;
				}
			},
			onEnd: (e) => {
				"worklet";
				const shouldScroll = e.height > 0 && !wasInteractive.value;
				wasInteractive.value = false;
				if (shouldScroll) {
					runOnJS(scrollToBottomRef.current)();
				}
			},
		},
		[],
	);

	// -- Layout bookkeeping --------------------------------------------------

	const [composerOffsetHeight, setComposerOffsetHeight] = useState(68);
	const [viewportHeight, setViewportHeight] = useState(0);
	const composerHeight = useSharedValue(68);
	const scrollViewHeight = useSharedValue(0);
	const totalContentHeight = useSharedValue(0);

	// -- Auto-scroll ---------------------------------------------------------

	const scrollY = useSharedValue(0);
	const lastContentHeight = useSharedValue(0);
	const SCROLL_THRESHOLD = 50;

	const bottomInset = useDerivedValue(() => 0);

	const isAtBottom = useDerivedValue(() => {
		const maxScrollY =
			totalContentHeight.value - scrollViewHeight.value + bottomInset.value;
		if (maxScrollY <= 0) return true;
		return maxScrollY - scrollY.value <= SCROLL_THRESHOLD;
	});

	const shouldShowScrollButton = useDerivedValue(() => {
		const maxScrollY =
			totalContentHeight.value - scrollViewHeight.value + bottomInset.value;
		if (maxScrollY <= 50) return false;
		return !isAtBottom.value;
	});

	// -- Callbacks -----------------------------------------------------------

	const onScrollViewLayout = useCallback((e: LayoutChangeEvent) => {
		const height = e.nativeEvent.layout.height;
		scrollViewHeight.value = height;
		setViewportHeight(height);
	}, []);

	const onScroll = useCallback(
		(event: { nativeEvent: { contentOffset: { y: number } } }) => {
			const offsetY = event.nativeEvent.contentOffset.y;
			scrollY.value = offsetY;

			const isScrolledFromTop = offsetY > 0.5;
			if (isScrolledFromTopRef.current !== isScrolledFromTop) {
				isScrolledFromTopRef.current = isScrolledFromTop;
				onScrolledFromTopChange?.(isScrolledFromTop);
			}
		},
		[onScrolledFromTopChange, scrollY],
	);

	const scrollToBottom = useCallback(() => {
		if (data.length === 0) return;
		listRef.current?.scrollToEnd({
			animated: true,
		});
		requestAnimationFrame(() => {
			listRef.current?.scrollToEnd({
				animated: true,
			});
		});
	}, [data.length]);
	scrollToBottomRef.current = scrollToBottom;

	const onContentSizeChange = useCallback(
		(_width: number, height: number) => {
			const wasAtBottom = isAtBottom.value;
			const heightIncreased = height > lastContentHeight.value;

			totalContentHeight.value = height;
			lastContentHeight.value = height;

			if (wasAtBottom && heightIncreased && listRef.current) {
				requestAnimationFrame(() => {
					scrollToBottom();
				});
			}
		},
		[isAtBottom, lastContentHeight, scrollToBottom, totalContentHeight],
	);

	// -- Animated styles -----------------------------------------------------

	const footerSpacerStyle = useAnimatedStyle(() => {
		return { height: composerHeight.value + 24 };
	});

	const promptInputStyle = useAnimatedStyle(() => ({}));

	const scrollButtonStyle = useAnimatedStyle(() => ({
		opacity: withTiming(shouldShowScrollButton.value ? 1 : 0, {
			duration: 200,
		}),
		transform: [
			{
				scale: withTiming(shouldShowScrollButton.value ? 1 : 0.8, {
					duration: 200,
				}),
			},
		],
		bottom: composerHeight.value + 12,
	}));

	const onPromptInputLayout = useCallback((e: LayoutChangeEvent) => {
		const h = e.nativeEvent.layout.height;
		composerHeight.value = h;
		setComposerOffsetHeight(h);
	}, []);

	// -- Context value -------------------------------------------------------

	const contextValue: ConversationContextValue = {
		scrollToBottom,
		promptInputStyle,
		onPromptInputLayout,
		scrollButtonStyle,
	};

	// -- Render --------------------------------------------------------------

	return (
		<ConversationCtx value={contextValue}>
			<KeyboardAvoidingView
				behavior="padding"
				automaticOffset
				style={{ flex: 1 }}
			>
				<View className="flex-1 bg-background">
					<KeyboardGestureArea
						interpolator="ios"
						showOnSwipeUp
						offset={composerOffsetHeight}
						className="flex-1"
					>
						<AnimatedLegendList
							ref={listRef}
							data={data}
							renderItem={renderMessage}
							keyExtractor={
								keyExtractor ?? ((item) => (item as ChatMessage).id)
							}
							contentContainerStyle={{
								paddingHorizontal: 16,
								paddingTop: 16,
								paddingBottom: 16,
								flexGrow: data.length ? undefined : 1,
							}}
							keyboardDismissMode="interactive"
							automaticallyAdjustsScrollIndicatorInsets={false}
							maintainVisibleContentPosition
							estimatedItemSize={estimatedItemSize}
							scrollEnabled={scrollEnabled}
							onLayout={onScrollViewLayout}
							onScroll={onScroll}
							scrollEventThrottle={16}
							onContentSizeChange={onContentSizeChange}
							ListEmptyComponent={
								emptyState ? (
									<View
										style={{
											minHeight: Math.max(240, viewportHeight - 32),
											justifyContent: "center",
										}}
									>
										{emptyState}
									</View>
								) : undefined
							}
							ListFooterComponent={<Animated.View style={footerSpacerStyle} />}
						/>
					</KeyboardGestureArea>

					{children}
				</View>
			</KeyboardAvoidingView>
		</ConversationCtx>
	);
}

export function ConversationScrollButton() {
	const { scrollToBottom, scrollButtonStyle } = useConversationContext();
	const colorScheme = useColorScheme();
	const isDark = colorScheme === "dark";

	return (
		<Animated.View
			pointerEvents="box-none"
			style={[
				{
					position: "absolute",
					left: 0,
					right: 0,
					alignItems: "center",
					zIndex: 20,
				},
				scrollButtonStyle,
			]}
		>
			<Pressable
				onPress={scrollToBottom}
				hitSlop={8}
				style={{
					width: 40,
					height: 40,
					borderRadius: 20,
					alignItems: "center",
					justifyContent: "center",
					backgroundColor: isDark
						? "rgba(42,42,42,0.94)"
						: "rgba(255,255,255,0.96)",
					borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)",
					borderWidth: StyleSheet.hairlineWidth,
					shadowColor: "#000",
					shadowOpacity: isDark ? 0.18 : 0.1,
					shadowRadius: 12,
					shadowOffset: { width: 0, height: 4 },
				}}
			>
				<SymbolImage
					name="chevron.down"
					sfEffect={{ effect: "wiggle", repeat: -1 }}
					className="text-muted-foreground text-xs mt-1"
				/>
			</Pressable>
		</Animated.View>
	);
}

export function ConversationEmptyState({
	title = "Ready",
	description,
	icon = "bubble.left.and.bubble.right",
}: {
	title?: string;
	description?: string;
	icon?: string;
}) {
	return (
		<View className="items-center justify-center gap-2">
			<SymbolImage name={icon} size={48} className="text-muted-foreground" />
			<Text className="text-xl font-semibold text-foreground">{title}</Text>
			{description && (
				<Text className="text-sm text-muted-foreground">{description}</Text>
			)}
		</View>
	);
}
