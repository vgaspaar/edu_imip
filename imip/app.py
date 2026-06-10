"""
app.py — Ponto de entrada da aplicação IMIP Alfabetiza.
"""

import os
from flask import Flask, send_from_directory
from dotenv import load_dotenv

# Carrega variáveis do .env antes de qualquer import de blueprint
load_dotenv()

app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = os.environ.get("SECRET_KEY", "imip-alfabetiza-secret-2026")

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

#login
from flask import Flask, render_template, request, redirect, url_for, session

app = Flask(__name__)
app.secret_key = 'chave_super_secreta_para_criancas'

# Simulação de banco de dados
usuarios = {
    "profe1": {"senha": "123", "tipo": "professor"},
    "zezinho": {"senha": "456", "tipo": "aluno"}
}

@app.route('/')
def index():
    return render_template('login.html')

@app.route('/login', methods=['POST'])
def login():
    usuario = request.form.get('usuario')
    senha = request.form.get('senha')
    
    if usuario in usuarios and usuarios[usuario]['senha'] == senha:
        user_info = usuarios[usuario]
        session['usuario'] = usuario
        session['tipo'] = user_info['tipo']
        
        # Redirecionamento baseado no tipo
        if user_info['tipo'] == 'professor':
            return redirect(url_for('area_professor'))
        else:
            return redirect(url_for('area_crianca'))
    
    return "Usuário ou senha incorretos!", 401

@app.route('/crianca')
def area_crianca():
    # Proteção: só entra se for aluno
    if session.get('tipo') == 'aluno':
        return render_template('crianca.html')
    return redirect(url_for('index'))

@app.route('/professor')
def area_professor():
    # Proteção: só entra se for professor
    if session.get('tipo') == 'professor':
        return render_template('professor.html')
    return "Acesso negado! Área apenas para professores.", 403

if __name__ == '__main__':
    app.run(debug=True)
