cask "helmor" do
  arch arm: "aarch64", intel: "x64"

  version "0.1.4"
  sha256 arm:   "0000000000000000000000000000000000000000000000000000000000000000",
         intel: "0000000000000000000000000000000000000000000000000000000000000000"

  url "https://github.com/dohooo/helmor/releases/download/v#{version}/Helmor_#{version}_#{arch}.dmg",
      verified: "github.com/dohooo/helmor/"
  name "Helmor"
  desc "Local-first IDE for coding agent orchestration"
  homepage "https://github.com/dohooo/helmor"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: ">= :big_sur"

  app "Helmor.app"

  zap trash: [
    "~/helmor",
    "~/helmor-dev",
    "~/Library/Application Support/ai.helmor.desktop",
    "~/Library/Caches/ai.helmor.desktop",
    "~/Library/HTTPStorages/ai.helmor.desktop",
    "~/Library/Preferences/ai.helmor.desktop.plist",
    "~/Library/Saved Application State/ai.helmor.desktop.savedState",
    "~/Library/WebKit/ai.helmor.desktop",
  ]
end
