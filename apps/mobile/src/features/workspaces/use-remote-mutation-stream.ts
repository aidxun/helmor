import { useEffect } from "react";
import {
	createPairedDesktopClient,
	type DesktopConnection,
	type UiMutationEvent,
} from "@/lib/remote";

type UseRemoteMutationStreamOptions = {
	activeDesktop: DesktopConnection | null;
	onMutation: (event: UiMutationEvent) => void;
};

export function useRemoteMutationStream({
	activeDesktop,
	onMutation,
}: UseRemoteMutationStreamOptions) {
	useEffect(() => {
		if (!activeDesktop) return;

		let canceled = false;
		const controller = new AbortController();
		let client: Awaited<ReturnType<typeof createPairedDesktopClient>> | null =
			null;

		void (async () => {
			while (!canceled) {
				try {
					client = await createPairedDesktopClient(activeDesktop);
					await client.streamUiMutations((envelope) => {
						if (!canceled) onMutation(envelope.event);
					}, controller.signal);
				} catch (error) {
					if (canceled || isAbortError(error)) break;
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
		onMutation,
	]);
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === "AbortError";
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
