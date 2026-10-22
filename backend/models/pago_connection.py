from decimal import Decimal
from typing import Optional


class PagoConnection:
    """Operaciones sobre la tabla `pago` usando SQL crudo. Un tiquete tiene como máximo un pago."""

    def __init__(self, conn):
        self.conn = conn

    def create(self, id_tiquete: int, monto: Decimal, metodo_pago: str) -> dict:
        """Registra el pago y marca el tiquete como pagado en la misma transacción."""
        try:
            with self.conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO pago (id_tiquete, monto, metodo_pago) VALUES (%s, %s, %s) RETURNING *",
                    (id_tiquete, monto, metodo_pago),
                )
                pago = cur.fetchone()
                cur.execute("UPDATE tiquete SET estado_pago = 'Pagado' WHERE id_tiquete = %s", (id_tiquete,))
            self.conn.commit()
            return pago
        except Exception:
            self.conn.rollback()
            raise

    def get_by_id(self, id_pago: int) -> Optional[dict]:
        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM pago WHERE id_pago = %s", (id_pago,))
            return cur.fetchone()

    def list_all(self, id_tiquete: Optional[int] = None) -> list:
        with self.conn.cursor() as cur:
            if id_tiquete is None:
                cur.execute("SELECT * FROM pago ORDER BY fecha_hora_pago DESC")
            else:
                cur.execute("SELECT * FROM pago WHERE id_tiquete = %s", (id_tiquete,))
            return cur.fetchall()
