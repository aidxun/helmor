import type { CompactPairingPayload, DesktopConnection } from "./types";

const STORAGE_KEY = "helmor.mobileWeb.connection.v1";

export function loadConnectionFromStorage(): DesktopConnection | null {
	const raw = window.localStorage.getItem(STORAGE_KEY);
	if (!raw) return null;
	try {
		const value = JSON.parse(raw) as DesktopConnection;
		if (!value.host || !value.pat || !value.desktopId) return null;
		return value;
	} catch {
		return null;
	}
}

export function saveConnection(connection: DesktopConnection) {
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(connection));
}

export function clearConnection() {
	window.localStorage.removeItem(STORAGE_KEY);
}

export function consumePairingFromHash(): DesktopConnection | null {
	const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
	const encoded = hash.get("p");
	if (!encoded) return null;

	const payload = decodeBase64UrlJson<CompactPairingPayload>(encoded);
	const connection: DesktopConnection = {
		host: payload.h,
		pat: payload.p,
		desktopId: payload.d,
		desktopName: payload.n,
	};
	saveConnection(connection);
	window.history.replaceState(
		null,
		"",
		`${window.location.pathname}${window.location.search}`,
	);
	return connection;
}

function decodeBase64UrlJson<T>(value: string): T {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized.padEnd(
		normalized.length + ((4 - (normalized.length % 4)) % 4),
		"=",
	);
	const binary = window.atob(padded);
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
	return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
