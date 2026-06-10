"""
app.py — Ponto de entrada da aplicação IMIP Alfabetiza.
Registra Blueprints, inicializa o banco e serve o frontend.
"""

import os
from flask import Flask, send_from_directory

# ── Inicializa app ─────────────────────────────────────────────────
app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = os.environ.get("SECRET_KEY", "imip-alfabetiza-secret-2026")

# ── Registra Blueprints ────────────────────────────────────────────
from blueprints.auth.routes      import auth_bp
from blueprints.atividades.routes import atividades_bp
from blueprints.relatorios.routes import relatorios_bp

app.register_blueprint(auth_bp)
app.register_blueprint(atividades_bp)
app.register_blueprint(relatorios_bp)

# ── Inicializa banco de dados ──────────────────────────────────────
from database.db import init_db
with app.app_context():
    init_db()

# ── Rota raiz — serve o SPA ────────────────────────────────────────
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    app.run(debug=True, port=5000)