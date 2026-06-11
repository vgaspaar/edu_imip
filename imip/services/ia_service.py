"""
services/ia_service.py
Integração com Google Gemini (gratuito) via REST.
"""

import os
import json
import time
import hashlib
import requests

# ── Cache em memória ─────────────────────────────────────────────
_cache: dict = {}
_CACHE_TTL   = 600   # 10 minutos

# ── Cooldown global: última vez que recebemos 429 ────────────────
_ultimo_429: float = 0
_COOLDOWN_429      = 60  # segundos para esperar após 429

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-2.0-flash:generateContent?key={key}"
)

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

# Elogios e dicas fixas para usar como fallback sem chamar a API
_ELOGIOS_FIXOS = [
    "Incrível! Você arrasoooou! 🌟",
    "Que esperto! Continue assim! 🎉",
    "Parabéns, campeão! Você conseguiu! 🏆",
    "Uau! Que inteligente você é! ⭐",
    "Muito bem! Você é demais! 🦁",
    "Show de bola! Continue aprendendo! 📚",
    "Fantástico! Você é um gênio! 🧠",
]
_elogio_idx = 0


def _cache_key(texto: str) -> str:
    """Chave de cache robusta baseada em hash MD5."""
    return hashlib.md5(texto.encode()).hexdigest()


def _em_cooldown() -> bool:
    """Retorna True se ainda estamos no período de cooldown após 429."""
    global _ultimo_429
    if _ultimo_429 == 0:
        return False
    restante = _COOLDOWN_429 - (time.time() - _ultimo_429)
    if restante > 0:
        print(f"[ia_service] Em cooldown por mais {restante:.0f}s após 429.")
        return True
    _ultimo_429 = 0
    return False


def _chamar_gemini(prompt: str, max_tokens: int = 600) -> dict | None:
    """Chama o Gemini com cache e tratamento de 429."""
    global _ultimo_429

    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
    if not GEMINI_API_KEY:
        return None

    # 1. Verifica cooldown global de 429
    if _em_cooldown():
        return None

    # 2. Verifica cache
    key = _cache_key(prompt)
    if key in _cache:
        ts, valor = _cache[key]
        if time.time() - ts < _CACHE_TTL:
            print(f"[ia_service] Cache hit ✓")
            return valor

    # 3. Chama a API
    payload = {
        "contents": [{"parts": [{"text": SISTEMA + "\n\n" + prompt}]}],
        "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.75},
    }

    try:
        resp = requests.post(
            GEMINI_URL.format(key=GEMINI_API_KEY),
            json=payload,
            timeout=15,
        )

        # Trata 429 explicitamente — registra cooldown e retorna None
        if resp.status_code == 429:
            _ultimo_429 = time.time()
            print(f"[ia_service] 429 recebido — cooldown de {_COOLDOWN_429}s ativado.")
            return None

        resp.raise_for_status()

        data  = resp.json()
        texto = data["candidates"][0]["content"]["parts"][0]["text"]
        texto = texto.strip().strip("```json").strip("```").strip()
        resultado = json.loads(texto)

        # 4. Salva no cache
        _cache[key] = (time.time(), resultado)
        print(f"[ia_service] Resposta salva no cache.")
        return resultado

    except json.JSONDecodeError as e:
        print(f"[ia_service] JSON inválido do Gemini: {e}")
        return None
    except Exception as e:
        print(f"[ia_service] Erro: {e}")
        return None


# ─── 1. HISTÓRIA ─────────────────────────────────────────────────
def gerar_historia(nivel: str = "iniciante", tema: str = "animais") -> dict:
    prompt = f"""
Crie uma história infantil de alfabetização:
- Nível: {nivel} | Tema: {tema}
- Tamanho: 3 a 4 frases curtas
- Exatamente 4 palavras importantes destacadas com <b>palavra</b>

Retorne APENAS este JSON:
{{
  "titulo": "título curto e criativo",
  "texto": "texto com <b>palavras</b> destacadas",
  "palavras_destaque": ["palavra1", "palavra2", "palavra3", "palavra4"],
  "nivel": "{nivel}"
}}
"""
    resultado = _chamar_gemini(prompt, max_tokens=350)
    if resultado and "titulo" in resultado:
        return resultado

    return {
        "titulo": "Léo e a Floresta Mágica",
        "texto": "O <b>leão</b> Léo vivia numa floresta muito <b>bonita</b>. Ele tinha muitos <b>amigos</b> e adorava <b>brincar</b> com todos eles.",
        "palavras_destaque": ["leão", "bonita", "amigos", "brincar"],
        "nivel": nivel, "ia": False,
    }


# ─── 2. PALAVRAS DO JOGO ─────────────────────────────────────────
def gerar_palavras_jogo(nivel: str = "iniciante", quantidade: int = 5) -> list:
    tamanho = {
        "iniciante":     "3 a 4 letras",
        "intermediario": "5 a 6 letras",
        "avancado":      "7 a 9 letras",
    }.get(nivel, "3 a 4 letras")

    prompt = f"""
Crie {quantidade} palavras para jogo de letras para crianças.
Nível {nivel} ({tamanho}). Tema: animais brasileiros ou objetos do dia a dia.
Cada item precisa de emoji e dica curta (máx 6 palavras).

Retorne APENAS array JSON:
[{{"palavra": "GATO", "emoji": "🐱", "dica": "Faz miau e ronrona!"}}]
"""
    resultado = _chamar_gemini(prompt, max_tokens=450)
    if resultado and isinstance(resultado, list) and len(resultado) > 0:
        for item in resultado:
            item["palavra"] = item.get("palavra", "").upper().strip()
        return resultado

    fallbacks = {
        "iniciante": [
            {"palavra": "GATO",  "emoji": "🐱", "dica": "Faz miau!"},
            {"palavra": "BOLA",  "emoji": "⚽", "dica": "Usamos para jogar!"},
            {"palavra": "CASA",  "emoji": "🏠", "dica": "É onde moramos!"},
            {"palavra": "PATO",  "emoji": "🦆", "dica": "Nada na lagoa!"},
            {"palavra": "MACA",  "emoji": "🍎", "dica": "Fruta vermelha!"},
            {"palavra": "LOBO",  "emoji": "🐺", "dica": "Uiva para a lua!"},
        ],
        "intermediario": [
            {"palavra": "ELEFANTE",  "emoji": "🐘", "dica": "Tem tromba gigante!"},
            {"palavra": "BORBOLETA", "emoji": "🦋", "dica": "Tem asas coloridas!"},
            {"palavra": "TARTARUGA", "emoji": "🐢", "dica": "Anda bem devagar!"},
            {"palavra": "GIRAFA",    "emoji": "🦒", "dica": "Pescoço muito comprido!"},
            {"palavra": "MACACO",    "emoji": "🐒", "dica": "Adora comer banana!"},
        ],
        "avancado": [
            {"palavra": "CROCODILO",   "emoji": "🐊", "dica": "Réptil de dentes afiados!"},
            {"palavra": "HIPOPOTAMO",  "emoji": "🦛", "dica": "Vive perto do rio!"},
            {"palavra": "PAPAGAIO",    "emoji": "🦜", "dica": "Repete tudo que ouve!"},
            {"palavra": "RINOCERONTE", "emoji": "🦏", "dica": "Tem chifre no nariz!"},
            {"palavra": "CHIMPANZE",   "emoji": "🐵", "dica": "Parente do ser humano!"},
        ],
    }
    return fallbacks.get(nivel, fallbacks["iniciante"])


# ─── 3. DICA PARA PALAVRA ────────────────────────────────────────
def gerar_dica_palavra(palavra: str, nivel: str = "iniciante") -> str:
    prompt = f"""
Dica divertida (máx 8 palavras) para a palavra "{palavra}" para criança nível {nivel}.
Não use a palavra na dica.
Retorne APENAS: {{"dica": "sua dica"}}
"""
    resultado = _chamar_gemini(prompt, max_tokens=80)
    if resultado and "dica" in resultado:
        return resultado["dica"]
    return f"Pense bem, você consegue descobrir! 🤔"


# ─── 4. ELOGIO ───────────────────────────────────────────────────
def gerar_elogio(nome_crianca: str = "amiguinho") -> str:
    """Usa lista fixa em rotação para não desperdiçar quota da API."""
    global _elogio_idx
    # Usa lista fixa — não chama API para elogios (economiza quota)
    elogio = _ELOGIOS_FIXOS[_elogio_idx % len(_ELOGIOS_FIXOS)]
    _elogio_idx += 1
    return elogio


# ─── 5. STATUS ───────────────────────────────────────────────────
def ia_disponivel() -> bool:
    """Disponível se tiver chave E não estiver em cooldown de 429."""
    if not os.environ.get("GEMINI_API_KEY", ""):
        return False
    if _em_cooldown():
        return False
    return True