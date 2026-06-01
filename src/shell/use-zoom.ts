import { useEffect } from "react";
import { useSettings } from "@/lib/settings";
import { isRemoteWebRuntime } from "@/lib/tauri-transport";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;

export function clampZoom(value: number): number {
	if (!Number.isFinite(value)) return 1.0;
	const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
	// Snap to 2 decimals so repeated +/- doesn't drift (0.1 isn't exact in fp).
	return Math.round(clamped * 100) / 100;
}

/** Applies the current zoom to the webview whenever the setting changes. */
export function useZoom(): void {
	const { settings } = useSettings();
	const zoom = settings.zoomLevel;

	useEffect(() => {
		if (isRemoteWebRuntime()) {
			document.documentElement.style.setProperty("zoom", String(zoom));
			return () => {
				document.documentElement.style.removeProperty("zoom");
			};
		}

		void import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => {
			void getCurrentWebview()
				.setZoom(zoom)
				.catch(() => {
					// webview may not be ready yet, or we're in a non-Tauri env
				});
		});
	}, [zoom]);
}

export { ZOOM_STEP };
