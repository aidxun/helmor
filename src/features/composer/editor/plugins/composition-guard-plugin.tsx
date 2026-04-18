/**
 * Lexical plugin: strip IME segmentation spaces from abandoned composition
 * buffers.
 *
 * Why this exists: when a CJK pinyin IME is active and the user types a
 * non-pinyin string (e.g. `helmor`, `useState`, or any English word that
 * pinyin can segment), the IME shows segmented candidates like `he | lmor`
 * with an internal U+0020 separator. If the user then SWITCHES IMEs
 * (Shift / Ctrl+Space / Cmd+Space to flip to English) WITHOUT pressing
 * Enter to confirm or Esc to cancel, the OS force-commits the buffer with
 * those separator spaces preserved. Without this guard the editor ends up
 * with `he lmor` instead of the `helmor` the user actually typed.
 *
 * Lexical's `$onCompositionEndImpl` calls `$updateSelectedTextFromDOM` which
 * reads the DOM text content as the source of truth (only falling back to
 * `event.data` when the DOM still holds the composition placeholder). That
 * means modifying `event.data` alone is not enough — we have to mutate the
 * DOM text node BEFORE Lexical's bubble-phase compositionend handler runs.
 *
 * Strategy: capture-phase compositionend listener on the editor root. When
 * `event.data` is pure printable ASCII AND contains a U+0020, treat it as
 * an abandoned IME-segmented buffer and rewrite the matching DOM text node.
 * This is safe for pinyin / zhuyin / wubi / cangjie because none of those
 * IMEs emit candidates with intentional ASCII spaces — every space in a
 * pure-ASCII composition buffer is an IME-injected segmentation separator.
 * Mixed-script commits (e.g. `你好 world`) are not touched because their
 * `data` contains non-ASCII codepoints.
 *
 * Why NOT a `COMPOSITION_END_COMMAND` listener: that command is dispatched
 * from Lexical's bubble-phase handler, AFTER the model is already updated
 * from the DOM. Capture-phase on the native event is the only point where
 * we can still influence what Lexical sees.
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";

const PURE_PRINTABLE_ASCII = /^[\x20-\x7E]+$/;

function isAbandonedImeAsciiBuffer(data: string): boolean {
	return PURE_PRINTABLE_ASCII.test(data) && data.includes(" ");
}

function stripImeSegmentationSpaces(
	root: Node,
	target: string,
	replacement: string,
): boolean {
	if (root.nodeType === Node.TEXT_NODE) {
		const text = root.textContent;
		if (text?.includes(target)) {
			root.textContent = text.replace(target, replacement);
			return true;
		}
		return false;
	}
	for (const child of Array.from(root.childNodes)) {
		if (stripImeSegmentationSpaces(child, target, replacement)) return true;
	}
	return false;
}

export function CompositionGuardPlugin() {
	const [editor] = useLexicalComposerContext();

	useEffect(() => {
		const handler = (event: Event) => {
			const ce = event as CompositionEvent;
			const data = ce.data;
			if (!data || !isAbandonedImeAsciiBuffer(data)) return;
			const stripped = data.replace(/\s+/g, "");
			const root = editor.getRootElement();
			if (!root) return;
			stripImeSegmentationSpaces(root, data, stripped);
		};

		const unregister = editor.registerRootListener(
			(rootElement, prevRootElement) => {
				if (prevRootElement) {
					prevRootElement.removeEventListener("compositionend", handler, true);
				}
				if (rootElement) {
					rootElement.addEventListener("compositionend", handler, true);
				}
			},
		);

		return () => {
			const root = editor.getRootElement();
			if (root) {
				root.removeEventListener("compositionend", handler, true);
			}
			unregister();
		};
	}, [editor]);

	return null;
}
