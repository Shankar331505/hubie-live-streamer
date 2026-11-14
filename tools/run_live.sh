#!/bin/bash
# Runs the live Kick stream and keeps it running: if the program ever exits (a crash, the game browser dropping), it starts again.
# Keeps the Mac awake while it runs. To stop for good:  touch .stop_live   (then stop the running program, see tools/stop_live.sh)
cd "$(dirname "$0")/.." || exit 1
STOP=.stop_live
rm -f "$STOP"
caffeinate -dimsu -w $$ &          # no display sleep, no idle sleep, no disk sleep, while this script lives
mkdir -p logs
echo "$(date '+%F %T') supervisor started" >> logs/live_supervisor.log
while [ ! -f "$STOP" ]; do
  node server/main.js --live --game=housebets --kick-chat >> "logs/live_$(date +%F).log" 2>&1
  code=$?
  [ -f "$STOP" ] && break
  echo "$(date '+%F %T') program exited with code $code, restarting" >> logs/live_supervisor.log
  sleep 15
done
echo "$(date '+%F %T') supervisor stopped" >> logs/live_supervisor.log
