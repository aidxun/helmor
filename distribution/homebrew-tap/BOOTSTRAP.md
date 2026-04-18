# Bootstrapping the `dohooo/homebrew-helmor` tap

> **You are reading this file inside the main `dohooo/helmor` repo.** The tap repo doesn't exist yet. This guide walks you through publishing the contents of `distribution/homebrew-tap/` as a new standalone repo and wiring up the CI auto-bump from this repo.

Everything under `distribution/homebrew-tap/` (except this `BOOTSTRAP.md`) is the literal content of the tap repo. Do not delete this folder after bootstrapping — keeping it in-tree makes the tap auditable alongside app changes, and the auto-bump script lives there.

## One-time setup

### 1. Create the tap repo on GitHub

Create an empty public repo named exactly `homebrew-helmor` under your account/org. The `homebrew-` prefix is required by Homebrew's tap convention.

```
https://github.com/new
  name:        homebrew-helmor
  owner:       dohooo
  visibility:  public
  init:        leave everything unchecked
```

### 2. Seed it from this folder

From the helmor repo root:

```bash
cd distribution/homebrew-tap
git init -b main
git add .
# do NOT stage BOOTSTRAP.md — it only belongs in the helmor repo
git reset -- BOOTSTRAP.md
git commit -m "Initial tap"
git remote add origin git@github.com:dohooo/homebrew-helmor.git
git push -u origin main
cd ../..
```

### 3. Create a fine-grained PAT for CI bumps

Homebrew's convention is that the tap is pushed to by a bot account, but a fine-grained PAT against your user is also fine for a personal project. The token needs the minimum scope below.

1. Visit https://github.com/settings/personal-access-tokens/new
2. **Repository access:** Only select repositories → `dohooo/homebrew-helmor`
3. **Permissions → Repository:**
   - Contents: **Read and write**
   - Metadata: Read-only (auto)
4. Expiration: 1 year (calendar a reminder)

Copy the token.

### 4. Store the token in the **helmor** repo

In `https://github.com/dohooo/helmor/settings/secrets/actions`, add a new repository secret:

- **Name:** `HOMEBREW_TAP_TOKEN`
- **Value:** the PAT from step 3

### 5. (Optional) Verify the first release end-to-end

The auto-bump job is wired up in `.github/workflows/publish.yml` and runs after the macOS build-and-publish matrix succeeds. For the next real release, you should see:

1. `publish.yml` → **Bump Homebrew Cask** job turns green
2. A new commit on `dohooo/homebrew-helmor` main, e.g. `helmor 0.1.5`
3. `brew update && brew info --cask dohooo/helmor/helmor` shows the new version

If it fails, the job logs the failing step (DMG download, sha256 mismatch, push rejection) and the release itself is unaffected.

## Manual bumps (fallback)

If CI is unavailable, bump the tap by hand from a machine with the tap cloned:

```bash
VERSION=0.1.5
BASE=https://github.com/dohooo/helmor/releases/download/v${VERSION}
ARM=$(curl -fsSL "$BASE/Helmor_${VERSION}_aarch64.dmg" | shasum -a 256 | awk '{print $1}')
X64=$(curl -fsSL "$BASE/Helmor_${VERSION}_x64.dmg"     | shasum -a 256 | awk '{print $1}')
python3 scripts/update-cask.py "$VERSION" "$ARM" "$X64"
git commit -am "helmor ${VERSION}"
git push
```

## Promoting to official homebrew-cask later

Once Helmor is past 1.0 and has visible traction:

1. Fork `Homebrew/homebrew-cask`
2. Copy `Casks/helmor.rb` into `Casks/h/helmor.rb` (official repo shards by first letter)
3. Run `brew audit --cask --new --online Casks/h/helmor.rb` locally until clean
4. Open a PR; maintainers will respond with review comments
5. After merge, users can `brew install --cask helmor` without the tap prefix, and this tap becomes optional
