

import hashlib
import hmac
import secrets
import os
from datetime import datetime, timedelta
from database.db import get_db


# Salt local fixo combinado com salt por-usuário (armazenado no hash)
_APP_SECRET = os.environ.get("SECRET_KEY", "imip-alfabetiza-secret-2026")


def hash_senha(senha_plana: str) -> str:
    """Gera hash seguro da senha com salt aleatório."""
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac(
        "sha256",
        (senha_plana + _APP_SECRET).encode(),
        salt.encode(),
        iterations=260_000,
    )
    return f"{salt}${h.hex()}"


def verificar_senha(senha_plana: str, senha_hash: str) -> bool:
    """Verifica senha contra hash armazenado."""
    try:
        salt, stored = senha_hash.split("$", 1)
        h = hashlib.pbkdf2_hmac(
            "sha256",
            (senha_plana + _APP_SECRET).encode(),
            salt.encode(),
            iterations=260_000,
        )
        return hmac.compare_digest(h.hex(), stored)
    except Exception:
        return False


def gerar_token() -> str:
    return secrets.token_urlsafe(48)


def criar_sessao(usuario_id: int) -> str:
    token = gerar_token()
    expira = (datetime.now() + timedelta(hours=8)).isoformat()
    with get_db() as conn:
        # limpa sessões antigas do mesmo usuário
        conn.execute("DELETE FROM sessoes WHERE usuario_id = ?", (usuario_id,))
        conn.execute(
            "INSERT INTO sessoes (token, usuario_id, expira_em) VALUES (?,?,?)",
            (token, usuario_id, expira),
        )
    return token


def validar_token(token: str):
    """Retorna o usuário se o token for válido, ou None."""
    if not token:
        return None
    with get_db() as conn:
        row = conn.execute(
            """SELECT s.usuario_id, s.expira_em,
                      u.nome, u.email, u.role, u.ala
               FROM sessoes s
               JOIN usuarios u ON u.id = s.usuario_id
               WHERE s.token = ? AND u.ativo = 1""",
            (token,),
        ).fetchone()
    if not row:
        return None
    if datetime.fromisoformat(row["expira_em"]) < datetime.now():
        return None
    return dict(row)


def destruir_sessao(token: str):
    with get_db() as conn:
        conn.execute("DELETE FROM sessoes WHERE token = ?", (token,))