#!/bin/zsh
# Opens the dedicated "game" Chrome window: a normal Chrome with its own profile and a local debugging port.
# A human signs in / passes any site check in this window once; the stream program then attaches to it.
PROFILE="$HOME/hubie-browser"
URL="${1:-https://www.housebets.com/games/housegames-dice}"
mkdir -p "$PROFILE"
if curl -s --max-time 1 http://127.0.0.1:9222/json/version >/dev/null; then echo "game browser already running"; exit 0; fi
nohup "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$PROFILE" --remote-debugging-port=9222 \
  --window-size=1360,900 --window-position=40,40 \
  --no-first-run --no-default-browser-check \
  --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-background-timer-throttling \
  "$URL" >/tmp/hubie-browser.log 2>&1 &
echo "started game browser (profile $PROFILE)"
