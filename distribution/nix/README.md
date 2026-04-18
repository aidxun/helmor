# Nix distribution (experimental)

> **Status:** proof-of-concept. Not published anywhere yet. Ships macOS only.

This folder contains a `flake.nix` that installs Helmor from the signed & notarized DMGs already published on GitHub Releases.

## Why it's experimental

1. **Placeholder SHA256s.** The hashes in `flake.nix` are `0000…`. They have to be filled in (and bumped on every release) before anyone can actually install.
2. **macOS only.** Linux Nix users — the target audience for nixpkgs — can't install Helmor through this flake because there is no Linux build pipeline upstream. `.github/workflows/publish.yml` only produces `aarch64-apple-darwin` and `x86_64-apple-darwin` artifacts.
3. **Not in nixpkgs.** To land in the official nixpkgs registry we'd need (a) reproducible source build of the Bun-compiled sidecar binary, and (b) Linux coverage. Both are significant work — see "Path to nixpkgs" below.

## Trying it locally (once SHA256s are filled in)

On a macOS machine with Nix installed:

```bash
# Install into the current profile
nix profile install github:dohooo/helmor?dir=distribution/nix

# Or just run once
nix run github:dohooo/helmor?dir=distribution/nix

# Validate the flake without installing
cd distribution/nix && nix flake check
```

## Computing SHA256s

For each release tag, run (on a Mac or Linux host with `nix` installed):

```bash
VERSION=0.1.4
nix-prefetch-url "https://github.com/dohooo/helmor/releases/download/v${VERSION}/Helmor_${VERSION}_aarch64.dmg"
nix-prefetch-url "https://github.com/dohooo/helmor/releases/download/v${VERSION}/Helmor_${VERSION}_x64.dmg"
```

Paste the results into `flake.nix` and commit.

Once this stabilizes, the same bump automation we use for the Homebrew tap (`.github/workflows/publish.yml` → `bump-homebrew-tap` job) can be mirrored for the flake — compute both sha256s and rewrite `flake.nix` in the same job.

## Path to nixpkgs

To graduate from this one-off flake to an entry in `github.com/NixOS/nixpkgs`:

1. **Ship Linux.** Extend `publish.yml` matrix with `x86_64-unknown-linux-gnu` (and aarch64 ideally). Tauri emits `.deb` and `.AppImage` out of the box for that triple, but needs `webkit2gtk-4.1` and `libsoup-3.0` on the runner. Ballpark: 1–2 days of CI work + signing decisions.
2. **Reproducible sidecar.** The sidecar is `bun build --compile` with frozen `@anthropic-ai/claude-agent-sdk`, `@openai/codex`, etc. Nix's build sandbox blocks network access, so every npm dep has to be pre-fetched via `fetchNpmDeps` or similar. Medium-hard.
3. **Write the nixpkgs package.** `pkgs/by-name/he/helmor/package.nix`, structurally close to this flake but driven from source rather than from a fetched DMG. Submit a PR.
4. **Unfree flag.** If any Claude/Codex SDK binaries bundled into the sidecar have restrictive licenses, mark `meta.license = [ ... ]` accordingly and gate on `allowUnfree`.

## Why a flake here at all then?

Low-cost bet. Mac users who already live in Nix (nix-darwin + home-manager) can add Helmor to their declarative setup without waiting for nixpkgs. If nobody uses it, deleting this folder costs nothing. If the flake gets traction, it's the skeleton we'd lift into the eventual nixpkgs submission.
