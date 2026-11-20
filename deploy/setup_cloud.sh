#!/usr/bin/env bash
# Sets the Hubie cloud VM up to run the stream 24/7 (Ubuntu 24.04). Safe to run again.
# Installs Chrome (a real, headed Chrome on a virtual screen: the Housebets games only play in one), a remote-screen viewer for the one-time
# human sign-in, the project's dependencies, and systemd services that restart everything if it dies or the VM reboots.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
APP="$HOME/hubie"
ME="$(id -un)"

echo "== packages"
sudo apt-get update -y
sudo apt-get install -y ffmpeg xvfb x11vnc novnc websockify openssl fonts-liberation fonts-noto-color-emoji curl ca-certificates unzip htop xdotool

echo "== Google Chrome (official repo)"
if ! command -v google-chrome >/dev/null; then
  curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | sudo gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg
  echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y google-chrome-stable
fi
google-chrome --version

echo "== project dependencies"
mkdir -p "$APP"/{logs,recordings,previews,cache,secrets}
cd "$APP"
npm install --omit=dev --no-audit --no-fund
npx playwright install chromium --with-deps

echo "== remote screen password and certificate"
mkdir -p "$HOME/.hubie"
if [ ! -f "$HOME/.hubie/vnc_password" ]; then openssl rand -base64 12 | tr -d '/+=' | cut -c1-12 > "$HOME/.hubie/vnc_password"; chmod 600 "$HOME/.hubie/vnc_password"; fi
x11vnc -storepasswd "$(cat "$HOME/.hubie/vnc_password")" "$HOME/.hubie/vnc_passwd" >/dev/null 2>&1; chmod 600 "$HOME/.hubie/vnc_passwd"
if [ ! -f "$HOME/.hubie/novnc.pem" ]; then
  openssl req -x509 -nodes -newkey rsa:2048 -days 365 -subj "/CN=hubie-remote-screen" -keyout "$HOME/.hubie/novnc.key" -out "$HOME/.hubie/novnc.crt" >/dev/null 2>&1
  cat "$HOME/.hubie/novnc.key" "$HOME/.hubie/novnc.crt" > "$HOME/.hubie/novnc.pem"; chmod 600 "$HOME/.hubie/novnc.pem"
fi

echo "== services"
unit() { sudo tee "/etc/systemd/system/$1.service" >/dev/null; }

unit hubie-xvfb <<EOF
[Unit]
Description=Hubie virtual screen
[Service]
User=$ME
ExecStart=/usr/bin/Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF

# A second virtual screen only for the stage page (Hubie, chat, the game picture). ffmpeg reads this screen directly, which is much faster
# than sending JPEG screenshots when the picture changes every frame (the roulette wheel).
unit hubie-xvfb-stage <<EOF
[Unit]
Description=Hubie stage screen
[Service]
User=$ME
ExecStart=/usr/bin/Xvfb :98 -screen 0 1920x1080x24 -nolisten tcp
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF

# The game browser: a normal Chrome with its own profile, a debugging port that only listens on this machine, and software rendering
# (the VM has no GPU; Mesa's software EGL measured 25 frames/s on a Wheel spin against 7 for SwiftShader). The human signs in here once, through the remote screen; the stream program attaches to it.
unit hubie-chrome <<EOF
[Unit]
Description=Hubie game browser (Chrome)
After=hubie-xvfb.service
Requires=hubie-xvfb.service
[Service]
User=$ME
Environment=DISPLAY=:99
Environment=LP_NUM_THREADS=4
Environment=LIBGL_ALWAYS_SOFTWARE=1
# the game browser must never starve the stream's own processes (the roulette wheel is heavy): it gets a smaller share of the CPU
CPUWeight=40
ExecStart=/usr/bin/google-chrome --user-data-dir=$HOME/hubie-browser --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 --window-size=1360,900 --window-position=0,0 --no-first-run --no-default-browser-check --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-background-timer-throttling --use-gl=egl --enable-unsafe-swiftshader --ignore-gpu-blocklist --password-store=basic --disable-features=TranslateUI https://www.housebets.com/house-games
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF

unit hubie-vnc <<EOF
[Unit]
Description=Hubie remote screen (VNC, local only)
After=hubie-xvfb.service
Requires=hubie-xvfb.service
[Service]
User=$ME
ExecStart=/usr/bin/x11vnc -display :99 -rfbauth $HOME/.hubie/vnc_passwd -localhost -forever -shared -noxdamage -rfbport 5900
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF

unit hubie-novnc <<EOF
[Unit]
Description=Hubie remote screen in the browser (HTTPS)
After=hubie-vnc.service
[Service]
User=$ME
ExecStart=/usr/bin/websockify --web /usr/share/novnc --cert $HOME/.hubie/novnc.pem 6080 127.0.0.1:5900
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF

# The stream itself. Not enabled until the sign-in is checked (see deploy/README_cloud.md): it refuses to go live unless the game browser is
# signed in at a zero balance.
unit hubie-live <<EOF
[Unit]
Description=Hubie live stream
After=hubie-chrome.service hubie-xvfb-stage.service network-online.target
Wants=network-online.target hubie-xvfb-stage.service
[Service]
User=$ME
WorkingDirectory=$APP
Environment=DISPLAY=:99
# Environment=HUBIE_X11_DISPLAY=:98   (screen-capture mode: smoother pictures but its sound drifted in tests; off for now)
Environment=HUBIE_SKIP_GAMES=roulette,max-win
Environment=HOME=$HOME
CPUWeight=300
ExecStart=/usr/local/bin/node server/main.js --live --game=housebets --kick-chat
Restart=always
RestartSec=20
KillSignal=SIGINT
TimeoutStopSec=20
StandardOutput=append:$APP/logs/live.log
StandardError=append:$APP/logs/live.log
[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now hubie-xvfb hubie-xvfb-stage hubie-chrome hubie-vnc hubie-novnc
sleep 4
systemctl is-active hubie-xvfb hubie-chrome hubie-vnc hubie-novnc
echo "setup done"

echo "== no surprise restarts during the run"
# Ubuntu's automatic updates restart services (including the game Chrome) at random times. For a long live run they are turned off;
# update by hand between runs if needed.
sudo systemctl disable --now apt-daily.timer apt-daily-upgrade.timer unattended-upgrades.service 2>/dev/null || true
sudo systemctl mask apt-daily.service apt-daily-upgrade.service 2>/dev/null || true
if [ -f /etc/needrestart/needrestart.conf ]; then sudo sed -i "s/^#\?\$nrconf{restart} = .*/\$nrconf{restart} = 'l';/" /etc/needrestart/needrestart.conf; fi
echo "updates off"
