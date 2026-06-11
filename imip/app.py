

import os
from flask import Flask, send_from_directory
from dotenv import load_dotenv

# Carrega variáveis do .env antes de qualquer import de blueprint
load_dotenv()

app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = os.environ.get("SECRET_KEY", "imip-alfabetiza-secret-2026")
app.config["JSON_AS_ASCII"] = False  # permite emojis e acentos no JSON

# ── Blueprints ────────────────────────────────────────────────────
from blueprints.auth.routes       import auth_bp
from blueprints.atividades.routes import atividades_bp
from blueprints.relatorios.routes import relatorios_bp
from blueprints.ia.routes         import ia_bp

app.register_blueprint(auth_bp)
app.register_blueprint(atividades_bp)
app.register_blueprint(relatorios_bp)
app.register_blueprint(ia_bp)

# ── Banco de dados ────────────────────────────────────────────────
from database.db import init_db
with app.app_context():
    init_db()

# ── Frontend SPA ──────────────────────────────────────────────────
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    app.run(debug=True, port=5000)