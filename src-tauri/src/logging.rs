//! Structured JSON logging with daily rotation.
//!
//! Single file per component: `rust.YYYY-MM-DD.jsonl` under the data-dir `logs/` folder.
//! Dev builds also print human-readable output to stderr.
//! Old log files are gzip-compressed on startup; files older than 7 days are purged.
//!
//! Level defaults:
//! - dev: `warn,helmor_lib=debug,helmor=debug` — app crates debug, deps warn.
//!   Keeps hyper/reqwest/rustls/h2 connection traces out of the stream.
//! - release: `info`.
//!
//! Override with `HELMOR_LOG`. Accepts either a bare level (`debug`, `info`, ...)
//! or a full `EnvFilter` directive list (e.g. `info,helmor_lib=trace,hyper=debug`).

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{
    fmt, fmt::time::ChronoLocal, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter, Layer,
};

/// Dev default: app crates at `debug`, everything else at `warn`.
/// Without the `warn` baseline, hyper/reqwest/rustls flood stderr with
/// per-connection traces (see `git::watcher` periodic fetches).
const DEV_DEFAULT_DIRECTIVES: &str = "warn,helmor_lib=debug,helmor=debug";

/// Release default: plain `info`.
const RELEASE_DEFAULT_DIRECTIVES: &str = "info";

/// Set up the global tracing subscriber.
///
/// Dev:  stderr (human-readable) + JSONL file.
/// Prod: JSONL file only.
/// Filter comes from `build_filter` (see module docs for defaults).
pub fn init(logs_dir: &Path) -> Result<()> {
    let is_dev = crate::data_dir::is_dev();

    // Macro avoids repeating the json format config for each file layer.
    // `EnvFilter` isn't `Clone`, so callers pass a fresh instance per layer.
    macro_rules! file_layer {
        ($prefix:literal, $filter:expr) => {{
            let appender = RollingFileAppender::builder()
                .rotation(Rotation::DAILY)
                .filename_prefix($prefix)
                .filename_suffix("jsonl")
                .max_log_files(7)
                .build(logs_dir)
                .context(concat!("log appender: ", $prefix))?;
            fmt::layer()
                .json()
                .flatten_event(true)
                .with_current_span(false)
                .with_span_list(false)
                .with_timer(ChronoLocal::default())
                .with_writer(appender)
                .with_filter($filter)
        }};
    }

    let stderr_layer = is_dev.then(|| {
        fmt::layer()
            .with_writer(std::io::stderr)
            .with_ansi(true)
            .with_timer(ChronoLocal::default())
            .with_filter(build_filter(is_dev))
    });

    tracing_subscriber::registry()
        .with(file_layer!("rust", build_filter(is_dev)))
        .with(stderr_layer)
        .init();

    Ok(())
}

/// Compress yesterday's `.jsonl` files and delete `.jsonl.gz` older than 7 days.
/// Run once on startup, typically from a background thread.
pub fn cleanup(logs_dir: &Path) {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let cutoff = (chrono::Local::now() - chrono::Duration::days(7))
        .format("%Y-%m-%d")
        .to_string();

    let entries = match fs::read_dir(logs_dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };

        // Compress non-today .jsonl -> .jsonl.gz
        if name.ends_with(".jsonl") && !name.contains(&today) {
            if let Err(e) = gzip(&path) {
                tracing::warn!(file = %path.display(), "log compression failed: {e}");
            }
            continue;
        }

        // Purge old .jsonl.gz beyond retention
        if name.ends_with(".jsonl.gz") && extract_date(name).is_some_and(|d| d < cutoff.as_str()) {
            let _ = fs::remove_file(&path);
        }
    }
}

/// Returns the resolved `logs/` directory path. Convenience for callers that
/// need to pass it to the sidecar via `HELMOR_LOG_DIR`.
pub fn logs_dir() -> Result<PathBuf> {
    crate::data_dir::logs_dir()
}

// --- helpers ----------------------------------------------------------------

/// Build a fresh `EnvFilter`. `HELMOR_LOG` wins when set and parses; otherwise
/// falls back to the build-profile default. Called once per layer because
/// `EnvFilter` is not `Clone`.
fn build_filter(is_dev: bool) -> EnvFilter {
    std::env::var("HELMOR_LOG")
        .ok()
        .and_then(|s| EnvFilter::try_new(&s).ok())
        .unwrap_or_else(|| EnvFilter::new(default_directives(is_dev)))
}

fn default_directives(is_dev: bool) -> &'static str {
    if is_dev {
        DEV_DEFAULT_DIRECTIVES
    } else {
        RELEASE_DEFAULT_DIRECTIVES
    }
}

fn gzip(src: &Path) -> Result<()> {
    use flate2::write::GzEncoder;
    use flate2::Compression;

    let dst = append_gz(src);
    let input = fs::File::open(src).with_context(|| format!("open {}", src.display()))?;
    let output = fs::File::create(&dst).with_context(|| format!("create {}", dst.display()))?;

    let mut enc = GzEncoder::new(output, Compression::default());
    io::copy(&mut io::BufReader::new(input), &mut enc)?;
    enc.finish()?;

    fs::remove_file(src)?;
    Ok(())
}

fn append_gz(path: &Path) -> PathBuf {
    let mut s = path.as_os_str().to_owned();
    s.push(".gz");
    PathBuf::from(s)
}

/// Extract the `YYYY-MM-DD` segment from a log filename like `rust-error.2026-04-11.jsonl.gz`.
fn extract_date(filename: &str) -> Option<&str> {
    filename.split('.').find(|s| {
        s.len() == 10 && s.as_bytes().get(4) == Some(&b'-') && s.as_bytes().get(7) == Some(&b'-')
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_date_from_jsonl() {
        assert_eq!(
            extract_date("rust-error.2026-04-11.jsonl"),
            Some("2026-04-11")
        );
    }

    #[test]
    fn extract_date_from_gz() {
        assert_eq!(
            extract_date("sidecar-debug.2026-01-01.jsonl.gz"),
            Some("2026-01-01")
        );
    }

    #[test]
    fn extract_date_returns_none_for_bad_name() {
        assert_eq!(extract_date("random-file.txt"), None);
    }

    #[test]
    fn dev_default_allows_helmor_debug_but_caps_deps_at_warn() {
        // Dev default: helmor crates DEBUG, everything else WARN.
        // max_level_hint reflects the most permissive directive.
        let f = EnvFilter::new(default_directives(true));
        assert_eq!(f.max_level_hint(), Some(tracing::Level::DEBUG.into()));
    }

    #[test]
    fn release_default_is_info() {
        let f = EnvFilter::new(default_directives(false));
        assert_eq!(f.max_level_hint(), Some(tracing::Level::INFO.into()));
    }
}
