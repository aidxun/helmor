import {
	createPairingClient,
	prioritizeHosts,
	type RemoteProgress,
} from "./rpc-client";
import { upsertDesktopConnection } from "./store";
import type { DesktopConnectionState, MobilePairingPayload } from "./types";

export { normalizePairingPayload } from "./pairing-payload";

export async function pairDesktop(
	payload: MobilePairingPayload,
	onProgress?: RemoteProgress,
): Promise<DesktopConnectionState> {
	onProgress?.(
		`Pairing payload: ${payload.desktopName} on ${payload.hosts.join(", ")}:${payload.port}`,
	);
	if (new Date(payload.expiresAt).valueOf() < Date.now()) {
		throw new Error("Pairing code expired");
	}
	const client = await createPairingClient(payload, onProgress);
	try {
		onProgress?.("Completing pairing over SSH");
		const result = await client.completePairing();
		onProgress?.(`Paired as device ${result.deviceId}`);
		return await upsertDesktopConnection({
			desktopId: result.desktopId,
			desktopName: result.desktopName,
			hosts: prioritizeHosts(payload.hosts, client.connectedHost),
			port: payload.port,
			hostKeyFingerprint: payload.hostKeyFingerprint ?? "",
			deviceId: result.deviceId,
			deviceSecret: result.deviceSecret,
			lastSyncedAt: null,
		});
	} finally {
		client.close();
	}
}
