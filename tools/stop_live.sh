#!/bin/bash
# Stops the live stream for good: tells the supervisor not to restart, then asks the program to finish cleanly.
cd "$(dirname "$0")/.." || exit 1
touch .stop_live
pkill -INT -f "server/main.js --live" 2>/dev/null
sleep 6
pkill -f "server/main.js --live" 2>/dev/null
pkill -f "tools/run_live.sh" 2>/dev/null
pkill -f "ffmpeg.*127.0.0.1" 2>/dev/null
echo "stopped"
