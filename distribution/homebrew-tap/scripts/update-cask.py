#!/usr/bin/env python3
"""Bump Casks/helmor.rb to a new version + sha256 pair.

Usage: update-cask.py <version> <arm_sha256> <intel_sha256>

Invoked by the helmor repo's Publish Release workflow after a successful
macOS build. Re-runs on the same version are a no-op — the script only
rewrites the three fields it owns and leaves the rest of the cask alone.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

SHA_RE = re.compile(r"^[a-f0-9]{64}$")


def main() -> int:
    if len(sys.argv) != 4:
        print("usage: update-cask.py <version> <arm_sha256> <intel_sha256>", file=sys.stderr)
        return 2

    version, arm_sha, intel_sha = sys.argv[1:4]
    for label, value in (("arm_sha256", arm_sha), ("intel_sha256", intel_sha)):
        if not SHA_RE.match(value):
            print(f"invalid {label}: {value!r}", file=sys.stderr)
            return 2

    cask = Path(__file__).resolve().parent.parent / "Casks" / "helmor.rb"
    original = cask.read_text()
    updated = original

    updated, n_version = re.subn(
        r'^(\s*version\s+)"[^"]+"',
        rf'\1"{version}"',
        updated,
        count=1,
        flags=re.MULTILINE,
    )
    updated, n_arm = re.subn(
        r'(sha256\s+arm:\s+)"[a-f0-9]{64}"',
        rf'\1"{arm_sha}"',
        updated,
        count=1,
    )
    updated, n_intel = re.subn(
        r'(\bintel:\s+)"[a-f0-9]{64}"',
        rf'\1"{intel_sha}"',
        updated,
        count=1,
    )

    if (n_version, n_arm, n_intel) != (1, 1, 1):
        print(
            f"cask update missed fields: version={n_version} arm={n_arm} intel={n_intel}",
            file=sys.stderr,
        )
        return 1

    if updated == original:
        print("cask already up to date", file=sys.stderr)
        return 0

    cask.write_text(updated)
    print(f"bumped helmor cask to {version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
