import * as WebBrowser from "expo-web-browser";
import { useMemo } from "react";
import { Platform } from "react-native";
import {
	EnrichedMarkdownText,
	type MarkdownStyle,
	type Md4cFlags,
} from "react-native-enriched-markdown";
import { useCSSVariable } from "uniwind";
import { preserveMarkdownNewlines } from "./normalize-markdown";

const VAR_NAMES = [
	"--app-foreground",
	"--app-muted-foreground",
	"--app-border",
	"--app-secondary",
	"--app-muted",
	"--app-accent",
	// Tailwind blue
	"--color-blue-400",
] as const;

const MONOSPACE_FONT =
	Platform.select({
		ios: "Menlo",
		android: "monospace",
		default: "monospace",
	}) ?? "monospace";

const MD4C_FLAGS: Md4cFlags = {
	latexMath: false,
};

export function EnrichedChatMarkdown({ children }: { children: string }) {
	const [text, text2, border, bg2, bg3, fill3, link] = useCSSVariable(
		VAR_NAMES as unknown as string[],
	) as string[];

	const markdownStyle = useMemo<MarkdownStyle>(
		() => ({
			paragraph: {
				fontSize: 16,
				lineHeight: 22,
				color: text,
				marginTop: 0,
				marginBottom: 8,
			},
			h1: {
				fontSize: 24,
				lineHeight: 32,
				fontWeight: "700",
				color: text,
				marginTop: 12,
				marginBottom: 8,
			},
			h2: {
				fontSize: 20,
				lineHeight: 28,
				fontWeight: "700",
				color: text,
				marginTop: 12,
				marginBottom: 8,
			},
			h3: {
				fontSize: 18,
				lineHeight: 26,
				fontWeight: "700",
				color: text,
				marginTop: 10,
				marginBottom: 6,
			},
			h4: {
				fontSize: 16,
				lineHeight: 24,
				fontWeight: "700",
				color: text,
				marginTop: 10,
				marginBottom: 6,
			},
			h5: {
				fontSize: 14,
				lineHeight: 22,
				fontWeight: "700",
				color: text,
				marginTop: 8,
				marginBottom: 4,
			},
			h6: {
				fontSize: 12,
				lineHeight: 18,
				fontWeight: "700",
				color: text2,
				marginTop: 8,
				marginBottom: 4,
			},
			blockquote: {
				fontSize: 16,
				lineHeight: 22,
				color: text2,
				marginTop: 4,
				marginBottom: 8,
				borderColor: border,
				borderWidth: 3,
				gapWidth: 10,
				backgroundColor: bg3,
			},
			list: {
				fontSize: 16,
				lineHeight: 22,
				color: text,
				marginTop: 0,
				marginBottom: 8,
				bulletColor: text2,
				bulletSize: 6,
				markerMinWidth: 16,
				markerColor: text2,
				markerFontWeight: "500",
				gapWidth: 8,
				marginLeft: 20,
			},
			codeBlock: {
				fontSize: 14,
				lineHeight: 20,
				fontFamily: MONOSPACE_FONT,
				color: text,
				marginTop: 4,
				marginBottom: 8,
				backgroundColor: fill3,
				borderColor: border,
				borderRadius: 8,
				borderWidth: 0,
				padding: 12,
			},
			link: {
				color: link,
				underline: false,
				backgroundColor: "transparent",
			},
			strong: {
				fontWeight: "bold",
				color: text,
			},
			em: {
				fontStyle: "italic",
				color: text,
			},
			strikethrough: {
				color: text2,
			},
			underline: {
				color: text,
			},
			code: {
				fontFamily: MONOSPACE_FONT,
				fontSize: 15,
				color: text,
				backgroundColor: fill3,
				borderColor: "transparent",
			},
			image: {
				height: 200,
				borderRadius: 8,
				marginTop: 4,
				marginBottom: 8,
			},
			inlineImage: {
				size: 20,
			},
			thematicBreak: {
				color: border,
				height: 1,
				marginTop: 12,
				marginBottom: 12,
			},
			table: {
				fontSize: 14,
				lineHeight: 20,
				color: text,
				marginTop: 4,
				marginBottom: 8,
				headerBackgroundColor: bg2,
				headerTextColor: text,
				rowEvenBackgroundColor: "transparent",
				rowOddBackgroundColor: bg3,
				borderColor: border,
				borderWidth: 1,
				borderRadius: 8,
				cellPaddingHorizontal: 10,
				cellPaddingVertical: 8,
			},
			taskList: {
				checkedColor: link,
				borderColor: border,
				checkboxSize: 14,
				checkboxBorderRadius: 4,
				checkmarkColor: text,
				checkedTextColor: text2,
				checkedStrikethrough: false,
			},
			math: {
				fontSize: 16,
				color: text,
				backgroundColor: fill3,
				padding: 10,
				marginTop: 4,
				marginBottom: 8,
				textAlign: "left",
			},
			inlineMath: {
				color: text,
			},
		}),
		[text, text2, border, bg2, bg3, fill3, link],
	);

	return (
		<EnrichedMarkdownText
			allowTrailingMargin={false}
			containerStyle={{ width: "100%" }}
			flavor="github"
			markdown={preserveMarkdownNewlines(children)}
			markdownStyle={markdownStyle}
			md4cFlags={MD4C_FLAGS}
			onLinkPress={({ url }) => {
				void WebBrowser.openBrowserAsync(url, {
					presentationStyle: WebBrowser.WebBrowserPresentationStyle.AUTOMATIC,
				});
			}}
			selectable
		/>
	);
}
