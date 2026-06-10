"use strict";

// ─── ESTADO GLOBAL ──────────────────────────────────────────────
const estado = {
  paginaAtual: "inicio",
  paginaAtual: "professor",
  usuarioLogado: null,
  jogo:      { palavras: [], indice: 0, nivel: "iniciante", resposta: [], dicaUsada: false },
  historias: { lista: [], indice: 0 },
  vogais:    null,
  silabas:   null,
  familiaAtual: 0,
  progresso: { estrelas: 0, acertos: 0, concluidas: 0 },
  criancas:  [],
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

// ─── NAVEGAÇÃO SPA ──────────────────────────────────────────────
function irPara(pagina) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("ativa"));
  document.querySelectorAll(".nav-menu a").forEach(a => a.removeAttribute("aria-current"));

  const el = document.getElementById("page-" + pagina);
  if (!el) return;
  el.classList.add("ativa");
  estado.paginaAtual = pagina;

  const navEl = document.getElementById("nav-" + pagina);
  if (navEl) navEl.setAttribute("aria-current", "page");

  const h = el.querySelector("h1,h2");
  if (h) { h.setAttribute("tabindex", "-1"); h.focus(); }

  if (pagina === "jogo"      && estado.jogo.palavras.length === 0) carregarJogo();
  if (pagina === "historias" && estado.historias.lista.length === 0) carregarHistorias();
  if (pagina === "vogais"    && !estado.vogais)  carregarVogais();
  if (pagina === "silabas"   && !estado.silabas) carregarSilabas();
  if (pagina === "professor") verificarAuth();
  if (pagina === "progresso") renderizarProgresso();

  return false;
}

// ─── API ─────────────────────────────────────────────────────────
async function api(metodo, rota, corpo = null) {
  const ops = { method: metodo, headers: { "Content-Type": "application/json" }, credentials: "include" };
  if (corpo) ops.body = JSON.stringify(corpo);
  const r = await fetch(rota, ops);
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, dados: json };
}

// ─── LOADING ─────────────────────────────────────────────────────
function mostrarLoading(pagina) {
  const l = document.getElementById(pagina + "-loading");
  const c = document.getElementById(pagina + "-conteudo");
  if (l) l.hidden = false;
  if (c) c.hidden = true;
}
function esconderLoading(pagina) {
  const l = document.getElementById(pagina + "-loading");
  const c = document.getElementById(pagina + "-conteudo");
  if (l) l.hidden = true;
  if (c) c.hidden = false;
}

// ══════════════════════════════════════════════════════════════════
// JOGO DE LETRAS
// ══════════════════════════════════════════════════════════════════
async function carregarJogo() {
  mostrarLoading("jogo");
  let lista = [];

  if (iaDisponivel) {
    try {
      const { ok, dados } = await api("GET", `/api/ia/palavras?nivel=${estado.jogo.nivel}&quantidade=6`);
      if (ok && dados.palavras && dados.palavras.length) lista = dados.palavras;
    } catch(e) {}
  }

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
  estado.jogo.dicaUsada = false;

  const emojiEl = document.getElementById("jogo-emoji");
  emojiEl.textContent = item.emoji;
  emojiEl.setAttribute("aria-label", item.dica);
  document.getElementById("jogo-dica-txt").textContent = "_ ".repeat(item.palavra.length).trim();

  const areaResp = document.getElementById("resposta-area");
  areaResp.innerHTML = "";
  for (let i = 0; i < item.palavra.length; i++) {
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.id = "slot-" + i;
    slot.setAttribute("aria-label", `Posição ${i + 1}: vazio`);
    areaResp.appendChild(slot);
  }

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

  esconderLoading("jogo");
  anunciar(`Palavra ${estado.jogo.indice + 1} de ${estado.jogo.palavras.length}. ${item.dica}`);
}

function embaralharLetras(palavra) {
  const extras = "ABCDEFGHIJKLMNOPRSTUVZ";
  const set = new Set([...palavra]);
  while (set.size < Math.min(palavra.length + 4, 12)) {
    set.add(extras[Math.floor(Math.random() * extras.length)]);
  }
  return [...set].sort(() => Math.random() - 0.5);
}

function clicarLetra(btn, letra) {
  const item = estado.jogo.palavras[estado.jogo.indice];
  const primeiroVazio = estado.jogo.resposta.findIndex(l => l === "");
  if (primeiroVazio === -1) return;

  estado.jogo.resposta[primeiroVazio] = letra;
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
  btn.disabled = true;
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
    try {
      const { ok, dados } = await api("GET", `/api/ia/dica?palavra=${item.palavra}&nivel=${estado.jogo.nivel}`);
      if (ok && dados.dica) dicaTexto = dados.dica;
    } catch(e) {}
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
  mostrarLoading("jogo");
  carregarJogo();
}

// ══════════════════════════════════════════════════════════════════
// HISTÓRIAS
// ══════════════════════════════════════════════════════════════════
async function carregarHistorias() {
  mostrarLoading("historias");

  if (iaDisponivel) {
    try {
      const { ok, dados } = await api("GET", "/api/ia/historia?nivel=iniciante&tema=animais");
      if (ok && dados.titulo) {
        estado.historias.lista  = [dados];
        estado.historias.indice = 0;
        mostrarHistoria();
        adicionarBotaoIA();
        return;
      }
    } catch(e) {}
  }

  const { ok, dados } = await api("GET", "/api/atividades/historias?nivel=iniciante");
  if (!ok || !dados.historias || !dados.historias.length) {
    toast("Erro ao carregar histórias.", "erro");
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
    `História ${estado.historias.indice + 1} de ${estado.historias.lista.length} · 2 minutos de leitura`;
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
    try {
      const { ok, dados } = await api("GET", `/api/ia/historia?nivel=iniciante&tema=${encodeURIComponent(tema)}`);
      if (ok && dados.titulo) {
        estado.historias.lista  = [dados];
        estado.historias.indice = 0;
        mostrarHistoria();
        return;
      }
    } catch(e) {}
    toast("Erro ao gerar história.", "erro");
    esconderLoading("historias");
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
// AUTENTICAÇÃO
// ══════════════════════════════════════════════════════════════════
async function verificarAuth() {
  const { ok, dados } = await api("GET", "/api/auth/me");
  if (ok && dados.autenticado) {
    estado.usuarioLogado = dados.usuario;
    mostrarPainel(dados.usuario);
  } else {
    estado.usuarioLogado = null;
    document.getElementById("area-login").hidden  = false;
    document.getElementById("area-painel").hidden = true;
    document.getElementById("nav-nome-usuario").hidden = true;
    document.getElementById("btn-logout").hidden       = true;
  }
}

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
    mostrarPainel(dados.usuario);
    irPara("inicio");
  } else {
    erroEl.textContent = dados.erro || "Erro ao entrar.";
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
  document.getElementById("area-login").hidden  = false;
  document.getElementById("area-painel").hidden = true;
  document.getElementById("nav-nome-usuario").hidden = true;
  document.getElementById("btn-logout").hidden       = true;
  toast("Sessão encerrada.");
  anunciar("Você saiu do sistema.");
}

// ══════════════════════════════════════════════════════════════════
// PAINEL DO PROFESSOR
// ══════════════════════════════════════════════════════════════════
async function mostrarPainel(usuario) {
  document.getElementById("area-login").hidden  = true;
  document.getElementById("area-painel").hidden = false;
  document.getElementById("nav-nome-usuario").hidden    = false;
  document.getElementById("nav-nome-usuario").textContent = "👋 " + usuario.nome.split(" ")[0];
  document.getElementById("btn-logout").hidden = false;
  document.getElementById("painel-bemvindo").textContent =
    `Olá, ${usuario.nome.split(" ")[0]}! (${usuario.role} — ${usuario.ala})`;
  carregarResumo();
  carregarCriancas();
}

async function carregarResumo() {
  const { ok, dados } = await api("GET", "/api/relatorios/resumo");
  if (!ok) return;
  document.getElementById("resumo-grade").innerHTML = `
    <div class="resumo-card">
      <div class="resumo-num" style="color:var(--azul)">${dados.total_criancas}</div>
      <div class="resumo-label">Crianças ativas</div>
    </div>
    <div class="resumo-card">
      <div class="resumo-num" style="color:var(--verde)">${dados.atividades_feitas}</div>
      <div class="resumo-label">Atividades feitas</div>
    </div>
    <div class="resumo-card">
      <div class="resumo-num" style="color:var(--roxo)">${dados.ala}</div>
      <div class="resumo-label">Sua ala</div>
    </div>
  `;
}

async function carregarCriancas() {
  const wrap = document.getElementById("tabela-wrap");
  const { ok, dados } = await api("GET", "/api/relatorios/criancas");
  if (!ok) { wrap.innerHTML = "<p style='color:var(--vermelho)'>Erro ao carregar crianças.</p>"; return; }
  if (!dados.criancas.length) {
    wrap.innerHTML = "<p style='color:var(--texto-cl);padding:1rem 0'>Nenhuma criança cadastrada ainda. Clique em <strong>+ Nova criança</strong> para começar!</p>";
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
    succEl.textContent = "Criança cadastrada com sucesso!";
    succEl.classList.add("visivel");
    anunciar("Criança cadastrada com sucesso.");
    document.getElementById("cri-nome").value  = "";
    document.getElementById("cri-idade").value = "";
    carregarCriancas();
    carregarResumo();
  } else {
    erroEl.textContent = dados.erro || "Erro ao cadastrar.";
    erroEl.classList.add("visivel");
    anunciar(dados.erro || "Erro ao cadastrar.");
  }
}

// ══════════════════════════════════════════════════════════════════
// IA — GEMINI
// ══════════════════════════════════════════════════════════════════
async function verificarIA() {
  try {
    const { ok, dados } = await api("GET", "/api/ia/status");
    iaDisponivel = ok && dados.disponivel;
  } catch(e) {
    iaDisponivel = false;
  }
}

async function buscarElogio() {
  if (!iaDisponivel) return;
  try {
    const { ok, dados } = await api("GET", "/api/ia/elogio");
    if (ok && dados.elogio) { toast("🌟 " + dados.elogio); falar(dados.elogio); }
  } catch(e) {}
}

// ── Estilo botão roxo IA
(function() {
  const s = document.createElement("style");
  s.textContent = `.btn-roxo{background:#6D28D9;color:white;border-color:#6D28D9;}.btn-roxo:hover{background:#5B21B6;}`;
  document.head.appendChild(s);
})();

// ══════════════════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ══════════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", async () => {
  await verificarIA();
  irPara("inicio");

  api("GET", "/api/auth/me").then(({ ok, dados }) => {
    if (ok && dados.autenticado) {
      estado.usuarioLogado = dados.usuario;
      document.getElementById("nav-nome-usuario").hidden      = false;
      document.getElementById("nav-nome-usuario").textContent = "👋 " + dados.usuario.nome.split(" ")[0];
      document.getElementById("btn-logout").hidden = false;
    }
  });
});
