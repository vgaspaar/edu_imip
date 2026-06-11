"""
blueprints/ia/routes.py

Rotas de IA generativa (Gemini).
Todas assíncronas por natureza — geram conteúdo novo a cada chamada.
"""

from flask import Blueprint, request, jsonify
import services.ia_service as ia_service

ia_bp = Blueprint("ia", __name__, url_prefix="/api/ia")


# ── GET /api/ia/status ────────────────────────────────────────────
@ia_bp.route("/status", methods=["GET"])
def status():
    return jsonify({"disponivel": ia_service.ia_disponivel()})


# ── GET /api/ia/historia?nivel=iniciante&tema=animais ─────────────
@ia_bp.route("/historia", methods=["GET"])
def historia():
    nivel = request.args.get("nivel", "iniciante")
    tema  = request.args.get("tema", "animais")
    if nivel not in ("iniciante", "intermediario", "avancado"):
        nivel = "iniciante"

    resultado = ia_service.gerar_historia(nivel=nivel, tema=tema)
    return jsonify(resultado)


# ── GET /api/ia/palavras?nivel=iniciante&quantidade=5 ─────────────
@ia_bp.route("/palavras", methods=["GET"])
def palavras():
    nivel      = request.args.get("nivel", "iniciante")
    quantidade = min(int(request.args.get("quantidade", 5)), 10)
    if nivel not in ("iniciante", "intermediario", "avancado"):
        nivel = "iniciante"

    resultado = ia_service.gerar_palavras_jogo(nivel=nivel, quantidade=quantidade)
    return jsonify({"palavras": resultado, "nivel": nivel, "ia": ia_service.ia_disponivel()})


# ── GET /api/ia/dica?palavra=ELEFANTE&nivel=iniciante ─────────────
@ia_bp.route("/dica", methods=["GET"])
def dica():
    palavra = request.args.get("palavra", "").upper().strip()
    nivel   = request.args.get("nivel", "iniciante")
    if not palavra:
        return jsonify({"erro": "Parâmetro 'palavra' obrigatório."}), 400

    dica_texto = ia_service.gerar_dica_palavra(palavra=palavra, nivel=nivel)
    return jsonify({"dica": dica_texto, "palavra": palavra})


# ── GET /api/ia/elogio?nome=Leãozinho ────────────────────────────
@ia_bp.route("/elogio", methods=["GET"])
def elogio():
    nome = request.args.get("nome", "amiguinho").strip()
    return jsonify({"elogio": ia_service.gerar_elogio(nome_crianca=nome)})


# ── POST /api/ia/historia_personalizada ──────────────────────────
@ia_bp.route("/historia_personalizada", methods=["POST"])
def historia_personalizada():
    """
    Gera história baseada no perfil da criança.
    Body: { nivel, tema, nome_crianca }
    """
    dados = request.get_json(silent=True) or {}
    nivel        = dados.get("nivel", "iniciante")
    tema         = dados.get("tema", "animais")
    nome_crianca = dados.get("nome_crianca", "")

    if nome_crianca:
        tema = f"{tema}, com personagem chamado {nome_crianca}"

    resultado = ia_service.gerar_historia(nivel=nivel, tema=tema)
    return jsonify(resultado)