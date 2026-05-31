import type { ThreadMessageLike } from "@helmor/thread-schema";
import { getCacheDb } from "./db";
import { nowIso, safeJsonParse } from "./json";

const MAX_CACHED_THREADS_PER_DESKTOP = 25;

type ThreadRow = {
	messages_json: string;
	updated_at: string;
};

export type CachedThreadMessages = {
	messages: ThreadMessageLike[];
	updatedAt: string;
};

export async function loadCachedThreadMessages(
	desktopId: string,
	sessionId: string,
): Promise<CachedThreadMessages | null> {
	const db = await getCacheDb();
	const row = await db.getFirstAsync<ThreadRow>(
		`SELECT messages_json, updated_at
		 FROM session_threads
		 WHERE desktop_id = ? AND session_id = ?`,
		desktopId,
		sessionId,
	);
	if (!row) return null;
	const messages = safeJsonParse<ThreadMessageLike[]>(row.messages_json);
	if (!Array.isArray(messages)) return null;
	return {
		messages,
		updatedAt: row.updated_at,
	};
}

export async function writeCachedThreadMessages({
	desktopId,
	sessionId,
	messages,
}: {
	desktopId: string;
	sessionId: string;
	messages: ThreadMessageLike[];
}): Promise<void> {
	const db = await getCacheDb();
	await db.runAsync(
		`INSERT OR REPLACE INTO session_threads
		 (desktop_id, session_id, messages_json, updated_at)
		 VALUES (?, ?, ?, ?)`,
		desktopId,
		sessionId,
		JSON.stringify(messages),
		nowIso(),
	);
	await pruneCachedThreadMessages(desktopId);
}

async function pruneCachedThreadMessages(desktopId: string): Promise<void> {
	const db = await getCacheDb();
	await db.runAsync(
		`DELETE FROM session_threads
		 WHERE desktop_id = ?
		   AND session_id NOT IN (
			 SELECT session_id
			 FROM session_threads
			 WHERE desktop_id = ?
			 ORDER BY updated_at DESC
			 LIMIT ?
		   )`,
		desktopId,
		desktopId,
		MAX_CACHED_THREADS_PER_DESKTOP,
	);
}
