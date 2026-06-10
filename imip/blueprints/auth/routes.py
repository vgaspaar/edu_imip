"""
Blueprint de autenticação.
Rotas: /login  /logout  /registrar  /me
"""

from flask import Blueprint, request, jsonify, make_response
from database.db import get_db
from auth_utils import hash_senha, verificar_senha, criar_sessao, destruir_sessao, validar_token

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

ALAS_VALIDAS = [
    "Pediatria A", "Pediatria B",
    "Oncologia Pediátrica", "UTI Neonatal", "Cirurgia Pediátrica"
]


def _usuario_atual(request):
    token = request.cookies.get("token") or request.headers.get("Authorization", "").replace("Bearer ", "")
    return validar_token(token)


# ── POST /api/auth/login ──────────────────────────────────────────
@auth_bp.route("/login", methods=["POST"])
def login():
    dados = request.get_json(silent=True) or {}
    email = (dados.get("email") or "").strip().lower()
    senha = dados.get("senha") or ""

    if not email or not senha:
        return jsonify({"erro": "E-mail e senha são obrigatórios."}), 400

    with get_db() as conn:
        usuario = conn.execute(
            "SELECT * FROM usuarios WHERE email = ? AND ativo = 1", (email,)
        ).fetchone()

    if not usuario or not verificar_senha(senha, usuario["senha_hash"]):
        return jsonify({"erro": "E-mail ou senha incorretos."}), 401

    token = criar_sessao(usuario["id"])
    resp = make_response(jsonify({
        "ok": True,
        "usuario": {
            "id":    usuario["id"],
            "nome":  usuario["nome"],
            "email": usuario["email"],
            "role":  usuario["role"],
            "ala":   usuario["ala"],
        }
    }))
    resp.set_cookie("token", token, httponly=True, samesite="Lax", max_age=28800)
    return resp


# ── POST /api/auth/registrar ──────────────────────────────────────
@auth_bp.route("/registrar", methods=["POST"])
def registrar():
    dados = request.get_json(silent=True) or {}
    nome  = (dados.get("nome")  or "").strip()
    email = (dados.get("email") or "").strip().lower()
    senha = dados.get("senha") or ""
    role  = dados.get("role")  or ""
    ala   = dados.get("ala")   or ""

    erros = []
    if not nome:          erros.append("Nome é obrigatório.")
    if not email or "@" not in email: erros.append("E-mail inválido.")
    if len(senha) < 6:    erros.append("Senha deve ter ao menos 6 caracteres.")
    if role not in ("professor", "extensionista"): erros.append("Perfil inválido.")
    if ala not in ALAS_VALIDAS: erros.append("Ala inválida.")
    if erros:
        return jsonify({"erro": " ".join(erros)}), 400

    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO usuarios (nome, email, senha_hash, role, ala) VALUES (?,?,?,?,?)",
                (nome, email, hash_senha(senha), role, ala)
            )
    except Exception:
        return jsonify({"erro": "E-mail já cadastrado."}), 409

    return jsonify({"ok": True, "mensagem": "Cadastro realizado! Faça login."}), 201


# ── POST /api/auth/logout ─────────────────────────────────────────
@auth_bp.route("/logout", methods=["POST"])
def logout():
    token = request.cookies.get("token", "")
    destruir_sessao(token)
    resp = make_response(jsonify({"ok": True}))
    resp.delete_cookie("token")
    return resp


# ── GET /api/auth/me ──────────────────────────────────────────────
@auth_bp.route("/me", methods=["GET"])
def me():
    usuario = _usuario_atual(request)
    if not usuario:
        return jsonify({"autenticado": False}), 401
    return jsonify({"autenticado": True, "usuario": {
        "nome":  usuario["nome"],
        "email": usuario["email"],
        "role":  usuario["role"],
        "ala":   usuario["ala"],
    }})