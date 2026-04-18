import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect } from "react";
import { isPrimaryModifier } from "@/lib/keyboard-modifier";
import { useSettings } from "@/lib/settings";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;

function clampZoom(value: number): number {
	if (!Number.isFinite(value)) return 1.0;
	const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
	// Snap to 2 decimals so repeated +/- doesn't drift (0.1 isn't exact in fp).
	return Math.round(clamped * 100) / 100;
}

/**
 * Binds Cmd+= / Cmd+- / Cmd+0 to webview zoom and persists the level.
 * Applies the current zoom to the webview whenever the setting changes.
 */
export function useZoom(): void {
	const { settings, updateSettings } = useSettings();
	const zoom = settings.zoomLevel;

	useEffect(() => {
		void getCurrentWebview()
			.setZoom(zoom)
			.catch(() => {
				// webview may not be ready yet, or we're in a non-Tauri env
			});
	}, [zoom]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (!isPrimaryModifier(e)) return;
			// Cmd+= is "zoom in" on macOS (Cmd++ requires shift); accept both.
			if (e.key === "=" || e.key === "+") {
				e.preventDefault();
				updateSettings({ zoomLevel: clampZoom(zoom + ZOOM_STEP) });
			} else if (e.key === "-") {
				e.preventDefault();
				updateSettings({ zoomLevel: clampZoom(zoom - ZOOM_STEP) });
			} else if (e.key === "0") {
				e.preventDefault();
				updateSettings({ zoomLevel: 1.0 });
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [zoom, updateSettings]);
}
