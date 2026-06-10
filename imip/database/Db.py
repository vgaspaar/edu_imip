"""
Camada de banco de dados - SQLite3 puro.
Todas as operações de dados passam por aqui.
"""

import sqlite3
import os
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(__file__), "imip.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row   # permite acessar colunas por nome
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def get_db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Cria todas as tabelas se não existirem e popula dados iniciais."""
    with get_db() as conn:
        conn.executescript("""
            -- ─────────────────────────────────────────
            --  USUÁRIOS  (professores e extensionistas)
            -- ─────────────────────────────────────────
            CREATE TABLE IF NOT EXISTS usuarios (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                nome        TEXT    NOT NULL,
                email       TEXT    NOT NULL UNIQUE,
                senha_hash  TEXT    NOT NULL,
                role        TEXT    NOT NULL CHECK(role IN ('professor','extensionista')),
                ala         TEXT    NOT NULL,
                ativo       INTEGER NOT NULL DEFAULT 1,
                criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            -- ─────────────────────────────────────────
            --  CRIANÇAS
            -- ─────────────────────────────────────────
            CREATE TABLE IF NOT EXISTS criancas (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                nome_ficticio   TEXT    NOT NULL,          -- anonimizado
                idade           INTEGER NOT NULL,
                nivel           TEXT    NOT NULL CHECK(nivel IN ('iniciante','intermediario','avancado')),
                ala             TEXT    NOT NULL,
                professor_id    INTEGER REFERENCES usuarios(id),
                ativa           INTEGER NOT NULL DEFAULT 1,
                criado_em       TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            -- ─────────────────────────────────────────
            --  ATIVIDADES
            -- ─────────────────────────────────────────
            CREATE TABLE IF NOT EXISTS atividades (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo        TEXT    NOT NULL CHECK(tipo IN ('jogo_letras','historia','vogais','silabas')),
                titulo      TEXT    NOT NULL,
                conteudo    TEXT    NOT NULL,    -- JSON
                nivel       TEXT    NOT NULL,
                ativo       INTEGER NOT NULL DEFAULT 1
            );

            -- ─────────────────────────────────────────
            --  PROGRESSO
            -- ─────────────────────────────────────────
            CREATE TABLE IF NOT EXISTS progresso (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                crianca_id      INTEGER NOT NULL REFERENCES criancas(id),
                atividade_id    INTEGER NOT NULL REFERENCES atividades(id),
                acertos         INTEGER NOT NULL DEFAULT 0,
                tentativas      INTEGER NOT NULL DEFAULT 0,
                concluida       INTEGER NOT NULL DEFAULT 0,
                feito_em        TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            -- ─────────────────────────────────────────
            --  SESSÕES  (auth simples sem JWT externo)
            -- ─────────────────────────────────────────
            CREATE TABLE IF NOT EXISTS sessoes (
                token       TEXT    PRIMARY KEY,
                usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
                criado_em   TEXT    NOT NULL DEFAULT (datetime('now')),
                expira_em   TEXT    NOT NULL
            );
        """)

        # ── Dados iniciais ──────────────────────────────────────────────
        # Verifica se já existem dados
        exists = conn.execute("SELECT COUNT(*) FROM atividades").fetchone()[0]
        if exists > 0:
            return

        import json

        palavras_iniciante = [
            {"palavra": "GATO",   "emoji": "🐱", "dica": "Faz miau!"},
            {"palavra": "BOLA",   "emoji": "⚽", "dica": "Usamos para jogar!"},
            {"palavra": "CASA",   "emoji": "🏠", "dica": "É onde moramos!"},
            {"palavra": "PATO",   "emoji": "🦆", "dica": "Nada na lagoa!"},
            {"palavra": "MACA",   "emoji": "🍎", "dica": "Fruta vermelha!"},
        ]
        palavras_inter = [
            {"palavra": "ELEFANTE",  "emoji": "🐘", "dica": "Tem tromba!"},
            {"palavra": "BORBOLETA", "emoji": "🦋", "dica": "Tem asas coloridas!"},
            {"palavra": "TARTARUGA", "emoji": "🐢", "dica": "Anda devagar!"},
            {"palavra": "GIRAFA",    "emoji": "🦒", "dica": "Pescoço comprido!"},
        ]
        palavras_avanc = [
            {"palavra": "CROCODILO",    "emoji": "🐊", "dica": "Réptil de dentes afiados!"},
            {"palavra": "HIPOPOTAMO",   "emoji": "🦛", "dica": "Vive no rio!"},
            {"palavra": "PAPAGAIO",     "emoji": "🦜", "dica": "Repete o que ouve!"},
        ]

        historias = [
            {
                "titulo": "Léo vai ao hospital",
                "texto": "Era uma vez um leãozinho chamado <b>Léo</b> que foi ao hospital. Ele tinha medo, mas a enfermeira <b>Ana</b> disse: Aqui você vai ficar <b>bem</b>! No quarto, Léo encontrou uma borboleta azul. A borboleta era a <b>Bela</b>, sua nova amiga! Juntos, aprenderam palavras novas todos os dias.",
                "palavras_destaque": ["Léo", "Ana", "bem", "Bela"],
                "nivel": "iniciante"
            },
            {
                "titulo": "A borboleta Bela",
                "texto": "A borboleta <b>Bela</b> adorava <b>voar</b> pelo jardim do hospital. Ela encontrou uma <b>flor</b> azul que nunca tinha visto. A flor disse: Olá, amiga! Bela ficou tão <b>feliz</b> que dançou com suas asas coloridas o dia todo.",
                "palavras_destaque": ["Bela", "voar", "flor", "feliz"],
                "nivel": "intermediario"
            },
            {
                "titulo": "O elefante Elô",
                "texto": "O elefante <b>Elô</b> adorava tomar banho com sua <b>tromba</b>. Um dia ele encontrou um pato na lagoa. O pato disse: Vem nadar comigo! Elô aprendeu que fazer <b>amigos</b> é a melhor coisa do mundo. Depois, os dois foram aprender letras juntos na escola do hospital.",
                "palavras_destaque": ["Elô", "tromba", "amigos"],
                "nivel": "avancado"
            },
        ]

        vogais_dados = {
            "vogais": ["A", "E", "I", "O", "U"],
            "exemplos": {
                "A": {"palavra": "ABELHA", "emoji": "🐝"},
                "E": {"palavra": "ESTRELA", "emoji": "⭐"},
                "I": {"palavra": "IGLU", "emoji": "🏔️"},
                "O": {"palavra": "OVO", "emoji": "🥚"},
                "U": {"palavra": "UVA", "emoji": "🍇"},
            }
        }

        silabas_dados = {
            "familias": [
                {"consoante": "B", "silabas": ["BA", "BE", "BI", "BO", "BU"], "exemplos": ["BALA", "BELO", "BICO", "BOLA", "BURRO"]},
                {"consoante": "C", "silabas": ["CA", "CE", "CI", "CO", "CU"], "exemplos": ["CAMA", "CEDO", "CIMA", "COPA", "CUBO"]},
                {"consoante": "D", "silabas": ["DA", "DE", "DI", "DO", "DU"], "exemplos": ["DADO", "DEDO", "DICA", "DONO", "DURO"]},
                {"consoante": "F", "silabas": ["FA", "FE", "FI", "FO", "FU"], "exemplos": ["FACA", "FENO", "FINO", "FOCA", "FUMO"]},
                {"consoante": "G", "silabas": ["GA", "GE", "GI", "GO", "GU"], "exemplos": ["GALO", "GELO", "GIBI", "GOTA", "GURU"]},
            ]
        }

        # Inserir atividades
        for p in palavras_iniciante:
            conn.execute(
                "INSERT INTO atividades (tipo, titulo, conteudo, nivel) VALUES (?,?,?,?)",
                ("jogo_letras", f"Palavra: {p['palavra']}", json.dumps(p, ensure_ascii=False), "iniciante")
            )
        for p in palavras_inter:
            conn.execute(
                "INSERT INTO atividades (tipo, titulo, conteudo, nivel) VALUES (?,?,?,?)",
                ("jogo_letras", f"Palavra: {p['palavra']}", json.dumps(p, ensure_ascii=False), "intermediario")
            )
        for p in palavras_avanc:
            conn.execute(
                "INSERT INTO atividades (tipo, titulo, conteudo, nivel) VALUES (?,?,?,?)",
                ("jogo_letras", f"Palavra: {p['palavra']}", json.dumps(p, ensure_ascii=False), "avancado")
            )
        for h in historias:
            conn.execute(
                "INSERT INTO atividades (tipo, titulo, conteudo, nivel) VALUES (?,?,?,?)",
                ("historia", h["titulo"], json.dumps(h, ensure_ascii=False), h["nivel"])
            )
        conn.execute(
            "INSERT INTO atividades (tipo, titulo, conteudo, nivel) VALUES (?,?,?,?)",
            ("vogais", "As Vogais", json.dumps(vogais_dados, ensure_ascii=False), "iniciante")
        )
        conn.execute(
            "INSERT INTO atividades (tipo, titulo, conteudo, nivel) VALUES (?,?,?,?)",
            ("silabas", "Famílias de Sílabas", json.dumps(silabas_dados, ensure_ascii=False), "iniciante")
        )