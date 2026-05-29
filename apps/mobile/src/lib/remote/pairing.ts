import { createPairingClient, type RemoteProgress } from "./rpc-client";
import { upsertDesktopConnection } from "./store";
import type { DesktopConnectionState, MobilePairingPayload } from "./types";

export { normalizePairingPayload } from "./pairing-payload";

export async function pairDesktop(
	payload: MobilePairingPayload,
	onProgress?: RemoteProgress,
): Promise<DesktopConnectionState> {
	onProgress?.(`Pairing payload: ${payload.desktopName} at ${payload.host}`);
	const client = await createPairingClient(payload, onProgress);
	try {
		onProgress?.("Verifying companion health");
		const health = await client.health();
		if (!health.ok) {
			throw new Error("Companion health check failed");
		}
		onProgress?.(`Connected to ${health.desktopName}`);
		return await upsertDesktopConnection({
			desktopId: health.desktopId || payload.desktopId,
			desktopName: health.desktopName || payload.desktopName,
			host: payload.host,
			pat: payload.pat,
			lastSyncedAt: null,
		});
	} finally {
		client.close();
	}
}
