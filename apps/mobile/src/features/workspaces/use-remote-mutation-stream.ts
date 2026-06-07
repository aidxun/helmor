import { useEffect } from "react";
import {
	createPairedDesktopClient,
	type DesktopConnection,
	type UiMutationEvent,
} from "@/lib/remote";
import type { MobileDesktopConnectionState } from "./workspace-context-core";

type UseRemoteMutationStreamOptions = {
	activeDesktop: DesktopConnection | null;
	onMutation: (event: UiMutationEvent) => void;
	onConnectionStateChange?: (state: MobileDesktopConnectionState) => void;
};

export function useRemoteMutationStream({
	activeDesktop,
	onMutation,
	onConnectionStateChange,
}: UseRemoteMutationStreamOptions) {
	useEffect(() => {
		if (!activeDesktop) {
			onConnectionStateChange?.({ status: "idle", message: null });
			return;
		}

		let canceled = false;
		const controller = new AbortController();
		let client: Awaited<ReturnType<typeof createPairedDesktopClient>> | null =
			null;
		let hasConnected = false;

		void (async () => {
			onConnectionStateChange?.({ status: "connecting", message: null });
			while (!canceled) {
				try {
					client = await createPairedDesktopClient(activeDesktop);
					hasConnected = true;
					onConnectionStateChange?.({ status: "connected", message: null });
					await client.streamUiMutations((envelope) => {
						if (!canceled) onMutation(envelope.event);
					}, controller.signal);
				} catch (error) {
					if (canceled || isAbortError(error)) break;
					onConnectionStateChange?.({
						status: hasConnected ? "reconnecting" : "error",
						message: errorMessage(error),
					});
					await delay(1500);
				} finally {
					client?.close();
					client = null;
				}
			}
		})();

		return () => {
			canceled = true;
			controller.abort();
			client?.close();
		};
	}, [
		activeDesktop?.desktopId,
		activeDesktop?.host,
		activeDesktop?.pat,
		onConnectionStateChange,
		onMutation,
	]);
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === "AbortError";
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
