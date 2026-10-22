#!/bin/bash
# Programa respaldo.sh para que corra todos los días a las 23:00 con launchd (macOS).
# Si el Mac está apagado o dormido a esa hora, el respaldo se hace al encenderlo.
#
# macOS no deja que las tareas programadas lean la carpeta Documentos, así que se instala una
# copia del script y de la conexión a la base en ~/.parqueate y los respaldos quedan en
# ~/ParqueateRespaldos. Vuelve a ejecutarlo si cambias respaldo.sh o la contraseña en .env.
#
# Desinstalar: launchctl bootout gui/$(id -u)/co.parqueate.respaldo && rm ~/Library/LaunchAgents/co.parqueate.respaldo.plist

set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="$HOME/.parqueate"
RESPALDOS="$HOME/ParqueateRespaldos"
PLIST="$HOME/Library/LaunchAgents/co.parqueate.respaldo.plist"
LABEL="co.parqueate.respaldo"

mkdir -p "$INSTALL_DIR" "$RESPALDOS" "$(dirname "$PLIST")"
cp "$BACKEND_DIR/respaldo.sh" "$INSTALL_DIR/respaldo.sh"
chmod 700 "$INSTALL_DIR/respaldo.sh"

# Solo las variables de conexión, con permisos de lectura únicamente para tu usuario.
(umask 077 && { grep -E '^PG(NAMEDATABASE|USER|HOST|PASSWORD|PORT)=' "$BACKEND_DIR/.env"; echo "RESPALDO_DIR=$RESPALDOS"; } > "$INSTALL_DIR/respaldo.env")

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$INSTALL_DIR/respaldo.sh</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PARQUEATE_ENV</key>
        <string>$INSTALL_DIR/respaldo.env</string>
    </dict>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>23</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$RESPALDOS/respaldo.log</string>
    <key>StandardErrorPath</key>
    <string>$RESPALDOS/respaldo.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Respaldo diario programado a las 23:00. Archivos y registro en $RESPALDOS"
