#!/bin/bash
# RNF-07: copia de seguridad de la base de datos con pg_dump.
# Guarda un archivo por ejecución en backend/backups/ y borra los que tengan más de DIAS_RESPALDO días.
#
# Uso:        ./respaldo.sh   (para programarlo cada día: ./instalar_respaldo.sh)
# Restaurar:  pg_restore -h localhost -U parqueate -d parqueadero_autos_colombia --clean --if-exists backups/<archivo>.dump

set -euo pipefail

# launchd ejecuta el script con un PATH mínimo; se agrega el de Homebrew para encontrar pg_dump.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

BACKEND_DIR="$(cd "$(dirname "$0")" && pwd)"
# La copia programada lee su propia configuración (PARQUEATE_ENV) porque macOS no deja que las
# tareas programadas lean la carpeta Documentos.
set -a
# shellcheck source=/dev/null
source "${PARQUEATE_ENV:-$BACKEND_DIR/.env}"
set +a

DB_NAME="${PGNAMEDATABASE:-parqueadero_autos_colombia}"
DESTINO="${RESPALDO_DIR:-$BACKEND_DIR/backups}"
DIAS="${DIAS_RESPALDO:-30}"
ARCHIVO="$DESTINO/${DB_NAME}_$(date +%Y%m%d_%H%M%S).dump"

mkdir -p "$DESTINO"
# Formato custom (-Fc): comprimido y restaurable con pg_restore. pg_dump toma PGHOST, PGUSER y PGPASSWORD del .env.
pg_dump -Fc -d "$DB_NAME" -f "$ARCHIVO"
find "$DESTINO" -name "${DB_NAME}_*.dump" -mtime +"$DIAS" -delete

echo "$(date '+%Y-%m-%d %H:%M:%S') Respaldo creado: $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))"
