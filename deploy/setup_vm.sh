#!/usr/bin/env bash
# One-time server setup (Ubuntu 24.04). Installs: ffmpeg, virtual display, virtual audio, fonts, Node 24 (checksum-verified).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
sudo apt-get install -y ffmpeg xvfb pulseaudio pulseaudio-utils x11-utils xdotool fonts-liberation fonts-noto-color-emoji unzip curl ca-certificates htop
NODE_V=v24.13.1
if ! command -v node >/dev/null || [[ "$(node --version)" != "$NODE_V" ]]; then
  cd /tmp
  curl -fsSLO "https://nodejs.org/dist/$NODE_V/node-$NODE_V-linux-x64.tar.xz"
  curl -fsSLO "https://nodejs.org/dist/$NODE_V/SHASUMS256.txt"
  grep " node-$NODE_V-linux-x64.tar.xz\$" SHASUMS256.txt | sha256sum -c -
  sudo tar -xJf "node-$NODE_V-linux-x64.tar.xz" -C /usr/local --strip-components=1
fi
node --version; npm --version; ffmpeg -version | head -1
