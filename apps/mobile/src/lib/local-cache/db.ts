import type { SQLiteDatabase } from "expo-sqlite";
import * as SQLite from "expo-sqlite";

const DB_NAME = "helmor_mobile_cache.db";
const SCHEMA_VERSION = "1";

let dbPromise: Promise<SQLiteDatabase> | null = null;

export async function getCacheDb(): Promise<SQLiteDatabase> {
	dbPromise ??= openAndMigrate();
	return dbPromise;
}

export type LocalCacheSummary = {
	desktopCount: number;
	threadCount: number;
	selectionCount: number;
};

export async function getLocalCacheSummary(): Promise<LocalCacheSummary> {
	const db = await getCacheDb();
	const [desktops, threads, selections] = await Promise.all([
		countRows(db, "desktop_snapshots"),
		countRows(db, "session_threads"),
		countRows(db, "workspace_selection"),
	]);
	return {
		desktopCount: desktops,
		threadCount: threads,
		selectionCount: selections,
	};
}

export async function clearLocalCache(): Promise<void> {
	const db = await getCacheDb();
	await db.execAsync(`
		DELETE FROM desktop_snapshots;
		DELETE FROM workspace_selection;
		DELETE FROM session_threads;
	`);
}

async function countRows(
	db: SQLiteDatabase,
	tableName: "desktop_snapshots" | "session_threads" | "workspace_selection",
): Promise<number> {
	const row = await db.getFirstAsync<{ count: number }>(
		`SELECT COUNT(*) AS count FROM ${tableName}`,
	);
	return row?.count ?? 0;
}

async function openAndMigrate(): Promise<SQLiteDatabase> {
	const db = await SQLite.openDatabaseAsync(DB_NAME);
	await createTables(db);
	await ensureWorkspaceSelectionColumns(db);
	const version = await db.getFirstAsync<{ value: string }>(
		"SELECT value FROM cache_meta WHERE key = ?",
		"schemaVersion",
	);
	if (!version) {
		await db.runAsync(
			"INSERT OR REPLACE INTO cache_meta (key, value) VALUES (?, ?)",
			"schemaVersion",
			SCHEMA_VERSION,
		);
		return db;
	}
	if (version.value !== SCHEMA_VERSION) {
		await resetSchema(db);
		await ensureWorkspaceSelectionColumns(db);
	}
	return db;
}

async function resetSchema(db: SQLiteDatabase): Promise<void> {
	await db.execAsync(`
		DROP TABLE IF EXISTS desktop_snapshots;
		DROP TABLE IF EXISTS workspace_selection;
		DROP TABLE IF EXISTS session_threads;
		DROP TABLE IF EXISTS cache_meta;
	`);
	await createTables(db);
	await db.runAsync(
		"INSERT OR REPLACE INTO cache_meta (key, value) VALUES (?, ?)",
		"schemaVersion",
		SCHEMA_VERSION,
	);
}

async function createTables(db: SQLiteDatabase): Promise<void> {
	await db.execAsync(`
		PRAGMA journal_mode = WAL;

		CREATE TABLE IF NOT EXISTS cache_meta (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS desktop_snapshots (
			desktop_id TEXT PRIMARY KEY,
			groups_json TEXT NOT NULL,
			repositories_json TEXT NOT NULL,
			synced_at TEXT,
			cached_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS workspace_selection (
			desktop_id TEXT PRIMARY KEY,
			selected_workspace_id TEXT,
			selected_session_ids_json TEXT NOT NULL,
			last_new_workspace_target_json TEXT,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS session_threads (
			desktop_id TEXT NOT NULL,
			session_id TEXT NOT NULL,
			messages_json TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			PRIMARY KEY (desktop_id, session_id)
		);

		CREATE INDEX IF NOT EXISTS session_threads_desktop_updated_idx
			ON session_threads(desktop_id, updated_at DESC);
	`);
}

async function ensureWorkspaceSelectionColumns(
	db: SQLiteDatabase,
): Promise<void> {
	const columns = await db.getAllAsync<{ name: string }>(
		"PRAGMA table_info(workspace_selection)",
	);
	if (
		!columns.some((column) => column.name === "last_new_workspace_target_json")
	) {
		await db.execAsync(
			"ALTER TABLE workspace_selection ADD COLUMN last_new_workspace_target_json TEXT",
		);
	}
}
