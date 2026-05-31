import type { SQLiteDatabase } from "expo-sqlite";
import * as SQLite from "expo-sqlite";

const DB_NAME = "helmor_mobile_cache.db";
const SCHEMA_VERSION = "1";

let dbPromise: Promise<SQLiteDatabase> | null = null;

export async function getCacheDb(): Promise<SQLiteDatabase> {
	dbPromise ??= openAndMigrate();
	return dbPromise;
}

async function openAndMigrate(): Promise<SQLiteDatabase> {
	const db = await SQLite.openDatabaseAsync(DB_NAME);
	await createTables(db);
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
