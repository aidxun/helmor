import * as SecureStore from "expo-secure-store";
import type { DesktopConnection, DesktopConnectionState } from "./types";

const KEY = "helmor.mobile.desktopConnections.v1";

const EMPTY_STATE: DesktopConnectionState = {
	activeDesktopId: null,
	connections: [],
};

export async function loadDesktopConnectionState(): Promise<DesktopConnectionState> {
	const raw = await SecureStore.getItemAsync(KEY);
	if (!raw) return EMPTY_STATE;
	try {
		const parsed = JSON.parse(raw) as DesktopConnectionState;
		return {
			activeDesktopId: parsed.activeDesktopId ?? null,
			connections: Array.isArray(parsed.connections) ? parsed.connections : [],
		};
	} catch {
		return EMPTY_STATE;
	}
}

export async function saveDesktopConnectionState(
	state: DesktopConnectionState,
): Promise<void> {
	await SecureStore.setItemAsync(KEY, JSON.stringify(state), {
		keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
	});
}

export async function upsertDesktopConnection(
	connection: DesktopConnection,
): Promise<DesktopConnectionState> {
	const state = await loadDesktopConnectionState();
	const connections = [
		connection,
		...state.connections.filter(
			(item) => item.desktopId !== connection.desktopId,
		),
	];
	const next = {
		activeDesktopId: connection.desktopId,
		connections,
	};
	await saveDesktopConnectionState(next);
	return next;
}

export async function setActiveDesktopConnection(
	desktopId: string,
): Promise<DesktopConnectionState> {
	const state = await loadDesktopConnectionState();
	const next = {
		...state,
		activeDesktopId: state.connections.some(
			(connection) => connection.desktopId === desktopId,
		)
			? desktopId
			: state.activeDesktopId,
	};
	await saveDesktopConnectionState(next);
	return next;
}

export async function removeDesktopConnection(
	desktopId: string,
): Promise<DesktopConnectionState> {
	const state = await loadDesktopConnectionState();
	const connections = state.connections.filter(
		(connection) => connection.desktopId !== desktopId,
	);
	const activeDesktopId =
		state.activeDesktopId === desktopId
			? (connections[0]?.desktopId ?? null)
			: state.activeDesktopId;
	const next = { activeDesktopId, connections };
	await saveDesktopConnectionState(next);
	return next;
}

export function getActiveDesktopConnection(
	state: DesktopConnectionState,
): DesktopConnection | null {
	return (
		state.connections.find(
			(connection) => connection.desktopId === state.activeDesktopId,
		) ??
		state.connections[0] ??
		null
	);
}
