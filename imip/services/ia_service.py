"""
services/ia_service.py

Integração com Google Gemini (grátis) via REST.
Gera histórias, palavras e dicas personalizadas para crianças internadas.
Não usa SDK — apenas requests (stdlib-like, já disponível).
"""

import os
import json
import time
import requests

# Cache simples em memória para evitar rate limit (429)
_cache = {}
_CACHE_TTL = 300  # 5 minutos

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={key}"

# Prompt base que contextualiza o modelo para o IMIP
SISTEMA = """
Você é um assistente pedagógico do IMIP (Instituto de Medicina Integral Prof. Fernando Figueira),
hospital infantil em Recife. Seu trabalho é criar conteúdo educativo lúdico de alfabetização
para crianças internadas entre 5 e 12 anos.

Regras OBRIGATÓRIAS:
- Linguagem simples, carinhosa e acolhedora
- Nunca mencione doenças, procedimentos médicos ou internação
- Foque em animais, natureza, aventuras, amizade e descobertas
- Textos curtos (máximo 5 frases por parágrafo)
- Retorne SEMPRE JSON válido, sem markdown, sem blocos de código
"""


def _chamar_gemini(prompt: str, max_tokens: int = 800) -> dict | None:
    """Faz a chamada REST ao Gemini. Retorna o JSON parseado ou None."""
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
    if not GEMINI_API_KEY:
        return None

    # Verifica cache
    cache_key = prompt[:120]
    if cache_key in _cache:
        ts, valor = _cache[cache_key]
        if time.time() - ts < _CACHE_TTL:
            return valor

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": SISTEMA + "\n\n" + prompt}
                ]
            }
        ],
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "temperature": 0.8,
        },
    }

    try:
        resp = requests.post(
            GEMINI_URL.format(key=os.environ.get("GEMINI_API_KEY", "")),
            json=payload,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        texto = data["candidates"][0]["content"]["parts"][0]["text"]
        # Remove possíveis blocos de código que o modelo insira mesmo assim
        texto = texto.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        resultado = json.loads(texto)
        _cache[cache_key] = (time.time(), resultado)
        return resultado
    except Exception as e:
        print(f"[ia_service] Erro Gemini: {e}")
        return None


# ─────────────────────────────────────────────────────────────────
# 1. GERAR HISTÓRIA PERSONALIZADA
# ─────────────────────────────────────────────────────────────────
def gerar_historia(nivel: str = "iniciante", tema: str = "animais") -> dict:
    """
    Retorna uma história curta com palavras destacadas para clicar.
    Estrutura: { titulo, texto, palavras_destaque, nivel }
    """
    prompt = f"""
Crie uma história infantil de alfabetização com estas especificações:

- Nível: {nivel}
- Tema: {tema}
- Tamanho: 3 a 4 frases
- Deve conter exatamente 4 palavras importantes destacadas com <b>palavra</b>
- As palavras destacadas devem ser simples e relacionadas ao tema

Retorne APENAS este JSON (sem nenhum texto fora dele):
{{
  "titulo": "título curto e criativo",
  "texto": "texto da história com <b>palavras</b> destacadas",
  "palavras_destaque": ["palavra1", "palavra2", "palavra3", "palavra4"],
  "nivel": "{nivel}"
}}
"""
    resultado = _chamar_gemini(prompt, max_tokens=400)
    if resultado:
        return resultado

    # Fallback se a IA não estiver disponível
    return {
        "titulo": "Léo e a Floresta",
        "texto": "O <b>leão</b> Léo vivia numa floresta muito <b>bonita</b>. Ele tinha muitos <b>amigos</b> e adorava <b>brincar</b> com todos.",
        "palavras_destaque": ["leão", "bonita", "amigos", "brincar"],
        "nivel": nivel,
        "ia": False,
    }


# ─────────────────────────────────────────────────────────────────
# 2. GERAR PALAVRAS PARA O JOGO DE LETRAS
# ─────────────────────────────────────────────────────────────────
def gerar_palavras_jogo(nivel: str = "iniciante", quantidade: int = 5) -> list:
    """
    Retorna lista de palavras para o jogo de letras.
    Cada item: { palavra, emoji, dica }
    """
    tamanho = {
        "iniciante":     "3 a 4 letras",
        "intermediario": "5 a 6 letras",
        "avancado":      "7 a 9 letras",
    }.get(nivel, "3 a 4 letras")

    prompt = f"""
Crie {quantidade} palavras para um jogo de completar letras para crianças.

- Nível: {nivel} (palavras de {tamanho})
- Tema: animais brasileiros ou objetos do cotidiano
- Cada palavra deve ter um emoji relacionado e uma dica curta (máx 6 palavras)

Retorne APENAS este JSON (array, sem texto fora):
[
  {{"palavra": "GATO", "emoji": "🐱", "dica": "Faz miau e ronrona!"}},
  ...
]
"""
    resultado = _chamar_gemini(prompt, max_tokens=500)
    if resultado and isinstance(resultado, list) and len(resultado) > 0:
        # Garante que palavra está em maiúsculas
        for item in resultado:
            item["palavra"] = item.get("palavra", "").upper()
        return resultado

    # Fallback por nível
    fallbacks = {
        "iniciante": [
            {"palavra": "GATO",  "emoji": "🐱", "dica": "Faz miau!"},
            {"palavra": "BOLA",  "emoji": "⚽", "dica": "Usamos para jogar!"},
            {"palavra": "CASA",  "emoji": "🏠", "dica": "É onde moramos!"},
            {"palavra": "PATO",  "emoji": "🦆", "dica": "Nada na lagoa!"},
            {"palavra": "MACA",  "emoji": "🍎", "dica": "Fruta vermelha!"},
        ],
        "intermediario": [
            {"palavra": "ELEFANTE",  "emoji": "🐘", "dica": "Tem tromba!"},
            {"palavra": "BORBOLETA", "emoji": "🦋", "dica": "Tem asas coloridas!"},
            {"palavra": "TARTARUGA", "emoji": "🐢", "dica": "Anda devagar!"},
            {"palavra": "GIRAFA",    "emoji": "🦒", "dica": "Pescoço comprido!"},
            {"palavra": "MACACO",    "emoji": "🐒", "dica": "Gosta de banana!"},
        ],
        "avancado": [
            {"palavra": "CROCODILO",  "emoji": "🐊", "dica": "Réptil de dentes afiados!"},
            {"palavra": "HIPOPOTAMO", "emoji": "🦛", "dica": "Vive no rio!"},
            {"palavra": "PAPAGAIO",   "emoji": "🦜", "dica": "Repete o que ouve!"},
            {"palavra": "RINOCERONTE","emoji": "🦏", "dica": "Tem chifre no nariz!"},
            {"palavra": "CHIMPANZE",  "emoji": "🐵", "dica": "Primo do macaco!"},
        ],
    }
    return fallbacks.get(nivel, fallbacks["iniciante"])


# ─────────────────────────────────────────────────────────────────
# 3. GERAR DICA PERSONALIZADA PARA UMA PALAVRA
# ─────────────────────────────────────────────────────────────────
def gerar_dica_palavra(palavra: str, nivel: str = "iniciante") -> str:
    """Gera uma dica criativa e divertida para a palavra."""
    prompt = f"""
Crie uma dica divertida para a palavra "{palavra}" para uma criança de nível {nivel}.
A dica deve ter no máximo 8 palavras e não pode conter a palavra em si.

Retorne APENAS este JSON:
{{"dica": "sua dica aqui"}}
"""
    resultado = _chamar_gemini(prompt, max_tokens=100)
    if resultado and "dica" in resultado:
        return resultado["dica"]
    return f"Descubra o que é {palavra.lower()}!"


# ─────────────────────────────────────────────────────────────────
# 4. GERAR ELOGIO PERSONALIZADO (feedback positivo)
# ─────────────────────────────────────────────────────────────────
def gerar_elogio(nome_crianca: str = "amiguinho") -> str:
    """Gera um elogio motivacional personalizado."""
    prompt = f"""
Crie um elogio motivacional curto (máx 10 palavras) para uma criança chamada {nome_crianca}
que acabou de acertar uma atividade de alfabetização no hospital.

Retorne APENAS este JSON:
{{"elogio": "seu elogio aqui"}}
"""
    resultado = _chamar_gemini(prompt, max_tokens=100)
    if resultado and "elogio" in resultado:
        return resultado["elogio"]
    return f"Parabéns, {nome_crianca}! Você é incrível! 🌟"


# ─────────────────────────────────────────────────────────────────
# 5. VERIFICAR SE A IA ESTÁ DISPONÍVEL
# ─────────────────────────────────────────────────────────────────
def ia_disponivel() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY", ""))