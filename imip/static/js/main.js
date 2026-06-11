"use strict";

// ─── ESTADO GLOBAL ──────────────────────────────────────────────
const estado = {
  paginaAtual:  "inicio",
  usuarioLogado: null,
  _iaVerificada: false,
  jogo:      { palavras: [], indice: 0, nivel: "iniciante", resposta: [], botoes: [], dicaUsada: false },
  historias: { lista: [], indice: 0 },
  vogais:    null,
  silabas:   null,
  familiaAtual: 0,
  progresso: { estrelas: 0, acertos: 0, concluidas: 0 },
};

let iaDisponivel = false;

// ─── SÍNTESE DE VOZ ─────────────────────────────────────────────
function falar(texto) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = "pt-BR"; u.rate = 0.85; u.pitch = 1.2;
  window.speechSynthesis.speak(u);
}

// ─── ACESSIBILIDADE ──────────────────────────────────────────────
function anunciar(msg) {
  const el = document.getElementById("sr-live");
  if (!el) return;
  el.textContent = "";
  setTimeout(() => { el.textContent = msg; }, 50);
}

// ─── TOAST ──────────────────────────────────────────────────────
let toastTimer = null;
function toast(msg, tipo = "ok") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast" + (tipo === "erro" ? " erro" : "");
  t.classList.add("show");
  anunciar(msg);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3000);
}

// ─── NAV: atualiza visual conforme estado de login ───────────────
function atualizarNav() {
  const nomeEl   = document.getElementById("nav-nome-usuario");
  const btnSair  = document.getElementById("btn-logout");
  const u = estado.usuarioLogado;
  if (u) {
    const icone = u.role === "crianca" ? "🦁" : "👩‍🏫";
    nomeEl.textContent    = `${icone} ${u.nome.split(" ")[0]}`;
    nomeEl.hidden         = false;
    btnSair.style.display = "inline-flex";
  } else {
    nomeEl.hidden         = true;
    btnSair.style.display = "none";
  }
}

// ─── NAVEGAÇÃO SPA ──────────────────────────────────────────────
function irPara(pagina) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("ativa"));
  document.querySelectorAll(".nav-menu a").forEach(a => a.removeAttribute("aria-current"));

  const el = document.getElementById("page-" + pagina);
  if (!el) return false;
  el.classList.add("ativa");
  estado.paginaAtual = pagina;

  const navEl = document.getElementById("nav-" + pagina);
  if (navEl) navEl.setAttribute("aria-current", "page");

  // Foca no primeiro heading para acessibilidade
  const h = el.querySelector("h1,h2");
  if (h) { h.setAttribute("tabindex", "-1"); h.focus(); }

  // Carrega conteúdo conforme página
  if (pagina === "jogo"      && estado.jogo.palavras.length === 0 && estado._iaVerificada) carregarJogo();
  if (pagina === "historias" && estado.historias.lista.length === 0 && estado._iaVerificada) carregarHistorias();
  if (pagina === "vogais"    && !estado.vogais)  carregarVogais();
  if (pagina === "silabas"   && !estado.silabas) carregarSilabas();
  if (pagina === "progresso") renderizarProgresso();

  // Página professor: se logado vai direto ao painel, senão mostra login
  if (pagina === "professor") {
    if (estado.usuarioLogado && estado.usuarioLogado.role !== "crianca") {
      mostrarPainel(estado.usuarioLogado);
    } else if (estado.usuarioLogado && estado.usuarioLogado.role === "crianca") {
      // criança tentando acessar professor — redireciona para início
      irPara("inicio");
      toast("Essa área é só para professores! 👩‍🏫");
    } else {
      document.getElementById("area-login").hidden  = false;
      document.getElementById("area-painel").hidden = true;
    }
  }

  return false;
}

// Clique no nome do usuário na nav → vai para o painel se for professor
function clicarNomeUsuario() {
  if (!estado.usuarioLogado) return;
  if (estado.usuarioLogado.role === "crianca") {
    irPara("progresso");
  } else {
    irPara("professor");
  }
}

// ─── API ─────────────────────────────────────────────────────────
async function api(metodo, rota, corpo = null) {
  const ops = { method: metodo, headers: { "Content-Type": "application/json" }, credentials: "include" };
  if (corpo) ops.body = JSON.stringify(corpo);
  try {
    const r = await fetch(rota, ops);
    const json = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, dados: json };
  } catch(e) {
    return { ok: false, status: 0, dados: {} };
  }
}

// ─── LOADING ─────────────────────────────────────────────────────
function mostrarLoading(pagina) {
  const l = document.getElementById(pagina + "-loading");
  const c = document.getElementById(pagina + "-conteudo");
  if (l) { l.style.display = "flex";  l.removeAttribute("hidden"); }
  if (c) { c.style.display = "none";  c.setAttribute("hidden", ""); }
}
function esconderLoading(pagina) {
  const l = document.getElementById(pagina + "-loading");
  const c = document.getElementById(pagina + "-conteudo");
  if (l) { l.style.display = "none"; l.setAttribute("hidden", ""); }
  if (c) { c.style.display = "block"; c.removeAttribute("hidden"); }
}

// ─── IA: retry com backoff para 429 ──────────────────────────────
async function apiIA(rota, tentativas = 2) {
  for (let i = 0; i < tentativas; i++) {
    const res = await api("GET", rota);
    if (res.status === 429) {
      if (i < tentativas - 1) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
      continue;
    }
    return res;
  }
  return { ok: false, status: 429, dados: {} };
}

// ══════════════════════════════════════════════════════════════════
// JOGO DE LETRAS
// ══════════════════════════════════════════════════════════════════
async function carregarJogo() {
  mostrarLoading("jogo");
  let lista = [];

  if (iaDisponivel) {
    const res = await apiIA(`/api/ia/palavras?nivel=${estado.jogo.nivel}&quantidade=6`);
    if (res.ok && res.dados.palavras && res.dados.palavras.length) {
      lista = res.dados.palavras;
    }
  }

  // Fallback para banco
  if (!lista.length) {
    const { ok, dados } = await api("GET", `/api/atividades/jogo_letras?nivel=${estado.jogo.nivel}`);
    if (ok && dados.atividades && dados.atividades.length) lista = dados.atividades;
  }

  if (!lista.length) {
    toast("Erro ao carregar atividades.", "erro");
    esconderLoading("jogo");
    return;
  }

  estado.jogo.palavras = lista;
  estado.jogo.indice   = 0;
  mostrarJogo();
}

function mostrarJogo() {
  const item = estado.jogo.palavras[estado.jogo.indice];
  if (!item) return;

  estado.jogo.resposta  = new Array(item.palavra.length).fill("");
  estado.jogo.botoes    = [];
  estado.jogo.dicaUsada = false;

  const emojiEl = document.getElementById("jogo-emoji");
  emojiEl.textContent = item.emoji;
  emojiEl.setAttribute("aria-label", item.dica);
  document.getElementById("jogo-dica-txt").textContent = "_ ".repeat(item.palavra.length).trim();

  // Slots de resposta
  const areaResp = document.getElementById("resposta-area");
  areaResp.innerHTML = "";
  for (let i = 0; i < item.palavra.length; i++) {
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.id = "slot-" + i;
    slot.setAttribute("aria-label", `Posição ${i + 1}: vazio`);
    areaResp.appendChild(slot);
  }

  // Letras embaralhadas com repetição
  const letrasArea = document.getElementById("letras-area");
  letrasArea.innerHTML = "";
  embaralharLetras(item.palavra).forEach(l => {
    const btn = document.createElement("button");
    btn.className = "letra-btn";
    btn.textContent = l;
    btn.setAttribute("aria-label", `Letra ${l}`);
    btn.onclick = () => clicarLetra(btn, l);
    letrasArea.appendChild(btn);
  });

  const fb = document.getElementById("feedback-jogo");
  fb.textContent = "";
  fb.removeAttribute("data-status");

  document.getElementById("jogo-atual-num").textContent = estado.jogo.indice + 1;
  document.getElementById("jogo-total").textContent     = estado.jogo.palavras.length;
  document.getElementById("btn-dica").disabled          = false;
  document.getElementById("btn-dica").textContent       = "💡 Dica";

  esconderLoading("jogo");
  anunciar(`Palavra ${estado.jogo.indice + 1} de ${estado.jogo.palavras.length}. ${item.dica}`);
}

function embaralharLetras(palavra) {
  const extras = "ABCDEFGHIJKLMNOPRSTUVZ";
  const letras = [...palavra]; // todas com repetição
  const distratoras = new Set();
  while (distratoras.size < Math.min(4, 14 - letras.length)) {
    const l = extras[Math.floor(Math.random() * extras.length)];
    if (!palavra.includes(l)) distratoras.add(l);
  }
  return [...letras, ...distratoras].sort(() => Math.random() - 0.5);
}

function clicarLetra(btn, letra) {
  const item = estado.jogo.palavras[estado.jogo.indice];
  const primeiroVazio = estado.jogo.resposta.findIndex(l => l === "");
  if (primeiroVazio === -1) return;

  estado.jogo.resposta[primeiroVazio] = letra;
  estado.jogo.botoes[primeiroVazio]   = btn;

  const slot = document.getElementById("slot-" + primeiroVazio);
  slot.textContent = letra;
  slot.classList.add("preenchido");
  slot.setAttribute("aria-label", `Posição ${primeiroVazio + 1}: ${letra}`);

  if (item.palavra[primeiroVazio] === letra) {
    btn.classList.add("acerto");
    falar(letra);
  } else {
    btn.classList.add("erro");
    setTimeout(() => btn.classList.remove("erro"), 400);
  }
  btn.style.opacity = "0.4";
  btn.disabled = true;
}

function apagarLetra() {
  let ultimo = -1;
  for (let i = 0; i < estado.jogo.resposta.length; i++) {
    if (estado.jogo.resposta[i] !== "") ultimo = i;
  }
  if (ultimo === -1) return;

  const btn = estado.jogo.botoes[ultimo];
  if (btn) {
    btn.disabled = false;
    btn.style.opacity = "1";
    btn.classList.remove("acerto", "erro");
  }

  estado.jogo.resposta[ultimo] = "";
  const slot = document.getElementById("slot-" + ultimo);
  slot.textContent = "";
  slot.classList.remove("preenchido");
  slot.setAttribute("aria-label", `Posição ${ultimo + 1}: vazio`);

  const fb = document.getElementById("feedback-jogo");
  fb.textContent = "";
  fb.removeAttribute("data-status");
}

async function verificarJogo() {
  const item     = estado.jogo.palavras[estado.jogo.indice];
  const fb       = document.getElementById("feedback-jogo");
  const resposta = estado.jogo.resposta.join("");

  if (resposta === item.palavra) {
    fb.textContent    = "🎉 Muito bem! Você acertou!";
    fb.dataset.status = "certo";
    estado.progresso.acertos++;
    estado.progresso.concluidas++;
    estado.progresso.estrelas++;
    anunciar("Correto! Parabéns!");
    registrarProgresso(item.id || 1, 1, 1, true);
    buscarElogio();
  } else if (estado.jogo.resposta.includes("")) {
    fb.textContent    = "🤔 Complete todas as letras primeiro!";
    fb.dataset.status = "aviso";
    anunciar("Complete todas as letras primeiro.");
  } else {
    fb.textContent    = "❌ Quase! Tente de novo ou peça uma dica!";
    fb.dataset.status = "errado";
    anunciar("Resposta errada. Tente novamente ou peça uma dica.");
    registrarProgresso(item.id || 1, 0, 1, false);
  }
}

async function darDicaJogo() {
  if (estado.jogo.dicaUsada) { toast("Dica já usada!"); return; }

  const item = estado.jogo.palavras[estado.jogo.indice];
  const btn  = document.getElementById("btn-dica");
  const fb   = document.getElementById("feedback-jogo");

  if (btn) { btn.disabled = true; btn.textContent = "⏳..."; }

  let dicaTexto = item.dica;

  if (iaDisponivel) {
    const res = await apiIA(`/api/ia/dica?palavra=${item.palavra}&nivel=${estado.jogo.nivel}`);
    if (res.ok && res.dados.dica) dicaTexto = res.dados.dica;
  }

  fb.textContent    = "💡 " + dicaTexto;
  fb.dataset.status = "aviso";
  falar(dicaTexto);
  anunciar("Dica: " + dicaTexto);
  estado.jogo.dicaUsada = true;
  if (btn) { btn.disabled = true; btn.textContent = "💡 Dica"; }
}

function proximaJogo() {
  estado.jogo.indice = (estado.jogo.indice + 1) % estado.jogo.palavras.length;
  mostrarJogo();
}

function mudarNivelJogo(btn) {
  document.querySelectorAll(".nivel-btn").forEach(b => b.setAttribute("aria-pressed", "false"));
  btn.setAttribute("aria-pressed", "true");
  estado.jogo.nivel    = btn.dataset.nivel;
  estado.jogo.palavras = [];
  carregarJogo();
}

// ══════════════════════════════════════════════════════════════════
// HISTÓRIAS
// ══════════════════════════════════════════════════════════════════
async function carregarHistorias() {
  mostrarLoading("historias");

  if (iaDisponivel) {
    const res = await apiIA("/api/ia/historia?nivel=iniciante&tema=animais");
    if (res.ok && res.dados.titulo) {
      estado.historias.lista  = [res.dados];
      estado.historias.indice = 0;
      mostrarHistoria();
      adicionarBotaoIA();
      return;
    }
  }

  const { ok, dados } = await api("GET", "/api/atividades/historias?nivel=iniciante");
  if (!ok || !dados.historias || !dados.historias.length) {
    toast("Erro ao carregar histórias.", "erro");
    esconderLoading("historias");
    return;
  }
  estado.historias.lista  = dados.historias;
  estado.historias.indice = 0;
  mostrarHistoria();
  adicionarBotaoIA();
}

function mostrarHistoria() {
  const h = estado.historias.lista[estado.historias.indice];
  if (!h) return;

  document.getElementById("historia-titulo").textContent = h.titulo;
  document.getElementById("historia-meta").textContent   =
    `História ${estado.historias.indice + 1} de ${estado.historias.lista.length} · 2 min de leitura`;
  document.getElementById("historia-contador").textContent =
    `${estado.historias.indice + 1} / ${estado.historias.lista.length}`;

  let texto = h.texto;
  if (h.palavras_destaque) {
    h.palavras_destaque.forEach(p => {
      const regex = new RegExp(`<b>${p}</b>`, "g");
      texto = texto.replace(regex,
        `<span class="palavra" tabindex="0" role="button"
          aria-label="Ouvir a palavra ${p}"
          onclick="ouvirPalavra('${p}')"
          onkeydown="if(event.key==='Enter'||event.key===' ')ouvirPalavra('${p}')">${p}</span>`
      );
    });
  }
  texto = texto.replace(/<b>(.*?)<\/b>/g, "<strong>$1</strong>");
  document.getElementById("historia-texto").innerHTML = texto;
  esconderLoading("historias");
  anunciar(`História: ${h.titulo}`);
}

function adicionarBotaoIA() {
  if (!iaDisponivel) return;
  if (document.getElementById("btn-ia-historia")) return;
  const nav = document.querySelector(".historia-nav");
  if (!nav) return;
  const btn = document.createElement("button");
  btn.id        = "btn-ia-historia";
  btn.className = "btn btn-roxo";
  btn.innerHTML = "✨ Gerar nova";
  btn.onclick   = async () => {
    mostrarLoading("historias");
    const temas = ["animais", "floresta", "oceano", "fazenda", "circo"];
    const tema  = temas[Math.floor(Math.random() * temas.length)];
    const res = await apiIA(`/api/ia/historia?nivel=iniciante&tema=${encodeURIComponent(tema)}`);
    if (res.ok && res.dados.titulo) {
      estado.historias.lista  = [res.dados];
      estado.historias.indice = 0;
      mostrarHistoria();
    } else {
      toast("Tente novamente em instantes.", "erro");
      esconderLoading("historias");
    }
  };
  nav.appendChild(btn);
}

function ouvirPalavra(palavra) { falar(palavra); toast(`🔊 ${palavra.toUpperCase()}`); }
function proximaHistoria()     { estado.historias.indice = (estado.historias.indice + 1) % estado.historias.lista.length; mostrarHistoria(); }
function anteriorHistoria()    { estado.historias.indice = (estado.historias.indice - 1 + estado.historias.lista.length) % estado.historias.lista.length; mostrarHistoria(); }

// ══════════════════════════════════════════════════════════════════
// VOGAIS
// ══════════════════════════════════════════════════════════════════
async function carregarVogais() {
  mostrarLoading("vogais");
  const { ok, dados } = await api("GET", "/api/atividades/vogais");
  if (!ok) { toast("Erro ao carregar vogais.", "erro"); return; }
  estado.vogais = dados;
  renderizarVogais();
}

function renderizarVogais() {
  const grade = document.getElementById("vogais-grade");
  grade.innerHTML = "";
  estado.vogais.vogais.forEach(v => {
    const ex   = estado.vogais.exemplos[v];
    const card = document.createElement("button");
    card.className = `vogal-card vogal-${v}`;
    card.setAttribute("aria-label", `Vogal ${v}. Exemplo: ${ex.palavra}`);
    card.innerHTML = `
      <span class="vogal-letra">${v}</span>
      <span class="vogal-exemplo-emoji" aria-hidden="true">${ex.emoji}</span>
      <span class="vogal-exemplo-word">${ex.palavra}</span>
    `;
    card.onclick = () => {
      falar(v + ". " + ex.palavra);
      document.getElementById("vogal-detalhe").textContent = `${v} de ${ex.palavra} ${ex.emoji}`;
      anunciar(`${v} de ${ex.palavra}`);
    };
    grade.appendChild(card);
  });
  esconderLoading("vogais");
}

// ══════════════════════════════════════════════════════════════════
// SÍLABAS
// ══════════════════════════════════════════════════════════════════
async function carregarSilabas() {
  mostrarLoading("silabas");
  const { ok, dados } = await api("GET", "/api/atividades/silabas");
  if (!ok) { toast("Erro ao carregar sílabas.", "erro"); return; }
  estado.silabas = dados;
  renderizarSilabas();
}

function renderizarSilabas() {
  const selector = document.getElementById("familia-selector");
  selector.innerHTML = "";
  estado.silabas.familias.forEach((f, i) => {
    const btn = document.createElement("button");
    btn.className = "familia-btn";
    btn.textContent = f.consoante;
    btn.setAttribute("aria-pressed", i === 0 ? "true" : "false");
    btn.setAttribute("aria-label", `Família do ${f.consoante}`);
    btn.onclick = () => {
      document.querySelectorAll(".familia-btn").forEach(b => b.setAttribute("aria-pressed", "false"));
      btn.setAttribute("aria-pressed", "true");
      estado.familiaAtual = i;
      mostrarFamilia(i);
    };
    selector.appendChild(btn);
  });
  mostrarFamilia(0);
  esconderLoading("silabas");
}

function mostrarFamilia(idx) {
  const f        = estado.silabas.familias[idx];
  const display  = document.getElementById("silabas-display");
  const exemplos = document.getElementById("exemplos-lista");
  display.innerHTML  = "";
  exemplos.innerHTML = "";

  f.silabas.forEach(s => {
    const pill = document.createElement("button");
    pill.className = "silaba-pill";
    pill.textContent = s;
    pill.setAttribute("aria-label", `Sílaba ${s}`);
    pill.onclick = () => { falar(s); anunciar(s); };
    display.appendChild(pill);
  });

  f.exemplos.forEach(e => {
    const li = document.createElement("li");
    li.className = "exemplo-item";
    li.textContent = e;
    exemplos.appendChild(li);
  });
  anunciar(`Família do ${f.consoante}: ${f.silabas.join(", ")}`);
}

// ══════════════════════════════════════════════════════════════════
// PROGRESSO LOCAL
// ══════════════════════════════════════════════════════════════════
function renderizarProgresso() {
  const p = estado.progresso;
  document.getElementById("prog-estrelas").textContent    = p.estrelas + " ⭐";
  document.getElementById("prog-acertos").textContent     = p.acertos;
  document.getElementById("prog-concluidas").textContent  = p.concluidas;
  document.getElementById("prog-bar-estrelas").style.width   = Math.min(p.estrelas * 5, 100) + "%";
  document.getElementById("prog-bar-acertos").style.width    = Math.min(p.acertos * 5, 100) + "%";
  document.getElementById("prog-bar-concluidas").style.width = Math.min(p.concluidas * 10, 100) + "%";
}

async function registrarProgresso(atividadeId, acertos, tentativas, concluida) {
  await api("POST", "/api/atividades/registrar_progresso", {
    crianca_id: 1, atividade_id: atividadeId, acertos, tentativas, concluida,
  });
}

// ══════════════════════════════════════════════════════════════════
// AUTENTICAÇÃO — PROFESSOR
// ══════════════════════════════════════════════════════════════════
function trocarTab(tab) {
  const entrar     = document.getElementById("painel-entrar");
  const registrar  = document.getElementById("painel-registrar");
  const tEntrar    = document.getElementById("tab-entrar");
  const tRegistrar = document.getElementById("tab-registrar");
  if (tab === "entrar") {
    entrar.hidden = false; registrar.hidden = true;
    tEntrar.setAttribute("aria-selected", "true");
    tRegistrar.setAttribute("aria-selected", "false");
  } else {
    entrar.hidden = true; registrar.hidden = false;
    tEntrar.setAttribute("aria-selected", "false");
    tRegistrar.setAttribute("aria-selected", "true");
  }
}

async function fazerLogin() {
  const email  = document.getElementById("login-email").value.trim();
  const senha  = document.getElementById("login-senha").value;
  const erroEl = document.getElementById("erro-login");
  erroEl.textContent = "";
  erroEl.classList.remove("visivel");

  if (!email || !senha) {
    erroEl.textContent = "Preencha e-mail e senha.";
    erroEl.classList.add("visivel");
    return;
  }
  const { ok, dados } = await api("POST", "/api/auth/login", { email, senha });
  if (ok) {
    estado.usuarioLogado = dados.usuario;
    atualizarNav();
    mostrarPainel(dados.usuario);
    toast(`Bem-vindo, ${dados.usuario.nome.split(" ")[0]}! 👋`);
  } else {
    erroEl.textContent = dados.erro || "E-mail ou senha incorretos.";
    erroEl.classList.add("visivel");
    anunciar(dados.erro || "Erro ao entrar.");
  }
}

async function fazerRegistro() {
  const nome   = document.getElementById("reg-nome").value.trim();
  const email  = document.getElementById("reg-email").value.trim();
  const senha  = document.getElementById("reg-senha").value;
  const role   = document.getElementById("reg-role").value;
  const ala    = document.getElementById("reg-ala").value;
  const erroEl = document.getElementById("erro-registro");
  const succEl = document.getElementById("sucesso-registro");
  erroEl.classList.remove("visivel");
  succEl.classList.remove("visivel");

  const { ok, dados } = await api("POST", "/api/auth/registrar", { nome, email, senha, role, ala });
  if (ok) {
    succEl.textContent = dados.mensagem;
    succEl.classList.add("visivel");
    anunciar(dados.mensagem);
    setTimeout(() => trocarTab("entrar"), 2000);
  } else {
    erroEl.textContent = dados.erro || "Erro ao criar conta.";
    erroEl.classList.add("visivel");
    anunciar(dados.erro || "Erro ao criar conta.");
  }
}

async function logout() {
  await api("POST", "/api/auth/logout");
  estado.usuarioLogado = null;
  atualizarNav();
  // Volta para tela de login se estiver na página de professor
  if (estado.paginaAtual === "professor") {
    document.getElementById("area-login").hidden  = false;
    document.getElementById("area-painel").hidden = true;
  }
  toast("Até logo! 👋");
  anunciar("Você saiu do sistema.");
  irPara("inicio");
}

// ══════════════════════════════════════════════════════════════════
// PAINEL DO PROFESSOR
// ══════════════════════════════════════════════════════════════════
function mostrarPainel(usuario) {
  document.getElementById("area-login").hidden  = true;
  document.getElementById("area-painel").hidden = false;
  document.getElementById("painel-bemvindo").textContent =
    `Olá, ${usuario.nome.split(" ")[0]}! 👋 (${usuario.role} — ${usuario.ala})`;
  carregarResumo();
  carregarCriancas();
}

async function carregarResumo() {
  const { ok, dados } = await api("GET", "/api/relatorios/resumo");
  if (!ok) return;
  document.getElementById("resumo-grade").innerHTML = `
    <div class="resumo-card">
      <div class="resumo-num" style="color:#1565C0">${dados.total_criancas}</div>
      <div class="resumo-label">Crianças ativas</div>
    </div>
    <div class="resumo-card">
      <div class="resumo-num" style="color:#2E7D32">${dados.atividades_feitas}</div>
      <div class="resumo-label">Atividades feitas</div>
    </div>
    <div class="resumo-card">
      <div class="resumo-num" style="color:#7B1FA2;font-size:1rem;padding-top:0.6rem">${dados.ala}</div>
      <div class="resumo-label">Sua ala</div>
    </div>
  `;
}

async function carregarCriancas() {
  const wrap = document.getElementById("tabela-wrap");
  wrap.innerHTML = `<div class="loading" style="display:flex"><div class="spinner"></div> Carregando…</div>`;
  const { ok, dados } = await api("GET", "/api/relatorios/criancas");
  if (!ok) { wrap.innerHTML = "<p style='color:#FF5252;padding:1rem 0'>Erro ao carregar crianças.</p>"; return; }
  if (!dados.criancas.length) {
    wrap.innerHTML = "<p style='color:#78909C;padding:1rem 0;font-weight:700'>Nenhuma criança cadastrada ainda. Clique em <strong>+ Nova criança</strong> para começar!</p>";
    return;
  }
  wrap.innerHTML = `
    <table class="tabela-criancas" aria-label="Lista de crianças cadastradas">
      <thead>
        <tr>
          <th scope="col">Nome fictício</th>
          <th scope="col">Idade</th>
          <th scope="col">Nível</th>
          <th scope="col">Ala</th>
          <th scope="col">Atividades</th>
        </tr>
      </thead>
      <tbody>
        ${dados.criancas.map(c => `
          <tr>
            <td><strong>${c.nome_ficticio}</strong></td>
            <td>${c.idade} anos</td>
            <td><span class="nivel-badge nivel-${c.nivel}">${c.nivel}</span></td>
            <td>${c.ala}</td>
            <td>${c.concluidas} feitas</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function abrirFormCrianca() {
  document.getElementById("form-crianca").hidden = false;
  document.getElementById("cri-nome").focus();
}
function fecharFormCrianca() {
  document.getElementById("form-crianca").hidden = true;
}

async function cadastrarCrianca() {
  const nome   = document.getElementById("cri-nome").value.trim();
  const idade  = parseInt(document.getElementById("cri-idade").value);
  const nivel  = document.getElementById("cri-nivel").value;
  const erroEl = document.getElementById("erro-crianca");
  const succEl = document.getElementById("sucesso-crianca");
  erroEl.classList.remove("visivel");
  succEl.classList.remove("visivel");

  const { ok, dados } = await api("POST", "/api/relatorios/criancas", { nome_ficticio: nome, idade, nivel });
  if (ok) {
    succEl.textContent = "Criança cadastrada com sucesso! 🎉";
    succEl.classList.add("visivel");
    anunciar("Criança cadastrada com sucesso.");
    document.getElementById("cri-nome").value  = "";
    document.getElementById("cri-idade").value = "";
    setTimeout(fecharFormCrianca, 1500);
    carregarCriancas();
    carregarResumo();
  } else {
    erroEl.textContent = dados.erro || "Erro ao cadastrar.";
    erroEl.classList.add("visivel");
    anunciar(dados.erro || "Erro ao cadastrar.");
  }
}

// ══════════════════════════════════════════════════════════════════
// ACESSO CRIANÇA
// ══════════════════════════════════════════════════════════════════
function trocarPerfil(perfil) {
  const painelCrianca   = document.getElementById("painel-crianca");
  const painelProf      = document.getElementById("painel-professor-login");
  const btnCrianca      = document.getElementById("perfil-crianca");
  const btnProf         = document.getElementById("perfil-professor");

  if (perfil === "crianca") {
    painelCrianca.hidden = false; painelProf.hidden = true;
    btnCrianca.classList.add("ativo");    btnProf.classList.remove("ativo");
    btnCrianca.setAttribute("aria-pressed", "true");
    btnProf.setAttribute("aria-pressed", "false");
  } else {
    painelCrianca.hidden = true; painelProf.hidden = false;
    btnCrianca.classList.remove("ativo"); btnProf.classList.add("ativo");
    btnCrianca.setAttribute("aria-pressed", "false");
    btnProf.setAttribute("aria-pressed", "true");
  }
}

function entrarComoCrianca() {
  const apelido = document.getElementById("crianca-apelido").value.trim();
  const ala     = document.getElementById("crianca-ala").value;
  const erroEl  = document.getElementById("erro-crianca-login");
  erroEl.textContent = "";
  erroEl.classList.remove("visivel");

  if (!apelido) {
    erroEl.textContent = "Digite seu apelido para continuar!";
    erroEl.classList.add("visivel");
    anunciar("Digite seu apelido para continuar.");
    return;
  }
  if (!ala) {
    erroEl.textContent = "Selecione sua ala!";
    erroEl.classList.add("visivel");
    anunciar("Selecione sua ala.");
    return;
  }

  estado.usuarioLogado = { nome: apelido, role: "crianca", ala };
  atualizarNav();
  toast(`Olá, ${apelido}! Vamos aprender! 🎉`);
  falar(`Olá, ${apelido}! Vamos aprender!`);
  anunciar(`Bem-vindo, ${apelido}!`);
  irPara("inicio");
}

// ══════════════════════════════════════════════════════════════════
// IA — GEMINI
// ══════════════════════════════════════════════════════════════════
async function verificarIA() {
  const { ok, dados } = await api("GET", "/api/ia/status");
  iaDisponivel = ok && dados.disponivel;
}

async function buscarElogio() {
  if (!iaDisponivel) { falar("Parabéns! Você arrasou!"); return; }
  const res = await apiIA("/api/ia/elogio");
  const msg = res.ok && res.dados.elogio ? res.dados.elogio : "Parabéns! Você é incrível! 🌟";
  toast("🌟 " + msg);
  falar(msg);
}

// ══════════════════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ══════════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", async () => {
  // Torna o nome do usuário clicável na nav
  document.getElementById("nav-nome-usuario").addEventListener("click", clicarNomeUsuario);
  document.getElementById("nav-nome-usuario").style.cursor = "pointer";

  // Verifica IA antes de tudo
  await verificarIA();
  estado._iaVerificada = true;

  // Navega para início
  irPara("inicio");

  // Verifica sessão ativa de professor
  const { ok, dados } = await api("GET", "/api/auth/me");
  if (ok && dados.autenticado) {
    estado.usuarioLogado = dados.usuario;
    atualizarNav();
  }
});