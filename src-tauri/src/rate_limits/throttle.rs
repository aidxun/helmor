//! Process-memory hard throttle for rate-limit fetchers.
//!
//! React Query's `staleTime` / `refetchInterval` already paces normal
//! traffic, but those are frontend contracts — any future amplification
//! bug (mis-wired event, infinite-loop subscription, runaway hover
//! handler) would punch straight through to upstream. This throttle is
//! the belt-and-suspenders layer: no matter how often the command is
//! called, the actual HTTP call to Anthropic / ChatGPT happens at most
//! once per `min_interval_seconds`. Within that window the caller gets
//! back the cached body verbatim.

use chrono::Utc;
use std::sync::atomic::{AtomicI64, Ordering};

pub struct Throttle {
    /// Unix seconds of the last fetch *attempt*. Zero means "never".
    /// We record on every attempt — success or failure — so a 429 or
    /// network error puts us into the same cooldown a successful fetch
    /// would, instead of letting the caller retry immediately.
    last_attempt: AtomicI64,
    min_interval_seconds: i64,
}

impl Throttle {
    pub const fn new(min_interval_seconds: i64) -> Self {
        Self {
            last_attempt: AtomicI64::new(0),
            min_interval_seconds,
        }
    }

    /// Returns `true` when enough time has elapsed since the last
    /// attempt that we should hit the network again.
    pub fn should_fetch(&self) -> bool {
        let now = Utc::now().timestamp();
        let last = self.last_attempt.load(Ordering::Relaxed);
        now.saturating_sub(last) >= self.min_interval_seconds
    }

    /// Mark that a fetch attempt is starting so subsequent
    /// `should_fetch` calls within the throttle window short-circuit
    /// to the cached body. Call this **before** the HTTP request so the
    /// cooldown applies regardless of how the request resolves.
    pub fn record_attempt(&self) {
        self.last_attempt
            .store(Utc::now().timestamp(), Ordering::Relaxed);
    }

    #[cfg(test)]
    fn record_attempt_at(&self, unix_seconds: i64) {
        self.last_attempt.store(unix_seconds, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_throttle_allows_first_fetch() {
        let throttle = Throttle::new(30);
        assert!(throttle.should_fetch());
    }

    #[test]
    fn within_window_blocks_until_interval_elapses() {
        let throttle = Throttle::new(30);
        let now = Utc::now().timestamp();
        throttle.record_attempt_at(now);
        assert!(!throttle.should_fetch());

        // Pretend 31 s have passed.
        throttle.record_attempt_at(now - 31);
        assert!(throttle.should_fetch());
    }
}
