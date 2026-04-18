{
  description = "Helmor — local-first IDE for coding agent orchestration";

  # Proof-of-concept flake that installs Helmor from the signed & notarized
  # macOS DMG published on GitHub Releases. Linux is intentionally unsupported
  # right now — see ./README.md for the gating reason (no Linux build pipeline
  # exists upstream yet).

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };

        version = "0.1.4";

        # SHA256s below are placeholders — replace before first publish and
        # keep in lockstep with `distribution/homebrew-tap/Casks/helmor.rb`.
        # Run `nix-prefetch-url --type sha256 <url>` to compute them.
        sources = {
          aarch64-darwin = {
            url = "https://github.com/dohooo/helmor/releases/download/v${version}/Helmor_${version}_aarch64.dmg";
            sha256 = "0000000000000000000000000000000000000000000000000000000000000000";
          };
          x86_64-darwin = {
            url = "https://github.com/dohooo/helmor/releases/download/v${version}/Helmor_${version}_x64.dmg";
            sha256 = "0000000000000000000000000000000000000000000000000000000000000000";
          };
        };

        src = sources.${system} or (throw ''
          Helmor is only available for aarch64-darwin and x86_64-darwin right now.
          Current system: ${system}
          Track Linux support at https://github.com/dohooo/helmor/issues
        '');

        helmor = pkgs.stdenvNoCC.mkDerivation {
          pname = "helmor";
          inherit version;

          src = pkgs.fetchurl { inherit (src) url sha256; };

          # undmg is a tiny Rust tool in nixpkgs that extracts DMGs without
          # hdiutil, so the derivation is hermetic and works in the build
          # sandbox on any darwin host.
          nativeBuildInputs = [ pkgs.undmg ];

          sourceRoot = ".";
          unpackPhase = ''
            runHook preUnpack
            undmg $src
            runHook postUnpack
          '';

          installPhase = ''
            runHook preInstall
            mkdir -p "$out/Applications"
            cp -R "Helmor.app" "$out/Applications/Helmor.app"
            runHook postInstall
          '';

          meta = with pkgs.lib; {
            description = "Local-first IDE for coding agent orchestration";
            homepage = "https://github.com/dohooo/helmor";
            license = licenses.asl20;
            platforms = [ "aarch64-darwin" "x86_64-darwin" ];
            maintainers = [ ];
            # The DMG is pre-signed and notarized by Apple; Nix itself doesn't
            # re-sign, so we mark it as an unfree binary distribution.
            sourceProvenance = with sourceTypes; [ binaryNativeCode ];
          };
        };
      in
      {
        packages.default = helmor;
        packages.helmor = helmor;

        apps.default = {
          type = "app";
          program = "${helmor}/Applications/Helmor.app/Contents/MacOS/Helmor";
        };
      });
}
