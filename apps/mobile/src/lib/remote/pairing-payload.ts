import type { MobilePairingPayload } from "./types";

type CompactPairingPayload = {
	v?: number;
	n?: string;
	h?: string[];
	p?: number;
	u?: string;
	s?: string;
	e?: string;
	k?: string;
};

export function normalizePairingPayload(input: unknown): MobilePairingPayload {
	if (isVerbosePairingPayload(input)) return input;
	if (!isRecord(input)) {
		throw new Error("Invalid pairing payload");
	}

	const compact = input as CompactPairingPayload;
	const payload = {
		protocolVersion: compact.v,
		desktopName: compact.n,
		hosts: compact.h,
		port: compact.p,
		pairingUser: compact.u,
		pairingSecret: compact.s,
		expiresAt: compact.e,
		hostKeyFingerprint: compact.k,
	};
	if (!isVerbosePairingPayload(payload)) {
		throw new Error("Invalid pairing payload");
	}
	return payload;
}

function isVerbosePairingPayload(
	input: unknown,
): input is MobilePairingPayload {
	if (!isRecord(input)) return false;
	return (
		typeof input.protocolVersion === "number" &&
		typeof input.desktopName === "string" &&
		Array.isArray(input.hosts) &&
		input.hosts.every((host) => typeof host === "string") &&
		typeof input.port === "number" &&
		typeof input.pairingUser === "string" &&
		typeof input.pairingSecret === "string" &&
		typeof input.expiresAt === "string" &&
		(input.hostKeyFingerprint === undefined ||
			typeof input.hostKeyFingerprint === "string")
	);
}

function isRecord(input: unknown): input is Record<string, unknown> {
	return typeof input === "object" && input !== null;
}
