
import json
from flask import Blueprint, request, jsonify
from database.db import get_db
from auth_utils import validar_token

atividades_bp = Blueprint("atividades", __name__, url_prefix="/api/atividades")


def _nivel_param(req):
    nivel = req.args.get("nivel", "iniciante")
    if nivel not in ("iniciante", "intermediario", "avancado"):
        nivel = "iniciante"
    return nivel


# ── GET /api/atividades/jogo_letras ──────────────────────────────
@atividades_bp.route("/jogo_letras", methods=["GET"])
def jogo_letras():
    nivel = _nivel_param(request)
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, titulo, conteudo FROM atividades WHERE tipo='jogo_letras' AND nivel=? AND ativo=1",
            (nivel,)
        ).fetchall()
    items = [{"id": r["id"], "titulo": r["titulo"], **json.loads(r["conteudo"])} for r in rows]
    return jsonify({"atividades": items, "nivel": nivel})


# ── GET /api/atividades/historias ────────────────────────────────
@atividades_bp.route("/historias", methods=["GET"])
def historias():
    nivel = _nivel_param(request)
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, titulo, conteudo FROM atividades WHERE tipo='historia' AND nivel=? AND ativo=1",
            (nivel,)
        ).fetchall()
    items = [{"id": r["id"], **json.loads(r["conteudo"])} for r in rows]
    return jsonify({"historias": items, "nivel": nivel})


# ── GET /api/atividades/vogais ───────────────────────────────────
@atividades_bp.route("/vogais", methods=["GET"])
def vogais():
    with get_db() as conn:
        row = conn.execute(
            "SELECT conteudo FROM atividades WHERE tipo='vogais' LIMIT 1"
        ).fetchone()
    return jsonify(json.loads(row["conteudo"]) if row else {})


# ── GET /api/atividades/silabas ──────────────────────────────────
@atividades_bp.route("/silabas", methods=["GET"])
def silabas():
    with get_db() as conn:
        row = conn.execute(
            "SELECT conteudo FROM atividades WHERE tipo='silabas' LIMIT 1"
        ).fetchone()
    return jsonify(json.loads(row["conteudo"]) if row else {})


# ── POST /api/atividades/registrar_progresso ─────────────────────
@atividades_bp.route("/registrar_progresso", methods=["POST"])
def registrar_progresso():
    dados = request.get_json(silent=True) or {}
    crianca_id   = dados.get("crianca_id")
    atividade_id = dados.get("atividade_id")
    acertos      = int(dados.get("acertos", 0))
    tentativas   = int(dados.get("tentativas", 1))
    concluida    = 1 if dados.get("concluida") else 0

    if not crianca_id or not atividade_id:
        return jsonify({"erro": "crianca_id e atividade_id são obrigatórios."}), 400

    with get_db() as conn:
        conn.execute(
            """INSERT INTO progresso (crianca_id, atividade_id, acertos, tentativas, concluida)
               VALUES (?,?,?,?,?)""",
            (crianca_id, atividade_id, acertos, tentativas, concluida)
        )
    return jsonify({"ok": True}), 201


# ── GET /api/atividades/progresso/<crianca_id> ───────────────────
@atividades_bp.route("/progresso/<int:crianca_id>", methods=["GET"])
def ver_progresso(crianca_id):
    with get_db() as conn:
        rows = conn.execute(
            """SELECT a.tipo, a.titulo, p.acertos, p.tentativas,
                      p.concluida, p.feito_em
               FROM progresso p
               JOIN atividades a ON a.id = p.atividade_id
               WHERE p.crianca_id = ?
               ORDER BY p.feito_em DESC""",
            (crianca_id,)
        ).fetchall()
    total_atividades  = len(rows)
    total_concluidas  = sum(1 for r in rows if r["concluida"])
    total_acertos     = sum(r["acertos"] for r in rows)
    estrelas          = min(total_concluidas * 2, 20)

    return jsonify({
        "crianca_id":        crianca_id,
        "total_atividades":  total_atividades,
        "total_concluidas":  total_concluidas,
        "total_acertos":     total_acertos,
        "estrelas":          estrelas,
        "historico":         [dict(r) for r in rows],
    })