
from flask import Blueprint, request, jsonify
from database.db import get_db
from auth_utils import validar_token

relatorios_bp = Blueprint("relatorios", __name__, url_prefix="/api/relatorios")


def _requer_auth(req):
    token = req.cookies.get("token") or req.headers.get("Authorization", "").replace("Bearer ", "")
    usuario = validar_token(token)
    if not usuario:
        return None, (jsonify({"erro": "Não autorizado."}), 401)
    return usuario, None


# ── GET /api/relatorios/criancas ─────────────────────────────────
@relatorios_bp.route("/criancas", methods=["GET"])
def listar_criancas():
    usuario, err = _requer_auth(request)
    if err:
        return err

    with get_db() as conn:
        if usuario["role"] == "professor":
            rows = conn.execute(
                """SELECT c.id, c.nome_ficticio, c.idade, c.nivel, c.ala,
                          (SELECT COUNT(*) FROM progresso WHERE crianca_id = c.id AND concluida = 1) AS concluidas
                   FROM criancas c
                   WHERE c.professor_id = ? AND c.ativa = 1
                   ORDER BY c.nome_ficticio""",
                (usuario["usuario_id"],)
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT c.id, c.nome_ficticio, c.idade, c.nivel, c.ala,
                          (SELECT COUNT(*) FROM progresso WHERE crianca_id = c.id AND concluida = 1) AS concluidas
                   FROM criancas c
                   WHERE c.ativa = 1
                   ORDER BY c.ala, c.nome_ficticio"""
            ).fetchall()

    return jsonify({"criancas": [dict(r) for r in rows]})


# ── POST /api/relatorios/criancas ────────────────────────────────
@relatorios_bp.route("/criancas", methods=["POST"])
def cadastrar_crianca():
    usuario, err = _requer_auth(request)
    if err:
        return err
    if usuario["role"] != "professor":
        return jsonify({"erro": "Apenas professores podem cadastrar crianças."}), 403

    dados = request.get_json(silent=True) or {}
    nome  = (dados.get("nome_ficticio") or "").strip()
    idade = dados.get("idade")
    nivel = dados.get("nivel", "iniciante")
    ala   = usuario["ala"]

    if not nome:
        return jsonify({"erro": "Nome fictício é obrigatório."}), 400
    if not isinstance(idade, int) or not (4 <= idade <= 18):
        return jsonify({"erro": "Idade deve ser entre 4 e 18 anos."}), 400
    if nivel not in ("iniciante", "intermediario", "avancado"):
        return jsonify({"erro": "Nível inválido."}), 400

    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO criancas (nome_ficticio, idade, nivel, ala, professor_id) VALUES (?,?,?,?,?)",
            (nome, idade, nivel, ala, usuario["usuario_id"])
        )
        crianca_id = cur.lastrowid

    return jsonify({"ok": True, "crianca_id": crianca_id}), 201


# ── GET /api/relatorios/resumo ────────────────────────────────────
@relatorios_bp.route("/resumo", methods=["GET"])
def resumo():
    usuario, err = _requer_auth(request)
    if err:
        return err

    with get_db() as conn:
        if usuario["role"] == "professor":
            total_criancas = conn.execute(
                "SELECT COUNT(*) FROM criancas WHERE professor_id=? AND ativa=1",
                (usuario["usuario_id"],)
            ).fetchone()[0]
            total_atividades = conn.execute(
                """SELECT COUNT(*) FROM progresso p
                   JOIN criancas c ON c.id = p.crianca_id
                   WHERE c.professor_id=? AND p.concluida=1""",
                (usuario["usuario_id"],)
            ).fetchone()[0]
        else:
            total_criancas = conn.execute(
                "SELECT COUNT(*) FROM criancas WHERE ativa=1"
            ).fetchone()[0]
            total_atividades = conn.execute(
                "SELECT COUNT(*) FROM progresso WHERE concluida=1"
            ).fetchone()[0]

    return jsonify({
        "total_criancas":    total_criancas,
        "atividades_feitas": total_atividades,
        "nome_usuario":      usuario["nome"],
        "ala":               usuario["ala"],
    })