import { FitAddon } from "@xterm/addon-fit";
import { type ITheme, Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

type TerminalOutputProps = {
	terminalRef?: React.RefObject<TerminalHandle | null>;
	className?: string;
	/**
	 * Called when the user types (or pastes). The string is the raw bytes
	 * xterm would send over a real PTY — e.g. a literal `\x03` for Ctrl+C,
	 * `\x1b[A` for Up arrow. Forward this to the backend to write into the
	 * PTY master.
	 *
	 * When omitted, xterm still captures keys but they go nowhere.
	 */
	onData?: (data: string) => void;
	/**
	 * Called when the terminal's cell grid changes size (FitAddon resize,
	 * font change, etc). Forward to the backend's `TIOCSWINSZ` so
	 * interactive tools (vim, htop, less) re-layout.
	 */
	onResize?: (cols: number, rows: number) => void;
};

export type TerminalHandle = {
	write: (data: string) => void;
	clear: () => void;
	dispose: () => void;
};

/** Read --terminal-* and --foreground CSS variables and build an xterm ITheme. */
function resolveTerminalTheme(): ITheme {
	const s = getComputedStyle(document.documentElement);
	const v = (suffix: string) =>
		s.getPropertyValue(`--terminal-${suffix}`).trim();

	// Match the app's global scrollbar colors (foreground @ 18%/30%/40%).
	const fg = s.getPropertyValue("--foreground").trim();
	const mix = (pct: number) =>
		`color-mix(in oklch, ${fg} ${pct}%, transparent)`;

	return {
		background: v("background"),
		foreground: v("foreground"),
		cursor: v("cursor"),
		selectionBackground: v("selection"),
		scrollbarSliderBackground: mix(18),
		scrollbarSliderHoverBackground: mix(30),
		scrollbarSliderActiveBackground: mix(40),
		black: v("black"),
		red: v("red"),
		green: v("green"),
		yellow: v("yellow"),
		blue: v("blue"),
		magenta: v("magenta"),
		cyan: v("cyan"),
		white: v("white"),
		brightBlack: v("bright-black"),
		brightRed: v("bright-red"),
		brightGreen: v("bright-green"),
		brightYellow: v("bright-yellow"),
		brightBlue: v("bright-blue"),
		brightMagenta: v("bright-magenta"),
		brightCyan: v("bright-cyan"),
		brightWhite: v("bright-white"),
	};
}

export function TerminalOutput({
	terminalRef,
	className,
	onData,
	onResize,
}: TerminalOutputProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<Terminal | null>(null);
	const fitRef = useRef<FitAddon | null>(null);
	// Latest callbacks in a ref so the xterm effect doesn't need to
	// tear down and recreate the terminal every time the parent rerenders.
	const onDataRef = useRef<typeof onData>(onData);
	const onResizeRef = useRef<typeof onResize>(onResize);
	onDataRef.current = onData;
	onResizeRef.current = onResize;

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const fit = new FitAddon();
		const terminal = new Terminal({
			convertEol: true,
			// stdin enabled — forward keystrokes via onData below.
			disableStdin: false,
			scrollback: 5000,
			fontSize: 12,
			fontFamily: "'GeistMono', 'SF Mono', Monaco, Menlo, monospace",
			lineHeight: 1.3,
			theme: resolveTerminalTheme(),
			cursorBlink: false,
			cursorStyle: "bar",
			cursorInactiveStyle: "none",
		});

		terminal.loadAddon(fit);
		terminal.open(container);

		requestAnimationFrame(() => fit.fit());

		// Every keystroke / paste flows through here. xterm has already done
		// the key → byte translation (e.g. Ctrl+C → `\x03`), we just
		// forward whatever it produced.
		const dataSub = terminal.onData((data) => {
			onDataRef.current?.(data);
		});

		// xterm fires onResize after FitAddon changes the grid, font size
		// changes, etc. Forward to the backend PTY for TIOCSWINSZ.
		const resizeSub = terminal.onResize(({ cols, rows }) => {
			onResizeRef.current?.(cols, rows);
		});

		const resizeObserver = new ResizeObserver(() => {
			requestAnimationFrame(() => {
				try {
					fit.fit();
				} catch {
					// Container might be detached.
				}
			});
		});
		resizeObserver.observe(container);

		// Re-resolve CSS variables when app light/dark mode changes.
		const themeObserver = new MutationObserver(() => {
			terminal.options.theme = resolveTerminalTheme();
		});
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});

		xtermRef.current = terminal;
		fitRef.current = fit;

		if (terminalRef) {
			(terminalRef as React.MutableRefObject<TerminalHandle | null>).current = {
				write: (data: string) => terminal.write(data),
				clear: () => {
					terminal.clear();
					terminal.reset();
				},
				dispose: () => terminal.dispose(),
			};
		}

		return () => {
			dataSub.dispose();
			resizeSub.dispose();
			themeObserver.disconnect();
			resizeObserver.disconnect();
			terminal.dispose();
			xtermRef.current = null;
			fitRef.current = null;
			if (terminalRef) {
				(terminalRef as React.MutableRefObject<TerminalHandle | null>).current =
					null;
			}
		};
	}, [terminalRef]);

	return (
		<div
			className={className}
			style={{
				width: "100%",
				height: "100%",
				padding: "12px 2px 12px 12px",
				backgroundColor: "var(--terminal-background)",
			}}
		>
			<div ref={containerRef} style={{ width: "100%", height: "100%" }} />
		</div>
	);
}
