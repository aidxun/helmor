# Conductor Fixture Export

This directory contains a small, safe export script for creating repo-scoped Conductor fixtures for Helmor UI development.

## What It Does

The script exports one Conductor repo at a time and writes the result into `.local-data/`.

It copies:

- a trimmed copy of `conductor.db`
- archived workspace data for the chosen repo from `~/conductor/archived-contexts/<repo>`
- live workspace `.context` directories for non-archived workspaces from `~/conductor/workspaces/<repo>/*/.context`

It intentionally does **not** copy:

- the full repo working trees
- `.git`
- `node_modules`
- `.claude`
- `.codex`
- the rest of the Conductor home directory

That keeps the fixture small and avoids the runaway copy problem we hit when trying to export the whole `~/conductor` tree.

## Safety Rules

The script is designed to be conservative:

- It refuses to run while `Conductor` is open.
- It only reads from the source Conductor directories.
- It only writes inside the chosen output directory.
- It exports one repo at a time.
- It redacts token-like settings in the copied database by default.

Source paths it reads:

- `~/Library/Application Support/com.conductor.app/conductor.db`
- `~/conductor/archived-contexts/<repo>`
- `~/conductor/workspaces/<repo>/*/.context`

## Usage

Run from the repo root:

```bash
scripts/conductor/export-repo-fixture.sh --repo dosu-cli
```

By default, it writes to:

```text
.local-data/conductor/conductor-<repo>-fixture-<timestamp>
```

Example with a custom output root:

```bash
scripts/conductor/export-repo-fixture.sh \
  --repo dosu-cli \
  --output-root /tmp/helmor-fixtures
```

If you really want to preserve token-like settings in the copied DB:

```bash
scripts/conductor/export-repo-fixture.sh \
  --repo dosu-cli \
  --keep-sensitive-settings
```

## Output Layout

The generated fixture looks like this:

```text
.local-data/conductor/conductor-dosu-cli-fixture-<timestamp>/
  com.conductor.app/
    conductor.db
  helmor/
    archived-contexts/
      dosu-cli/
    workspaces/
      dosu-cli/
        <live-workspace>/.context/
```

## Notes

- The database schema stays Conductor-compatible.
- Attachment paths are rewritten to point at the copied fixture directories.
- Some attachments may still point outside the fixture, for example `/tmp/...` files that never lived in Conductor storage.
- Message bodies are left as-is. They may still mention old filesystem paths in plain text or JSON payloads, which is fine for UI development.
