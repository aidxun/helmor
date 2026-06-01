import {
	isTauri,
	Channel as TauriChannel,
	invoke as tauriInvoke,
} from "@tauri-apps/api/core";
import { listen as tauriListen, type UnlistenFn } from "@tauri-apps/api/event";

export type { UnlistenFn };

type RpcResponse<T> =
	| { ok: true; value: T }
	| { ok: false; error: { message: string; code?: string | null } };

const WEB_CHANNEL_MARKER = "__helmorWebChannelId";

const webChannels = new Map<string, Channel<unknown>>();
let sharedEventSocket: WebSocket | null = null;
let sharedEventSocketUrl: string | null = null;
const eventListeners = new Map<string, Set<(payload: unknown) => void>>();

function isNativeRuntime(): boolean {
	if (import.meta.env.MODE === "test") return true;
	const win = globalThis as typeof globalThis & {
		__TAURI_INTERNALS__?: unknown;
		__TAURI__?: unknown;
		isTauri?: boolean;
	};
	return Boolean(
		isTauri() || win.isTauri || win.__TAURI_INTERNALS__ || win.__TAURI__,
	);
}

export function isRemoteWebRuntime(): boolean {
	return !isNativeRuntime();
}

function remoteToken(): string | null {
	const match = globalThis.location?.pathname.match(/^\/r\/([^/]+)/);
	if (match?.[1]) return decodeURIComponent(match[1]);
	return globalThis.localStorage?.getItem("helmor.remote.token") ?? null;
}

function rpcUrl(path: string): string {
	const configured = import.meta.env.VITE_HELMOR_REMOTE_API_BASE as
		| string
		| undefined;
	const base = configured?.replace(/\/$/, "") ?? "";
	return `${base}${path}`;
}

function encodeWebChannels(value: unknown): unknown {
	if (value instanceof Channel && value.id) {
		return { [WEB_CHANNEL_MARKER]: value.id };
	}
	if (Array.isArray(value)) return value.map(encodeWebChannels);
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, nested] of Object.entries(value)) {
			out[key] = encodeWebChannels(nested);
		}
		return out;
	}
	return value;
}

function unwrapNativeChannels(value: unknown): unknown {
	if (value instanceof Channel && value.native) {
		return value.native;
	}
	if (Array.isArray(value)) return value.map(unwrapNativeChannels);
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, nested] of Object.entries(value)) {
			out[key] = unwrapNativeChannels(nested);
		}
		return out;
	}
	return value;
}

async function webInvoke<T>(command: string, args?: unknown): Promise<T> {
	const token = remoteToken();
	const response = await fetch(rpcUrl("/api/rpc"), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(token ? { "X-Helmor-Remote-Token": token } : {}),
		},
		body: JSON.stringify({
			command,
			args: encodeWebChannels(args ?? {}),
		}),
	});
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}: ${response.statusText}`);
	}
	const payload = (await response.json()) as RpcResponse<T>;
	if (!payload.ok) {
		throw new Error(payload.error.message);
	}
	return payload.value;
}

export function invoke<T>(command: string, args?: unknown): Promise<T> {
	if (isNativeRuntime()) {
		return tauriInvoke<T>(
			command,
			unwrapNativeChannels(args) as Record<string, unknown> | undefined,
		);
	}
	return webInvoke<T>(command, args);
}

export class Channel<T> {
	id: string | null = null;
	native?: TauriChannel<T>;
	private handler: (message: T) => void = () => {};

	constructor() {
		if (isNativeRuntime()) {
			this.native = new TauriChannel<T>();
			return;
		}
		this.id = crypto.randomUUID();
		webChannels.set(this.id, this as Channel<unknown>);
		ensureEventSocket();
	}

	get onmessage(): (message: T) => void {
		return this.handler;
	}

	set onmessage(next: (message: T) => void) {
		this.handler = next;
		if (this.native) {
			this.native.onmessage = next;
		}
	}

	close() {
		if (this.id) webChannels.delete(this.id);
		this.onmessage = () => {};
	}
}

function ensureEventSocket() {
	const token = remoteToken();
	const proto = globalThis.location.protocol === "https:" ? "wss:" : "ws:";
	const configured = import.meta.env.VITE_HELMOR_REMOTE_WS_BASE as
		| string
		| undefined;
	const url =
		configured?.replace(/\/$/, "") ?? `${proto}//${globalThis.location.host}`;
	const fullUrl = `${url}/api/events?token=${encodeURIComponent(token ?? "")}`;
	if (sharedEventSocket && sharedEventSocketUrl === fullUrl) return;

	sharedEventSocket?.close();
	sharedEventSocketUrl = fullUrl;
	sharedEventSocket = new WebSocket(fullUrl);
	sharedEventSocket.onmessage = (message) => {
		const event = JSON.parse(message.data) as {
			event: string;
			payload?: unknown;
			channelId?: string;
		};
		if (event.channelId) {
			webChannels.get(event.channelId)?.onmessage(event.payload);
			return;
		}
		for (const callback of eventListeners.get(event.event) ?? []) {
			callback(event.payload);
		}
	};
	sharedEventSocket.onclose = () => {
		if (sharedEventSocketUrl === fullUrl) {
			sharedEventSocket = null;
		}
	};
}

export async function listen<T>(
	event: string,
	callback: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
	if (isNativeRuntime()) return tauriListen<T>(event, callback);
	const listeners = eventListeners.get(event) ?? new Set();
	const wrapped = (payload: unknown) => callback({ payload: payload as T });
	listeners.add(wrapped);
	eventListeners.set(event, listeners);
	ensureEventSocket();
	return () => {
		listeners.delete(wrapped);
		if (listeners.size === 0) eventListeners.delete(event);
	};
}
