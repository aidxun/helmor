# homebrew-helmor

Homebrew tap for [Helmor](https://github.com/dohooo/helmor) — the local-first IDE for coding agent orchestration.

## Install

```bash
brew tap dohooo/helmor
brew install --cask helmor
```

Or in one line:

```bash
brew install --cask dohooo/helmor/helmor
```

## Upgrade

```bash
brew upgrade --cask helmor
```

## Uninstall

```bash
brew uninstall --cask helmor
# include configuration and caches:
brew uninstall --zap --cask helmor
```

## How this tap is maintained

The cask in `Casks/helmor.rb` is bumped automatically by the [publish workflow](https://github.com/dohooo/helmor/actions/workflows/publish.yml) in the main repo after every signed & notarized release. No manual editing is expected — if a bump is missed, re-run the publish workflow on the failing tag.

## License

[Apache 2.0](./LICENSE) — matches the upstream Helmor project.
