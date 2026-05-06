import {
	type KeyboardEvent,
	type MouseEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	clampSidebarWidth,
	getInitialSidebarWidth,
	INSPECTOR_WIDTH_STORAGE_KEY,
	SIDEBAR_RESIZE_HIT_AREA,
	SIDEBAR_RESIZE_STEP,
	SIDEBAR_WIDTH_STORAGE_KEY,
} from "@/shell/layout";

type ResizeTarget = "sidebar" | "inspector";

type ResizeState = {
	pointerX: number;
	width: number;
};

function persistPanelWidth(storageKey: string, width: number) {
	try {
		window.localStorage.setItem(storageKey, String(width));
	} catch (error) {
		console.error(
			`[helmor] panel width save failed for "${storageKey}"`,
			error,
		);
	}
}

export function useShellPanels() {
	const [sidebarWidth, setSidebarWidth] = useState(getInitialSidebarWidth);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [sidebarResizeActive, setSidebarResizeActive] = useState(false);
	const [inspectorWidth, setInspectorWidth] = useState(() =>
		getInitialSidebarWidth(INSPECTOR_WIDTH_STORAGE_KEY),
	);
	const [resizeState, setResizeState] = useState<ResizeState | null>(null);
	const activeResizeTargetRef = useRef<ResizeTarget | null>(null);
	const resizeCleanupRef = useRef<(() => void) | null>(null);
	const sidebarWidthRef = useRef(sidebarWidth);
	const inspectorWidthRef = useRef(inspectorWidth);

	useEffect(() => {
		return () => {
			resizeCleanupRef.current?.();
		};
	}, []);

	useEffect(() => {
		if (activeResizeTargetRef.current === "sidebar") {
			return;
		}
		sidebarWidthRef.current = sidebarWidth;
		persistPanelWidth(SIDEBAR_WIDTH_STORAGE_KEY, sidebarWidth);
	}, [sidebarWidth]);

	useEffect(() => {
		if (activeResizeTargetRef.current === "inspector") {
			return;
		}
		inspectorWidthRef.current = inspectorWidth;
		persistPanelWidth(INSPECTOR_WIDTH_STORAGE_KEY, inspectorWidth);
	}, [inspectorWidth]);

	useEffect(() => {
		if (!resizeState) {
			return;
		}

		let pendingWidth: number | null = null;
		let rafId: number | null = null;
		const flush = () => {
			rafId = null;
			if (pendingWidth === null) return;
			const nextWidth = pendingWidth;
			pendingWidth = null;
			inspectorWidthRef.current = nextWidth;
			setInspectorWidth(nextWidth);
		};

		const handleMouseMove = (event: globalThis.MouseEvent) => {
			const deltaX = event.clientX - resizeState.pointerX;
			const rawWidth = resizeState.width - deltaX;
			pendingWidth = clampSidebarWidth(rawWidth);
			if (rafId === null) {
				rafId = window.requestAnimationFrame(flush);
			}
		};
		const handleMouseUp = () => {
			const finalWidth = pendingWidth ?? inspectorWidthRef.current;
			if (rafId !== null) {
				window.cancelAnimationFrame(rafId);
				rafId = null;
			}
			flush();
			persistPanelWidth(INSPECTOR_WIDTH_STORAGE_KEY, finalWidth);
			activeResizeTargetRef.current = null;
			setResizeState(null);
		};
		const previousCursor = document.body.style.cursor;
		const previousUserSelect = document.body.style.userSelect;

		document.body.style.cursor = "ew-resize";
		document.body.style.userSelect = "none";

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);

		activeResizeTargetRef.current = "inspector";
		return () => {
			if (rafId !== null) {
				window.cancelAnimationFrame(rafId);
			}
			document.body.style.cursor = previousCursor;
			document.body.style.userSelect = previousUserSelect;
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [resizeState]);

	const handleResizeStart = useCallback(
		(target: ResizeTarget) => (event: MouseEvent<HTMLDivElement>) => {
			if (event.button !== 0) return;
			event.preventDefault();

			if (target === "sidebar") {
				resizeCleanupRef.current?.();
				const resizeHandle = event.currentTarget;
				const shell = resizeHandle.parentElement;
				const sidebar = shell?.querySelector<HTMLElement>(
					"[data-helmor-sidebar-root]",
				);

				if (!sidebar) {
					return;
				}

				const startPointerX = event.clientX;
				const startWidth = sidebarWidthRef.current;
				let pendingWidth: number | null = null;
				let rafId: number | null = null;
				let finalWidth = startWidth;
				const previousCursor = document.body.style.cursor;
				const previousUserSelect = document.body.style.userSelect;

				const applyWidth = (width: number) => {
					finalWidth = width;
					sidebarWidthRef.current = width;
					sidebar.style.width = `${width}px`;
					resizeHandle.style.left = `${width - SIDEBAR_RESIZE_HIT_AREA / 2}px`;
					resizeHandle.setAttribute("aria-valuenow", String(width));
				};

				const flush = () => {
					rafId = null;
					if (pendingWidth === null) return;
					const nextWidth = pendingWidth;
					pendingWidth = null;
					applyWidth(nextWidth);
				};

				const cleanup = () => {
					if (rafId !== null) {
						window.cancelAnimationFrame(rafId);
						rafId = null;
					}
					document.body.style.cursor = previousCursor;
					document.body.style.userSelect = previousUserSelect;
					window.removeEventListener("mousemove", handleMouseMove);
					window.removeEventListener("mouseup", handleMouseUp);
					activeResizeTargetRef.current = null;
					resizeCleanupRef.current = null;
					setSidebarResizeActive(false);
				};

				const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
					pendingWidth = clampSidebarWidth(
						startWidth + moveEvent.clientX - startPointerX,
					);
					if (rafId === null) {
						rafId = window.requestAnimationFrame(flush);
					}
				};

				const handleMouseUp = () => {
					flush();
					persistPanelWidth(SIDEBAR_WIDTH_STORAGE_KEY, finalWidth);
					cleanup();
					if (finalWidth !== sidebarWidth) {
						setSidebarWidth(finalWidth);
					}
				};

				activeResizeTargetRef.current = "sidebar";
				resizeCleanupRef.current = cleanup;
				setSidebarResizeActive(true);
				document.body.style.cursor = "ew-resize";
				document.body.style.userSelect = "none";
				window.addEventListener("mousemove", handleMouseMove);
				window.addEventListener("mouseup", handleMouseUp);
				return;
			}

			setResizeState({
				pointerX: event.clientX,
				width: inspectorWidth,
			});
		},
		[sidebarWidth, inspectorWidth],
	);

	const handleResizeKeyDown = useCallback(
		(target: ResizeTarget) => (event: KeyboardEvent<HTMLDivElement>) => {
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				if (target === "sidebar") {
					setSidebarWidth((currentWidth) =>
						clampSidebarWidth(currentWidth - SIDEBAR_RESIZE_STEP),
					);
					return;
				}

				setInspectorWidth((currentWidth) =>
					clampSidebarWidth(currentWidth + SIDEBAR_RESIZE_STEP),
				);
			}

			if (event.key === "ArrowRight") {
				event.preventDefault();
				if (target === "sidebar") {
					setSidebarWidth((currentWidth) =>
						clampSidebarWidth(currentWidth + SIDEBAR_RESIZE_STEP),
					);
					return;
				}

				setInspectorWidth((currentWidth) =>
					clampSidebarWidth(currentWidth - SIDEBAR_RESIZE_STEP),
				);
			}
		},
		[],
	);

	return {
		handleResizeKeyDown,
		handleResizeStart,
		inspectorWidth,
		isInspectorResizing: resizeState !== null,
		isSidebarResizing: sidebarResizeActive,
		sidebarCollapsed,
		sidebarWidth,
		setInspectorWidth,
		setSidebarCollapsed,
		setSidebarWidth,
	};
}
