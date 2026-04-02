#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Export a repo-scoped Conductor fixture for Helmor UI development.

This script is intentionally conservative:
- It refuses to run while Conductor is open.
- It only reads from the source Conductor directories.
- It only writes inside the chosen output directory.
- It exports one repo at a time to keep fixtures small.

Usage:
  scripts/conductor/export-repo-fixture.sh --repo <repo-name> [options]

Options:
  --repo <name>                 Required. Repo name from the `repos` table.
  --source-app-support <dir>    Source app support dir.
                                Default: ~/Library/Application Support/com.conductor.app
  --source-home <dir>           Source Conductor home dir.
                                Default: ~/conductor
  --output-root <dir>           Output root for the generated fixture.
                                Default: ./.local-data/conductor
  --keep-sensitive-settings     Do not redact token-like settings in the copied DB.
  -h, --help                    Show this help text.

Examples:
  scripts/conductor/export-repo-fixture.sh --repo dosu-cli
  scripts/conductor/export-repo-fixture.sh \
    --repo dosu-cli \
    --output-root /tmp/helmor-fixtures
EOF
}

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

repo=""
source_app_support="${HOME}/Library/Application Support/com.conductor.app"
source_home="${HOME}/conductor"
output_root=""
keep_sensitive_settings=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      [[ $# -ge 2 ]] || fail "--repo requires a value"
      repo="$2"
      shift 2
      ;;
    --source-app-support)
      [[ $# -ge 2 ]] || fail "--source-app-support requires a value"
      source_app_support="$2"
      shift 2
      ;;
    --source-home)
      [[ $# -ge 2 ]] || fail "--source-home requires a value"
      source_home="$2"
      shift 2
      ;;
    --output-root)
      [[ $# -ge 2 ]] || fail "--output-root requires a value"
      output_root="$2"
      shift 2
      ;;
    --keep-sensitive-settings)
      keep_sensitive_settings=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

[[ -n "$repo" ]] || {
  usage
  exit 1
}

need_cmd sqlite3
need_cmd rsync

if pgrep -x "Conductor" >/dev/null 2>&1; then
  fail "Conductor is still running. Close it first so the source database stays stable."
fi

[[ -d "$source_app_support" ]] || fail "missing source app support dir: $source_app_support"
[[ -f "$source_app_support/conductor.db" ]] || fail "missing source database: $source_app_support/conductor.db"
[[ -d "$source_home" ]] || fail "missing source home dir: $source_home"

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
if [[ -z "$output_root" ]]; then
  output_root="${project_root}/.local-data/conductor"
fi
mkdir -p "$output_root"
output_root="$(cd "$output_root" && pwd -P)"

timestamp="$(date +%Y%m%d-%H%M%S)"
fixture_name="conductor-${repo}-fixture-${timestamp}"
final_dir="${output_root}/${fixture_name}"
tmp_dir="${final_dir}.tmp"
db_path="${tmp_dir}/com.conductor.app/conductor.db"
fixture_home="${tmp_dir}/helmor"
final_fixture_home="${final_dir}/helmor"

cleanup() {
  local exit_code=$?
  if [[ $exit_code -ne 0 && -d "$tmp_dir" ]]; then
    rm -rf "$tmp_dir"
  fi
}
trap cleanup EXIT

[[ ! -e "$final_dir" ]] || fail "destination already exists: $final_dir"
[[ ! -e "$tmp_dir" ]] || fail "temporary destination already exists: $tmp_dir"

mkdir -p "${tmp_dir}/com.conductor.app" "${fixture_home}/archived-contexts/${repo}" "${fixture_home}/workspaces/${repo}"

cp -p "${source_app_support}/conductor.db" "${db_path}"

repo_sql="$(sql_escape "$repo")"
repo_id="$(sqlite3 "$db_path" "select id from repos where name = '${repo_sql}' limit 1;")"
[[ -n "$repo_id" ]] || fail "repo not found in source database: $repo"
repo_id_sql="$(sql_escape "$repo_id")"

archived_repo_dir="${source_home}/archived-contexts/${repo}"
if [[ -d "$archived_repo_dir" ]]; then
  rsync -aE "${archived_repo_dir}/" "${fixture_home}/archived-contexts/${repo}/"
fi

sqlite3 "$db_path" <<SQL
PRAGMA foreign_keys = OFF;
BEGIN;
DELETE FROM diff_comments
WHERE workspace_id NOT IN (
  SELECT id FROM workspaces WHERE repository_id = '${repo_id_sql}'
);

DELETE FROM attachments
WHERE session_id NOT IN (
  SELECT s.id
  FROM sessions s
  JOIN workspaces w ON w.id = s.workspace_id
  WHERE w.repository_id = '${repo_id_sql}'
);

DELETE FROM session_messages
WHERE session_id NOT IN (
  SELECT s.id
  FROM sessions s
  JOIN workspaces w ON w.id = s.workspace_id
  WHERE w.repository_id = '${repo_id_sql}'
);

DELETE FROM sessions
WHERE workspace_id NOT IN (
  SELECT id FROM workspaces WHERE repository_id = '${repo_id_sql}'
);

DELETE FROM workspaces
WHERE repository_id != '${repo_id_sql}';

DELETE FROM repos
WHERE id != '${repo_id_sql}';

DELETE FROM symlinks_pending_deletion;
COMMIT;
SQL

live_workspace_count=0
while IFS= read -r workspace_name; do
  [[ -n "$workspace_name" ]] || continue
  source_context="${source_home}/workspaces/${repo}/${workspace_name}/.context"
  dest_context="${fixture_home}/workspaces/${repo}/${workspace_name}/.context"
  if [[ -d "$source_context" ]]; then
    mkdir -p "$(dirname "$dest_context")"
    rsync -aE "${source_context}/" "${dest_context}/"
    live_workspace_count=$((live_workspace_count + 1))
  fi
done < <(
  sqlite3 "$db_path" "select directory_name from workspaces where state != 'archived' and directory_name is not null order by directory_name;"
)

old_home_sql="$(sql_escape "$source_home")"
new_home_sql="$(sql_escape "$final_fixture_home")"

sqlite3 "$db_path" <<SQL
UPDATE attachments
SET path = replace(
  path,
  '${old_home_sql}/workspaces/${repo_sql}/',
  '${new_home_sql}/workspaces/${repo_sql}/'
)
WHERE path LIKE '${old_home_sql}/workspaces/${repo_sql}/%';
SQL

while IFS= read -r archived_workspace_name; do
  [[ -n "$archived_workspace_name" ]] || continue
  archived_workspace_sql="$(sql_escape "$archived_workspace_name")"
  sqlite3 "$db_path" <<SQL
UPDATE attachments
SET path = replace(
  path,
  '${old_home_sql}/workspaces/${repo_sql}/${archived_workspace_sql}/.context/attachments/',
  '${new_home_sql}/archived-contexts/${repo_sql}/${archived_workspace_sql}/attachments/'
)
WHERE path LIKE '${old_home_sql}/workspaces/${repo_sql}/${archived_workspace_sql}/.context/attachments/%';
SQL
done < <(
  sqlite3 "$db_path" "select directory_name from workspaces where state = 'archived' and directory_name is not null order by directory_name;"
)

if [[ "$keep_sensitive_settings" -eq 0 ]]; then
  sqlite3 "$db_path" <<'SQL'
UPDATE settings
SET value = '[REDACTED]'
WHERE lower(key) LIKE '%token%';
SQL
fi

sqlite3 "$db_path" "VACUUM;"

mv "$tmp_dir" "$final_dir"
trap - EXIT

counts_sql="
select 'repos', count(*) from repos
union all
select 'workspaces', count(*) from workspaces
union all
select 'sessions', count(*) from sessions
union all
select 'session_messages', count(*) from session_messages
union all
select 'attachments', count(*) from attachments
union all
select 'diff_comments', count(*) from diff_comments
union all
select 'attachments_under_fixture', count(*) from attachments where path like '$(sql_escape "$final_dir")/%'
union all
select 'attachments_outside_fixture', count(*) from attachments where path not like '$(sql_escape "$final_dir")/%';
"

printf 'Created fixture: %s\n' "$final_dir"
printf 'Copied live .context directories: %s\n' "$live_workspace_count"
sqlite3 "$final_dir/com.conductor.app/conductor.db" "$counts_sql"
