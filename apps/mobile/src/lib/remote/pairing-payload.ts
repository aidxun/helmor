import type { MobilePairingPayload } from "./types";

type CompactPairingPayload = {
	v?: number;
	h?: string;
	p?: string;
	d?: string;
	n?: string;
	i?: string;
	s?: boolean;
};

export function normalizePairingPayload(input: unknown): MobilePairingPayload {
	if (isVerbosePairingPayload(input)) return input;
	if (!isRecord(input)) {
		throw new Error("Invalid pairing payload");
	}

	const compact = input as CompactPairingPayload;
	const payload = {
		v: compact.v,
		host: compact.h,
		pat: compact.p,
		desktopId: compact.d,
		desktopName: compact.n,
		deviceId: compact.i,
		stable: compact.s,
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
		input.v === 1 &&
		typeof input.host === "string" &&
		typeof input.pat === "string" &&
		typeof input.desktopId === "string" &&
		typeof input.desktopName === "string" &&
		(input.deviceId === undefined || typeof input.deviceId === "string") &&
		(input.stable === undefined || typeof input.stable === "boolean")
	);
}

function isRecord(input: unknown): input is Record<string, unknown> {
	return typeof input === "object" && input !== null;
}
