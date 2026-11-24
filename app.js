/* English Journey — app de estudo diário (sem dependências). */
"use strict";

// ------------------------------------------------------------------ util
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const todayStr = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return todayStr(d); };
const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5);
const split = (s) => { const [en, pt] = s.split("|"); return { en, pt }; };
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const TODAY = todayStr();

// ------------------------------------------------------------------ estado
const KEY = "english-journey:v1";
const DEFAULT = {
  start: TODAY, done: {}, opened: {}, watched: {}, cards: {}, extra: {}, days: {}, journal: {}, quiz: {},
  settings: { newPerDay: 15, rate: 0.95, voice: "", theme: "auto", direction: "mix", tier: "auto" },
};
let S = load();
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) return { ...DEFAULT, ...s, settings: { ...DEFAULT.settings, ...s.settings } }; } catch (e) { /* sem storage */ }
  return structuredClone(DEFAULT);
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignora */ } renderStreak(); }
function day(d = TODAY) { return (S.days[d] ||= { tasks: {}, reviews: 0, newCards: 0, dict: 0, pron: 0 }); }
function markTask(k) { if (!day().tasks[k]) { day().tasks[k] = true; save(); } }

// ------------------------------------------------------------------ dados
const D = { cur: null, daily: null, videos: { videos: [] }, lessons: { lessons: {} }, channels: { channels: [] }, units: [] };
async function getJSON(p) { const r = await fetch(p + "?t=" + TODAY, { cache: "no-cache" }); if (!r.ok) throw new Error(p); return r.json(); }
async function boot() {
  const [cur, daily, videos, lessons, channels] = await Promise.allSettled(
    ["data/curriculum.json", "data/daily.json", "data/videos.json", "data/lesson_videos.json", "data/channels.json"].map(getJSON));
  if (cur.status !== "fulfilled") {
    $("#view").innerHTML = `<div class="card notice">Não foi possível carregar os dados. Abra o app pelo GitHub Pages ou rode <code>python3 -m http.server</code> na pasta do projeto.</div>`;
    return;
  }
  D.cur = cur.value;
  if (daily.status === "fulfilled") D.daily = daily.value;
  if (videos.status === "fulfilled") D.videos = videos.value;
  if (lessons.status === "fulfilled") D.lessons = lessons.value;
  if (channels.status === "fulfilled") D.channels = channels.value;
  D.cur.phases.forEach((p) => p.units.forEach((u, i) => D.units.push({ ...u, phase: p, idx: D.units.length, inPhase: i })));
  applyTheme();
  window.addEventListener("hashchange", route);
  route();
}

// ------------------------------------------------------------------ jornada helpers
const currentUnit = () => D.units.find((u) => !S.done[u.id]) || D.units[D.units.length - 1];
const unlocked = () => { const c = currentUnit().idx; return D.units.filter((u) => u.idx <= c || S.opened[u.id] || S.done[u.id]); };
const TIER_OF = { A0: "basic", A1: "basic", A2: "intermediate", B1: "intermediate", B2: "advanced", C1: "advanced" };
const TIER_NAME = { basic: "Básico (A0–A1)", intermediate: "Intermediário (A2–B1)", advanced: "Avançado (B2–C1)" };
const myTier = () => (S.settings.tier !== "auto" ? S.settings.tier : TIER_OF[currentUnit().phase.id]);
const LEVELS = ["A0", "A1", "A2", "B1", "B2", "C1"];

function streak() {
  const active = (d) => { const x = S.days[d]; return x && Object.values(x.tasks).filter(Boolean).length >= 3; };
  let d = active(TODAY) ? TODAY : addDays(TODAY, -1), n = 0;
  while (active(d)) { n++; d = addDays(d, -1); }
  return n;
}
function renderStreak() { const el = $("#streak"); if (el) el.textContent = "🔥 " + streak(); }

// ------------------------------------------------------------------ voz (TTS)
let voices = [];
function loadVoices() { voices = speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang)); }
if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function speak(text, rate) {
  if (!("speechSynthesis" in window)) return alert("Seu navegador não tem leitura em voz alta.");
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US"; u.rate = rate || S.settings.rate;
  const v = voices.find((v) => v.name === S.settings.voice) || voices.find((v) => /en-US/i.test(v.lang)) || voices[0];
  if (v) { u.voice = v; u.lang = v.lang; }
  speechSynthesis.speak(u);
}
const sayBtn = (t) => `<button class="say" data-say="${esc(t)}" title="Ouvir" aria-label="Ouvir">🔊</button>`;
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-say]"); if (b) { speak(b.dataset.say, b.dataset.rate ? +b.dataset.rate : undefined); return; }
  const t = e.target.closest(".thumb"); if (t) playVideo(t);
});

// ------------------------------------------------------------------ vídeos
function videoCard(v, extra = "") {
  const seen = S.watched[v.id] ? `<span class="pill ok">assistido</span>` : "";
  return `<div class="video" data-vid="${esc(v.id)}">
    <button class="thumb" data-id="${esc(v.id)}" style="background-image:url('https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg')" aria-label="Assistir ${esc(v.title)}"></button>
    <div class="meta"><div class="title">${esc(v.title)}</div>
    <div class="muted small">${esc(v.channel || "")}${v.duration ? " · " + esc(v.duration) : ""}${v.published ? " · " + esc(v.published) : ""}</div>
    <div class="row">${seen}${extra}<a class="small" href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener">abrir no YouTube ↗</a></div></div></div>`;
}
function playVideo(btn) {
  const id = btn.dataset.id;
  const f = document.createElement("iframe");
  f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&cc_load_policy=1&cc_lang_pref=en&rel=0`;
  f.allow = "autoplay; encrypted-media; picture-in-picture"; f.allowFullscreen = true; f.title = "YouTube";
  btn.replaceWith(f);
  S.watched[id] = TODAY;
  const isLesson = btn.closest("[data-lesson]");
  markTask(isLesson ? "unit" : "immersion");
  save();
}
const searchUrl = (q) => "https://www.youtube.com/results?search_query=" + encodeURIComponent(q);
function lessonVideos(u) {
  const store = (D.lessons.lessons || {})[u.id] || {};
  return u.videos.map(([label, q], i) => {
    const res = (store[q] || {}).results || [];
    return { label, q, res, key: u.id + ":" + i };
  });
}
function lessonBlock(lv) {
  const pick = S.settings["alt:" + lv.key] || 0;
  const v = lv.res[pick % Math.max(lv.res.length, 1)];
  if (!v) {
    return `<div class="video"><div class="meta"><div class="title">${esc(lv.label)}</div>
      <div class="muted small">O robô diário ainda vai escolher o melhor vídeo para este tema.</div>
      <a class="btn" href="${searchUrl(lv.q)}" target="_blank" rel="noopener">Ver no YouTube ↗</a></div></div>`;
  }
  const alt = lv.res.length > 1 ? `<button class="ghost small" data-alt="${esc(lv.key)}">outra opção ↻</button>` : "";
  return `<div data-lesson>${videoCard({ ...v, title: lv.label + " — " + v.title }, alt)}</div>`;
}
function bindAlt(rerender) {
  $$("[data-alt]").forEach((b) => b.onclick = () => { const k = "alt:" + b.dataset.alt; S.settings[k] = (S.settings[k] || 0) + 1; save(); rerender(); });
}

// ------------------------------------------------------------------ roteamento
const VIEWS = { hoje, jornada, videos, cards, pronuncia, ditado, escrita, recursos, config };
function route() {
  const h = location.hash.slice(1) || "hoje";
  const [tab, arg] = h.split("/");
  $$("#tabs a").forEach((a) => a.classList.toggle("on", a.dataset.tab === (tab === "unit" ? "jornada" : tab)));
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  const v = $("#view");
  if (tab === "unit") unitView(v, arg); else (VIEWS[tab] || hoje)(v, arg);
  renderStreak();
  window.scrollTo(0, 0);
}

// ================================================================== HOJE
const TASKS = [
  ["cards", "Revisar flashcards (10 min)", "#cards"],
  ["unit", "Estudar a unidade atual + assistir o vídeo (15 min)", null],
  ["daily", "Fazer a aula do dia abaixo (10 min)", null],
  ["pron", "Pronúncia: falar 5 frases (5 min)", "#pronuncia"],
  ["dict", "Ditado: 5 frases (5 min)", "#ditado"],
  ["write", "Escrever ou falar sobre o tema do dia (5–10 min)", "#escrita"],
  ["immersion", "Imersão: 1 vídeo novo do seu nível", "#videos"],
];
function hoje(v) {
  const u = currentUnit();
  const doneN = Object.keys(S.done).length;
  const dayN = Math.max(1, daysBetween(S.start, TODAY) + 1);
  const t = day().tasks;
  const nDone = TASKS.filter(([k]) => t[k]).length;
  const tier = myTier();
  const due = dueCards().length;
  const fresh = feed().slice(0, 3);
  v.innerHTML = `
  <div class="card"><div class="row between"><div><div class="muted small">Dia ${dayN} da sua jornada · ${esc(new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }))}</div>
    <h1>Unidade ${u.idx + 1}: ${esc(u.title)}</h1><div class="muted">${esc(u.phase.name)} (${esc(u.phase.cefr)}) · ${esc(u.en)}</div></div>
    <a class="btn primary" href="#unit/${u.id}">Abrir unidade →</a></div>
    <div style="margin-top:12px" class="progress" title="${doneN} de ${D.units.length} unidades"><i style="width:${(doneN / D.units.length) * 100}%"></i></div>
    <div class="muted small" style="margin-top:4px">${doneN} de ${D.units.length} unidades concluídas · ${due} flashcards para revisar hoje</div></div>

  <div class="card"><div class="row between"><h2>Rotina de hoje</h2><span class="pill ${nDone === TASKS.length ? "ok" : ""}">${nDone}/${TASKS.length}</span></div>
  <p class="muted small">Cerca de 1 hora. Sem tempo? Faça pelo menos as 3 primeiras: a constância vale mais que a quantidade. Muitas tarefas se marcam sozinhas quando você usa as ferramentas.</p>
  ${TASKS.map(([k, label, href]) => `<label class="check ${t[k] ? "done" : ""}"><input type="checkbox" data-task="${k}" ${t[k] ? "checked" : ""}><span>${esc(label)} ${href ? `<a href="${href}" class="small">ir →</a>` : k === "unit" ? `<a href="#unit/${u.id}" class="small">ir →</a>` : ""}</span></label>`).join("")}
  </div>

  <div id="daily"></div>

  ${fresh.length ? `<div class="card"><div class="row between"><h2>Vídeos novos para o seu nível</h2><a href="#videos/novos">ver todos →</a></div><div class="grid">${fresh.map((x) => videoCard(x)).join("")}</div></div>` : ""}`;
  $$("[data-task]", v).forEach((c) => c.onchange = () => { day().tasks[c.dataset.task] = c.checked; save(); hoje(v); });
  renderDaily($("#daily", v), D.daily, tier, true);
}

function renderDaily(el, data, tier, isToday) {
  if (!data || !data.levels) { el.innerHTML = `<div class="card muted">A aula do dia aparece aqui assim que o robô diário rodar.</div>`; return; }
  const L = data.levels[tier] || Object.values(data.levels)[0];
  const qid = "daily:" + data.date + ":" + tier;
  el.innerHTML = `<div class="card">
   <div class="row between"><h2>Aula do dia${L.theme ? ": " + esc(L.theme) : ""}</h2>
   <div class="row"><select id="tierSel" aria-label="Nível">${Object.keys(TIER_NAME).map((k) => `<option value="${k}" ${k === tier ? "selected" : ""}>${TIER_NAME[k]}</option>`).join("")}</select>
   <select id="archSel" aria-label="Dias anteriores"><option value="">${esc(data.date)}${isToday ? " (hoje)" : ""}</option></select></div></div>
   ${data.source === "bank" ? `<p class="muted small">Conteúdo de revisão montado do currículo. Configure a chave do Claude para receber uma aula inédita por dia (veja o README).</p>` : ""}

   <h3>Palavras do dia</h3>
   <ul class="clean list">${L.words.map((w) => `<li><div><span class="en">${esc(w.en)}</span> ${w.ipa ? `<span class="muted small">${esc(w.ipa)}</span>` : ""} — <span class="pt">${esc(w.pt)}</span>
     ${w.example ? `<div class="small">${esc(w.example)} <span class="muted">(${esc(w.example_pt)})</span></div>` : ""}</div>${sayBtn(w.en + (w.example ? ". " + w.example : ""))}</li>`).join("")}</ul>
   <div class="row" style="margin:8px 0 16px"><button id="addDaily">+ Adicionar ao meu baralho de flashcards</button></div>

   <div class="grid">
     <div><h3>Frase pronta</h3><p><span class="en">${esc(L.phrase.en)}</span> ${sayBtn(L.phrase.en)}<br><span class="pt">${esc(L.phrase.pt)}</span><br><span class="small muted">${esc(L.phrase.when)}</span></p></div>
     <div><h3>Expressão</h3><p><span class="en">${esc(L.idiom.en)}</span> ${sayBtn(L.idiom.en + ". " + L.idiom.example)}<br><span class="pt">${esc(L.idiom.pt)}</span><br><span class="small">${esc(L.idiom.example)}</span></p></div>
   </div>

   <h3>Dica de gramática: ${esc(L.grammar_tip.title)}</h3>
   <p>${esc(L.grammar_tip.explanation_pt)}</p>
   <ul>${L.grammar_tip.examples.map((x) => `<li>${esc(x)} ${sayBtn(x)}</li>`).join("")}</ul>

   ${L.story && L.story.text ? `<h3>Mini história: ${esc(L.story.title)}</h3>
   <p>${esc(L.story.text)}</p>
   <div class="row"><button data-say="${esc(L.story.text)}">🔊 Ouvir</button><button data-say="${esc(L.story.text)}" data-rate="0.7">🐢 Ouvir devagar</button></div>
   <details style="margin-top:8px"><summary>Ver tradução</summary><p class="muted">${esc(L.story.translation_pt)}</p></details>` : ""}

   <h3 style="margin-top:16px">Quiz</h3><div id="dq"></div>

   <div class="grid" style="margin-top:12px">
     <div><h3>Desafio de fala</h3><p>${esc(L.speaking_challenge)}</p></div>
     <div><h3>Escrita</h3><p>${esc(L.writing_prompt)}</p><a href="#escrita">Escrever agora →</a></div>
   </div>
   ${L.culture_fact ? `<p class="small muted"><strong>Curiosidade:</strong> ${esc(L.culture_fact)}</p>` : ""}
   ${isToday ? `<div class="row" style="margin-top:8px"><button class="ok" id="dailyDone">✓ Concluí a aula do dia</button></div>` : ""}
  </div>`;
  quizBlock($("#dq", el), L.quiz, qid);
  $("#tierSel", el).onchange = (e) => { S.settings.tier = e.target.value; save(); renderDaily(el, data, e.target.value, isToday); };
  $("#addDaily", el).onclick = (e) => {
    L.words.forEach((w) => { S.extra["d:" + w.en] = { en: w.en, pt: w.pt, ex: w.example }; });
    S.extra["d:" + L.idiom.en] = { en: L.idiom.en, pt: L.idiom.pt, ex: L.idiom.example };
    save(); e.target.textContent = "✓ Adicionado ao baralho"; e.target.disabled = true;
  };
  const dd = $("#dailyDone", el); if (dd) dd.onclick = () => { markTask("daily"); hoje($("#view")); };
  getJSON("data/archive/index.json").then((ix) => {
    const sel = $("#archSel", el); if (!sel) return;
    sel.innerHTML = `<option value="">Hoje</option>` + ix.dates.filter((d) => d !== TODAY).slice(0, 120).map((d) => `<option ${d === data.date && !isToday ? "selected" : ""}>${d}</option>`).join("");
    sel.onchange = async () => {
      if (!sel.value) return renderDaily(el, D.daily, myTier(), true);
      try { renderDaily(el, await getJSON(`data/archive/${sel.value}.json`), tier, false); } catch (e) { alert("Dia indisponível."); }
    };
  }).catch(() => {});
}

function quizBlock(el, qs, id) {
  if (!qs || !qs.length) { el.innerHTML = ""; return; }
  el.innerHTML = qs.map((q, i) => `<div class="card" style="padding:12px"><div><strong>${i + 1}.</strong> ${esc(q.q)}</div>
    ${q.o.map((o, j) => `<button class="quiz-opt" data-q="${i}" data-o="${j}">${esc(o)}</button>`).join("")}<div class="small muted" data-exp="${i}"></div></div>`).join("")
    + `<div class="muted small" id="qscore"></div>`;
  let right = 0, answered = 0;
  $$(".quiz-opt", el).forEach((b) => b.onclick = () => {
    const i = +b.dataset.q, q = qs[i];
    const group = $$(`.quiz-opt[data-q="${i}"]`, el);
    if (group.some((x) => x.disabled)) return;
    group.forEach((x) => { x.disabled = true; if (+x.dataset.o === q.a) x.classList.add("right"); });
    answered++;
    if (+b.dataset.o === q.a) right++; else b.classList.add("wrong");
    $(`[data-exp="${i}"]`, el).textContent = q.explain || "";
    if (answered === qs.length) { $("#qscore", el).textContent = `Resultado: ${right}/${qs.length}`; S.quiz[id] = right + "/" + qs.length; save(); }
  });
}

// ================================================================== JORNADA
function jornada(v) {
  const cur = currentUnit();
  v.innerHTML = `<h1>Sua jornada: do zero ao avançado</h1>
  <p class="muted">6 fases e ${D.units.length} unidades. Ritmo sugerido: 1 unidade por semana (6 dias de estudo + 1 de revisão). Já sabe um pouco? Vá em <a href="#config">Ajustes</a> e escolha por onde começar.</p>
  ${D.cur.phases.map((p) => {
    const us = D.units.filter((u) => u.phase.id === p.id);
    const d = us.filter((u) => S.done[u.id]).length;
    return `<div class="card"><div class="row between"><div><span class="pill">${esc(p.cefr)}</span> <strong>${esc(p.name)}</strong> <span class="muted small">· ${esc(p.weeks)}</span></div><span class="small muted">${d}/${us.length}</span></div>
    <p class="muted small">${esc(p.desc)}</p><div class="progress" style="margin-bottom:12px"><i style="width:${(d / us.length) * 100}%"></i></div>
    ${us.map((u) => `<a class="unit ${S.done[u.id] ? "done" : ""} ${u.id === cur.id ? "current" : ""}" href="#unit/${u.id}"><span class="n">${S.done[u.id] ? "✓" : u.idx + 1}</span><span><strong>${esc(u.title)}</strong><br><span class="muted small">${esc(u.en)}</span></span></a>`).join("")}</div>`;
  }).join("")}`;
}

function unitView(v, id) {
  const u = D.units.find((x) => x.id === id);
  if (!u) return jornada(v);
  if (!S.opened[u.id]) { S.opened[u.id] = TODAY; save(); }
  const prev = D.units[u.idx - 1], next = D.units[u.idx + 1];
  const render = () => {
    v.innerHTML = `<a href="#jornada" class="small">← Jornada</a>
    <div class="card"><span class="pill">${esc(u.phase.cefr)} · ${esc(u.phase.name)}</span>
      <h1 style="margin-top:8px">Unidade ${u.idx + 1}: ${esc(u.title)}</h1><div class="muted">${esc(u.en)}</div>
      <p><strong>Objetivo:</strong> ${esc(u.goals)}</p></div>

    <div class="card"><h2>1. Assista</h2><p class="muted small">Ative a legenda em inglês. Assista uma vez entendendo a ideia, depois de novo pausando e repetindo as frases (shadowing).</p>
      <div class="grid">${lessonVideos(u).map(lessonBlock).join("")}</div></div>

    <div class="card"><h2>2. Entenda</h2><ul>${u.grammar.map((g) => `<li>${esc(g)}</li>`).join("")}</ul></div>

    <div class="grid">
      <div class="card"><h2>3. Vocabulário</h2><ul class="clean list">${u.vocab.map(split).map((w) => `<li><span><span class="en">${esc(w.en)}</span> — <span class="pt">${esc(w.pt)}</span></span>${sayBtn(w.en)}</li>`).join("")}</ul></div>
      <div class="card"><h2>4. Frases</h2><ul class="clean list">${u.phrases.map(split).map((w) => `<li><span><span class="en">${esc(w.en)}</span><br><span class="pt small">${esc(w.pt)}</span></span>${sayBtn(w.en)}</li>`).join("")}</ul>
      <div class="row" style="margin-top:8px"><a class="btn" href="#pronuncia/${u.id}">🎙️ Treinar pronúncia</a><a class="btn" href="#ditado/${u.id}">✍️ Ditado</a></div></div>
    </div>

    <div class="card"><h2>5. Pratique</h2><ul>${u.tasks.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      <p class="small muted">As palavras e frases desta unidade já entraram no seu baralho de <a href="#cards">flashcards</a>.</p></div>

    <div class="card"><h2>6. Teste</h2><div id="uq"></div></div>

    <div class="row between">${prev ? `<a class="btn" href="#unit/${prev.id}">← ${esc(prev.title)}</a>` : "<span></span>"}
      <button class="${S.done[u.id] ? "" : "ok"}" id="doneBtn">${S.done[u.id] ? "Desmarcar conclusão" : "✓ Concluir unidade"}</button>
      ${next ? `<a class="btn" href="#unit/${next.id}">${esc(next.title)} →</a>` : "<span></span>"}</div>`;
    quizBlock($("#uq", v), u.quiz, "unit:" + u.id);
    bindAlt(render);
    $("#doneBtn", v).onclick = () => {
      if (S.done[u.id]) delete S.done[u.id]; else { S.done[u.id] = TODAY; markTask("unit"); }
      save(); if (S.done[u.id] && next) location.hash = "#unit/" + next.id; else render();
    };
  };
  render();
}

// ================================================================== VÍDEOS
function feed() {
  const lv = currentUnit().phase.id, i = LEVELS.indexOf(lv);
  const ok = new Set([LEVELS[i], LEVELS[i + 1], i > 0 ? LEVELS[i - 1] : "A0"]);
  return (D.videos.videos || []).filter((x) => x.levels.some((l) => ok.has(l)) && !S.watched[x.id]);
}
function videos(v, sub) {
  sub = sub || "sequencia";
  const tabs = `<div class="row" style="margin-bottom:12px"><a class="btn ${sub === "sequencia" ? "primary" : ""}" href="#videos/sequencia">Sequência da jornada</a><a class="btn ${sub === "novos" ? "primary" : ""}" href="#videos/novos">Novidades dos canais</a><a class="btn ${sub === "canais" ? "primary" : ""}" href="#videos/canais">Canais</a></div>`;
  if (sub === "sequencia") {
    const cur = currentUnit();
    const all = D.units.flatMap((u) => lessonVideos(u).map((lv) => ({ u, lv })));
    const seen = all.filter(({ lv }) => { const r = lv.res[(S.settings["alt:" + lv.key] || 0) % Math.max(lv.res.length, 1)]; return r && S.watched[r.id]; }).length;
    v.innerHTML = `<h1>Vídeos</h1>${tabs}
    <p class="muted">A sequência completa, na ordem certa: ${all.length} vídeos (${seen} assistidos). Os vídeos são escolhidos automaticamente pelo robô diário e trocados quando surgem opções melhores.${D.lessons.updated ? " Última atualização: " + esc(D.lessons.updated) + "." : ""}</p>
    ${D.units.map((u) => `<details class="card" ${u.id === cur.id ? "open" : ""}><summary>${S.done[u.id] ? "✓ " : ""}Unidade ${u.idx + 1}: ${esc(u.title)} <span class="muted small">(${esc(u.phase.cefr)})</span></summary>
      <div class="grid" style="margin-top:12px">${lessonVideos(u).map(lessonBlock).join("")}</div></details>`).join("")}`;
    bindAlt(() => videos(v, sub));
    return;
  }
  if (sub === "canais") {
    v.innerHTML = `<h1>Vídeos</h1>${tabs}<p class="muted">Canais curados por nível. Inscreva-se nos do seu nível e troque o algoritmo do seu YouTube para inglês.</p>
    <div class="grid">${D.channels.channels.map((c) => `<div class="card"><strong>${esc(c.name)}</strong><div class="muted small">${esc(c.focus)}</div>
      <div class="row" style="margin-top:8px">${c.levels.map((l) => `<span class="pill">${l}</span>`).join("")}<span class="pill warn">${c.lang === "pt" ? "em português" : "em inglês"}</span></div>
      <a class="small" href="https://www.youtube.com/@${esc(c.handle)}" target="_blank" rel="noopener">abrir canal ↗</a></div>`).join("")}</div>`;
    return;
  }
  const lv = S.settings.feedLevel || "meu";
  const lang = S.settings.feedLang || "all";
  let list = lv === "meu" ? feed() : (D.videos.videos || []).filter((x) => lv === "todos" || x.levels.includes(lv));
  if (lang !== "all") list = list.filter((x) => x.lang === lang);
  v.innerHTML = `<h1>Vídeos</h1>${tabs}
  <p class="muted">Os vídeos mais recentes dos canais curados, atualizados todo dia${D.videos.updated ? " (última: " + esc(D.videos.updated) + ")" : ""}. Novos aparecem primeiro.</p>
  <div class="row" style="margin-bottom:12px"><select id="fl" style="width:auto"><option value="meu">Meu nível</option><option value="todos">Todos os níveis</option>${LEVELS.map((l) => `<option>${l}</option>`).join("")}</select>
  <select id="fg" style="width:auto"><option value="all">Qualquer idioma</option><option value="pt">Explicado em português</option><option value="en">100% em inglês</option></select></div>
  ${list.length ? `<div class="grid">${list.slice(0, 60).map((x) => videoCard(x, x.firstSeen === TODAY ? `<span class="pill warn">novo hoje</span>` : "")).join("")}</div>` : `<div class="card muted">Nenhum vídeo ainda. Eles aparecem depois da primeira execução do robô diário.</div>`}`;
  $("#fl", v).value = lv; $("#fg", v).value = lang;
  $("#fl", v).onchange = (e) => { S.settings.feedLevel = e.target.value; save(); videos(v, sub); };
  $("#fg", v).onchange = (e) => { S.settings.feedLang = e.target.value; save(); videos(v, sub); };
}

// ================================================================== FLASHCARDS (repetição espaçada)
function deck() {
  const out = [];
  unlocked().forEach((u) => {
    u.vocab.forEach((s) => { const w = split(s); out.push({ id: "v:" + w.en, en: w.en, pt: w.pt, src: u.title }); });
    u.phrases.forEach((s) => { const w = split(s); out.push({ id: "p:" + w.en, en: w.en, pt: w.pt, src: u.title }); });
  });
  Object.entries(S.extra).forEach(([id, w]) => out.push({ id, en: w.en, pt: w.pt, ex: w.ex, src: "Aula do dia" }));
  return out;
}
function dueCards() {
  const all = deck();
  const due = all.filter((c) => S.cards[c.id] && S.cards[c.id].due <= TODAY);
  const left = Math.max(0, S.settings.newPerDay - day().newCards);
  const fresh = all.filter((c) => !S.cards[c.id]).slice(0, left);
  return [...shuffle(due), ...fresh];
}
function grade(c, g) {
  const isNew = !S.cards[c.id];
  const s = S.cards[c.id] || { ef: 2.5, int: 0, reps: 0, due: TODAY };
  if (g === 0) { s.reps = 0; s.int = 0; s.ef = Math.max(1.3, s.ef - 0.2); }
  else if (g === 1) { s.int = Math.max(1, Math.round(s.int * 1.2)); s.ef = Math.max(1.3, s.ef - 0.15); s.reps++; }
  else if (g === 2) { s.int = s.reps === 0 ? 1 : s.reps === 1 ? 3 : Math.round(s.int * s.ef); s.reps++; }
  else { s.int = s.reps === 0 ? 4 : Math.round(s.int * s.ef * 1.3); s.ef += 0.15; s.reps++; }
  s.due = addDays(TODAY, s.int);
  S.cards[c.id] = s;
  const d = day(); d.reviews++; if (isNew) d.newCards++;
  if (d.reviews >= 15) d.tasks.cards = true;
  save();
}
function cards(v) {
  let queue = dueCards(), flipped = false, done = 0;
  const total = deck().length, learned = Object.values(S.cards).filter((c) => c.int >= 21).length;
  const draw = () => {
    if (!queue.length) {
      v.innerHTML = `<h1>Flashcards</h1><div class="card"><h2>Tudo revisado por hoje! 🎉</h2><p class="muted">Você revisou ${done} cartões agora. Volte amanhã: a repetição espaçada mostra cada palavra no momento certo antes de você esquecer.</p>
      <div class="grid"><div class="stat"><div class="big">${total}</div><div class="muted small">cartões no baralho</div></div><div class="stat"><div class="big">${Object.keys(S.cards).length}</div><div class="muted small">já estudados</div></div><div class="stat"><div class="big">${learned}</div><div class="muted small">memorizados (21+ dias)</div></div></div>
      <div class="row" style="margin-top:12px"><button id="more">Estudar +10 cartões novos</button></div></div>`;
      $("#more", v).onclick = () => { S.settings.newPerDay += 10; save(); cards(v); S.settings.newPerDay -= 10; save(); };
      return;
    }
    const c = queue[0];
    const dir = S.settings.direction === "mix" ? (c.id.charCodeAt(2) + (S.cards[c.id]?.reps || 0)) % 2 ? "pt" : "en" : S.settings.direction;
    const front = dir === "en" ? c.en : c.pt, back = dir === "en" ? c.pt : c.en;
    v.innerHTML = `<h1>Flashcards</h1><div class="row between muted small"><span>${queue.length} para hoje · ${S.cards[c.id] ? "revisão" : "novo"}</span><span>${esc(c.src)}</span></div>
    <div class="card flash" id="fc"><div>${esc(front)}${flipped ? `<div class="back">${esc(back)}${c.ex ? `<div class="small">${esc(c.ex)}</div>` : ""}</div>` : ""}</div></div>
    <div class="row" style="justify-content:center">${sayBtn(c.en)}
    ${flipped ? `<button class="bad" data-g="0">Errei (1)</button><button data-g="1">Difícil (2)</button><button class="ok" data-g="2">Bom (3)</button><button class="primary" data-g="3">Fácil (4)</button>`
      : `<button class="primary" id="flip">Mostrar resposta (espaço)</button>`}</div>
    <p class="muted small" style="text-align:center">${dir === "pt" ? "Tente dizer em inglês em voz alta antes de virar." : "Leia em voz alta e lembre o significado."}</p>`;
    if (dir === "en" && !flipped) speak(c.en);
    const flip = () => { flipped = true; draw(); if (dir === "pt") speak(c.en); };
    $("#fc", v).onclick = () => { if (!flipped) flip(); };
    if (!flipped) $("#flip", v).onclick = flip;
    $$("[data-g]", v).forEach((b) => b.onclick = () => answer(+b.dataset.g));
  };
  const answer = (g) => { const c = queue.shift(); grade(c, g); done++; if (g === 0) queue.push(c); flipped = false; draw(); };
  document.onkeydown = (e) => {
    if (!location.hash.startsWith("#cards") || e.target.matches("input,textarea,select")) return;
    if (e.code === "Space") { e.preventDefault(); if (!flipped && queue.length) { flipped = true; draw(); } }
    else if (flipped && ["1", "2", "3", "4"].includes(e.key)) answer(+e.key - 1);
  };
  draw();
}

// ================================================================== comparação de frases
const norm = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
function compare(target, said) {
  const a = norm(target), b = norm(said);
  const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { out.push(["hit", a[i]]); i++; j++; }
    else if (j < b.length && (i >= a.length || L[i][j + 1] >= L[i + 1][j])) { out.push(["extra", b[j]]); j++; }
    else { out.push(["miss", a[i]]); i++; }
  }
  const score = a.length ? Math.round((out.filter((x) => x[0] === "hit").length / a.length) * 100) : 0;
  return { score, html: `<div class="diff">${out.map(([k, w]) => `<span class="${k}">${esc(w)}</span>`).join(" ")}</div>` };
}
function practiceSources(unitId) {
  const sets = [];
  const cur = currentUnit();
  const d = D.daily && D.daily.levels && D.daily.levels[myTier()];
  if (d) sets.push({ id: "daily", name: "Aula do dia", items: d.dictation });
  unlocked().slice().reverse().forEach((u) => sets.push({ id: u.id, name: `Unidade ${u.idx + 1}: ${u.title}`, items: u.phrases.map((p) => split(p).en) }));
  const pick = sets.find((s) => s.id === unitId) || sets.find((s) => s.id === cur.id) || sets[0];
  return { sets, pick };
}
function sourceSelect(sets, pick) {
  return `<select id="src" aria-label="Frases">${sets.map((s) => `<option value="${esc(s.id)}" ${s.id === pick.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>`;
}

// ================================================================== PRONÚNCIA
function pronuncia(v, unitId) {
  const { sets, pick } = practiceSources(unitId);
  let i = 0;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const draw = () => {
    const t = pick.items[i];
    v.innerHTML = `<h1>Pronúncia</h1>
    <p class="muted">Ouça, repita em voz alta e veja quais palavras o reconhecimento de voz entendeu. Verde = certo, vermelho = faltou ou saiu diferente, amarelo = palavra a mais.</p>
    <div class="row" style="margin-bottom:12px">${sourceSelect(sets, pick)}</div>
    <div class="card"><div class="muted small">Frase ${i + 1} de ${pick.items.length}</div><div class="flash" style="min-height:120px">${esc(t)}</div>
    <div class="row" style="justify-content:center"><button data-say="${esc(t)}">🔊 Ouvir</button><button data-say="${esc(t)}" data-rate="0.65">🐢 Devagar</button>
    ${SR ? `<button class="primary" id="rec">🎙️ Falar</button>` : `<button class="primary" id="rec2">🎙️ Gravar e comparar</button>`}</div>
    <div id="res" style="margin-top:12px;text-align:center"></div>
    <div class="row between" style="margin-top:12px"><button id="prev" ${i === 0 ? "disabled" : ""}>← Anterior</button><button id="next">Próxima →</button></div></div>
    ${SR ? "" : `<p class="notice small">Seu navegador não tem reconhecimento de voz (use Chrome, Edge ou Safari para a nota automática). Aqui você pode gravar e ouvir sua voz para comparar com o áudio.</p>`}
    <div class="card"><h3>Técnica de shadowing</h3><ol class="small"><li>Ouça a frase 2 vezes.</li><li>Repita junto com o áudio, copiando ritmo e entonação, não só as palavras.</li><li>Grave e compare. Exagere os sons difíceis (TH, R, vogais longas).</li><li>Faça o mesmo com 1 minuto de um vídeo da unidade.</li></ol></div>`;
    $("#src", v).onchange = (e) => { location.hash = "#pronuncia/" + e.target.value; };
    $("#prev", v).onclick = () => { i--; draw(); };
    $("#next", v).onclick = () => { i = (i + 1) % pick.items.length; draw(); };
    const res = $("#res", v);
    if (SR) $("#rec", v).onclick = (e) => {
      const r = new SR(); r.lang = "en-US"; r.interimResults = false; r.maxAlternatives = 3;
      e.target.textContent = "🎙️ Ouvindo…"; e.target.disabled = true;
      r.onresult = (ev) => {
        const alts = [...ev.results[0]].map((x) => x.transcript);
        const best = alts.map((a) => ({ a, ...compare(t, a) })).sort((x, y) => y.score - x.score)[0];
        res.innerHTML = `<div class="big" style="color:${best.score >= 85 ? "var(--ok)" : best.score >= 60 ? "var(--warn)" : "var(--bad)"}">${best.score}%</div>${best.html}<div class="muted small">Entendido: “${esc(best.a)}”</div>`;
        const d = day(); d.pron++; if (d.pron >= 5) d.tasks.pron = true; save();
      };
      r.onerror = (ev) => { res.innerHTML = `<div class="muted">Não consegui ouvir (${esc(ev.error)}). Verifique a permissão do microfone.</div>`; };
      r.onend = () => { e.target.textContent = "🎙️ Falar"; e.target.disabled = false; };
      r.start();
    };
    else $("#rec2", v).onclick = (e) => recordAndPlay(e.target, res);
  };
  draw();
}
async function recordAndPlay(btn, out) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream), chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); out.innerHTML = `<audio controls src="${URL.createObjectURL(new Blob(chunks))}"></audio>`; const d = day(); d.pron++; if (d.pron >= 5) d.tasks.pron = true; save(); btn.textContent = "🎙️ Gravar e comparar"; };
    rec.start(); btn.textContent = "⏹️ Parar"; btn.onclick = () => rec.stop();
  } catch (e) { out.textContent = "Sem acesso ao microfone."; }
}

// ================================================================== DITADO
function ditado(v, unitId) {
  const { sets, pick } = practiceSources(unitId);
  let i = 0, hits = 0;
  const items = shuffle(pick.items);
  const draw = () => {
    const t = items[i];
    v.innerHTML = `<h1>Ditado</h1><p class="muted">Ouça e escreva exatamente o que ouviu. Treina o ouvido e a escrita ao mesmo tempo.</p>
    <div class="row" style="margin-bottom:12px">${sourceSelect(sets, pick)}</div>
    <div class="card"><div class="muted small">Frase ${i + 1} de ${items.length} · acertos ${hits}</div>
    <div class="row" style="justify-content:center;margin:16px 0"><button class="primary" data-say="${esc(t)}">🔊 Ouvir</button><button data-say="${esc(t)}" data-rate="0.6">🐢 Devagar</button></div>
    <input type="text" id="ans" placeholder="Digite o que ouviu…" autocomplete="off" autocapitalize="off" spellcheck="false">
    <div class="row" style="margin-top:8px"><button class="ok" id="chk">Conferir (Enter)</button><button id="skip">Pular</button></div>
    <div id="res" style="margin-top:12px"></div></div>`;
    $("#src", v).onchange = (e) => { location.hash = "#ditado/" + e.target.value; };
    setTimeout(() => speak(t), 300);
    const ans = $("#ans", v); ans.focus();
    const next = () => { i = (i + 1) % items.length; draw(); };
    const check = () => {
      const r = compare(t, ans.value);
      if (r.score === 100) hits++;
      $("#res", v).innerHTML = `${r.html}<p><strong>Resposta:</strong> ${esc(t)}</p><button class="primary" id="nx">Próxima →</button>`;
      $("#nx", v).onclick = next; $("#nx", v).focus();
      const d = day(); d.dict++; if (d.dict >= 5) d.tasks.dict = true; save();
    };
    $("#chk", v).onclick = check; $("#skip", v).onclick = next;
    ans.onkeydown = (e) => { if (e.key === "Enter") check(); };
  };
  draw();
}

// ================================================================== ESCRITA
function escrita(v) {
  const L = D.daily && D.daily.levels && D.daily.levels[myTier()];
  const txt = S.journal[TODAY] || "";
  const words = (s) => (s.trim().match(/\S+/g) || []).length;
  v.innerHTML = `<h1>Diário de escrita</h1>
  <div class="card"><h3>Tema de hoje</h3><p>${esc(L ? L.writing_prompt : "Escreva sobre o seu dia: o que fez, o que comeu, como se sente.")}</p>
  ${L ? `<p class="small muted"><strong>Desafio de fala:</strong> ${esc(L.speaking_challenge)}</p>` : ""}
  <textarea id="jt" placeholder="Write here in English… Não tenha medo de errar.">${esc(txt)}</textarea>
  <div class="row between" style="margin-top:8px"><span class="muted small" id="wc">${words(txt)} palavras · salvo automaticamente</span>
  <button id="cp">📋 Copiar para corrigir com IA</button></div>
  <p class="small muted">Cole no <a href="https://claude.ai" target="_blank" rel="noopener">Claude</a> (ou outra IA) para receber correção explicada. Depois reescreva a versão corrigida: é aí que se aprende.</p></div>
  <div class="card"><h3>Entradas anteriores</h3>${Object.keys(S.journal).filter((d) => d !== TODAY && S.journal[d].trim()).sort().reverse().map((d) => `<details><summary>${d} · ${words(S.journal[d])} palavras</summary><p style="white-space:pre-wrap">${esc(S.journal[d])}</p></details>`).join("") || `<p class="muted small">Nenhuma ainda.</p>`}</div>`;
  const jt = $("#jt", v);
  jt.oninput = () => { S.journal[TODAY] = jt.value; if (words(jt.value) >= 30) day().tasks.write = true; save(); $("#wc", v).textContent = words(jt.value) + " palavras · salvo automaticamente"; };
  $("#cp", v).onclick = () => copy(`Sou brasileiro e estou aprendendo inglês (nível ${currentUnit().phase.cefr}). Corrija o texto abaixo. Para cada erro, mostre a correção e explique em português de forma simples. No final, mostre o texto inteiro corrigido e uma versão mais natural, como um nativo escreveria.\n\nTexto:\n${jt.value}`);
}
function copy(t) { navigator.clipboard?.writeText(t).then(() => alert("Copiado! Cole na IA."), () => prompt("Copie:", t)); }

// ================================================================== RECURSOS
const RES = [
  ["Dicionários e pronúncia", [
    ["Cambridge Dictionary", "https://dictionary.cambridge.org/pt/dicionario/ingles-portugues/", "Dicionário com áudio US/UK e tradução para português."],
    ["YouGlish", "https://youglish.com/english", "Ouça qualquer palavra sendo dita por nativos em vídeos reais."],
    ["Reverso Context", "https://context.reverso.net/traducao/ingles-portugues/", "Veja palavras e expressões em frases reais traduzidas."],
    ["Forvo", "https://forvo.com/languages/en/", "Pronúncia gravada por nativos de vários países."],
  ]],
  ["Conversação", [
    ["Claude", "https://claude.ai", "Parceiro de conversa 24h: use os prompts abaixo."],
    ["Tandem", "https://www.tandem.net/", "Troca de idiomas com nativos (grátis)."],
    ["HelloTalk", "https://www.hellotalk.com/", "Converse por texto e áudio com nativos que aprendem português."],
    ["Preply / Cambly", "https://preply.com/", "Aulas com professores particulares (pago), ótimo a partir do A2."],
  ]],
  ["Imersão (ouvir e ler)", [
    ["Language Reactor", "https://www.languagereactor.com/", "Extensão do Chrome: legenda dupla no YouTube e Netflix."],
    ["BBC 6 Minute English", "https://www.bbc.co.uk/learningenglish/english/features/6-minute-english", "Podcast curto com transcrição (A2–B2)."],
    ["News in Levels", "https://www.newsinlevels.com/", "Notícias em 3 níveis de dificuldade, com áudio."],
    ["Breaking News English", "https://breakingnewsenglish.com/", "Notícias graduadas com exercícios."],
    ["LingQ", "https://www.lingq.com/", "Aprenda lendo e ouvindo conteúdo de verdade."],
  ]],
  ["Gramática, escrita e testes", [
    ["British Council LearnEnglish", "https://learnenglish.britishcouncil.org/", "Gramática e exercícios gratuitos por nível."],
    ["Write & Improve (Cambridge)", "https://writeandimprove.com/", "Correção automática de textos com nota CEFR."],
    ["LanguageTool", "https://languagetool.org/", "Corretor de inglês gratuito para o navegador."],
    ["EF SET", "https://www.efset.org/", "Teste de nível gratuito: faça a cada 3 meses para medir sua evolução."],
  ]],
  ["Apps complementares", [
    ["Anki", "https://apps.ankiweb.net/", "Flashcards avançados (se quiser além dos flashcards do app)."],
    ["Duolingo", "https://www.duolingo.com/", "Bom para manter o hábito nos dias corridos, não como método principal."],
    ["ELSA Speak", "https://elsaspeak.com/", "Correção de pronúncia com IA."],
  ]],
];
function aiPrompts() {
  const lvl = currentUnit().phase.cefr, u = currentUnit();
  return [
    ["Parceiro de conversa", `You are my friendly English conversation partner. My level is ${lvl} (CEFR). Talk with me about everyday topics, one question at a time. Use simple English adapted to my level. After each of my answers, first reply naturally, then add a short "Correction:" section showing my mistakes and a more natural way to say it. Explain corrections in Portuguese. Let's start!`],
    ["Treinar a unidade atual", `I'm studying "${u.en}" (${lvl}). Create a short conversation practice where I must use this topic. Ask me questions one at a time, correct my mistakes in Portuguese, and give me a score at the end.`],
    ["Roleplay de situação", `Let's do a roleplay. You are a waiter in a restaurant in New York and I am a customer. My English level is ${lvl}. Stay in character, keep sentences short, and at the end give me feedback in Portuguese with 3 things I can improve. (Troque a situação: aeroporto, hotel, entrevista de emprego, médico…)`],
    ["Explicador de gramática", `Explique em português, de forma simples e com muitos exemplos, o seguinte ponto de gramática do inglês: [DIGITE AQUI]. Depois me dê 5 exercícios e corrija minhas respostas.`],
    ["Debate (B1+)", `Let's have a friendly debate. Choose a controversial but light topic and take the opposite side of my opinion. My level is ${lvl}. Push me to justify my ideas using linking words (however, although, therefore). Correct my main mistakes at the end.`],
  ];
}
function recursos(v) {
  v.innerHTML = `<h1>Recursos e ferramentas</h1>
  <div class="card"><h2>Prompts prontos para praticar com IA</h2><p class="muted small">Copie e cole no Claude ou em outra IA. Use o modo de voz do app para treinar a fala. Os prompts já usam o seu nível atual.</p>
  ${aiPrompts().map(([n, p], i) => `<details><summary>${esc(n)}</summary><p class="small" style="white-space:pre-wrap">${esc(p)}</p><button data-cp="${i}">📋 Copiar</button></details>`).join("")}</div>
  ${RES.map(([cat, items]) => `<div class="card"><h2>${esc(cat)}</h2><ul class="clean list">${items.map(([n, u, d]) => `<li><span><a href="${u}" target="_blank" rel="noopener"><strong>${esc(n)}</strong></a><br><span class="muted small">${esc(d)}</span></span></li>`).join("")}</ul></div>`).join("")}
  <div class="card"><h2>Hábitos de imersão</h2><ul>
   <li>Troque o idioma do celular, das redes sociais e dos jogos para inglês (a partir do A2).</li>
   <li>Séries: comece com legenda em português, passe para legenda em inglês (B1) e depois sem legenda (B2+).</li>
   <li>Narre mentalmente o que está fazendo, em inglês, no trânsito e no banho.</li>
   <li>Siga criadores de conteúdo em inglês sobre assuntos de que você já gosta.</li>
   <li>Faça o teste EF SET a cada 3 meses para ver o quanto evoluiu.</li></ul></div>`;
  const ps = aiPrompts();
  $$("[data-cp]", v).forEach((b) => b.onclick = () => copy(ps[+b.dataset.cp][1]));
}

// ================================================================== AJUSTES
function applyTheme() { const t = S.settings.theme; if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.dataset.theme = t; }
function config(v) {
  const st = S.settings;
  v.innerHTML = `<h1>Ajustes</h1>
  <div class="card"><h2>Por onde começar</h2><p class="muted small">Se você não é iniciante absoluto, marque as unidades anteriores como concluídas. Dica: faça o teste gratuito do <a href="https://www.efset.org/" target="_blank" rel="noopener">EF SET</a> para saber seu nível.</p>
   <div class="row"><select id="startU" style="width:auto">${D.units.map((u) => `<option value="${u.idx}" ${u.id === currentUnit().id ? "selected" : ""}>${u.idx + 1}. ${esc(u.title)} (${u.phase.cefr})</option>`).join("")}</select><button id="setStart">Começar daqui</button></div></div>
  <div class="card"><h2>Estudo</h2>
   <label>Data de início da jornada<input type="date" id="start" value="${esc(S.start)}"></label>
   <label style="display:block;margin-top:8px">Cartões novos por dia<select id="npd">${[5, 10, 15, 20, 30].map((n) => `<option ${n === st.newPerDay ? "selected" : ""}>${n}</option>`).join("")}</select></label>
   <label style="display:block;margin-top:8px">Direção dos flashcards<select id="dir"><option value="mix">Misturado</option><option value="en">Inglês → Português</option><option value="pt">Português → Inglês</option></select></label>
   <label style="display:block;margin-top:8px">Nível da aula do dia<select id="tier"><option value="auto">Automático (segue a jornada)</option>${Object.entries(TIER_NAME).map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select></label></div>
  <div class="card"><h2>Voz e aparência</h2>
   <label>Voz em inglês<select id="voice"><option value="">Padrão</option>${voices.map((x) => `<option ${x.name === st.voice ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
   <label style="display:block;margin-top:8px">Velocidade da fala: <span id="rv">${st.rate}</span><input type="range" id="rate" min="0.5" max="1.3" step="0.05" value="${st.rate}" style="width:100%"></label>
   <div class="row"><button data-say="Hello! This is how I sound. Nice to meet you.">🔊 Testar voz</button></div>
   <label style="display:block;margin-top:8px">Tema<select id="theme"><option value="auto">Automático</option><option value="light">Claro</option><option value="dark">Escuro</option></select></label></div>
  <div class="card"><h2>Backup do progresso</h2><p class="muted small">Seu progresso fica neste navegador. Exporte para não perder ou para continuar em outro aparelho.</p>
   <div class="row"><button id="exp">⬇️ Exportar</button><label class="btn">⬆️ Importar<input type="file" id="imp" accept="application/json" hidden></label><button class="bad" id="reset">Apagar tudo</button></div></div>`;
  $("#dir", v).value = st.direction; $("#tier", v).value = st.tier; $("#theme", v).value = st.theme;
  $("#setStart", v).onclick = () => {
    const n = +$("#startU", v).value; S.done = {};
    D.units.forEach((u) => { if (u.idx < n) S.done[u.id] = TODAY; });
    save(); location.hash = "#unit/" + D.units[n].id;
  };
  $("#start", v).onchange = (e) => { S.start = e.target.value || TODAY; save(); };
  $("#npd", v).onchange = (e) => { st.newPerDay = +e.target.value; save(); };
  $("#dir", v).onchange = (e) => { st.direction = e.target.value; save(); };
  $("#tier", v).onchange = (e) => { st.tier = e.target.value; save(); };
  $("#voice", v).onchange = (e) => { st.voice = e.target.value; save(); };
  $("#rate", v).oninput = (e) => { st.rate = +e.target.value; $("#rv", v).textContent = st.rate; save(); };
  $("#theme", v).onchange = (e) => { st.theme = e.target.value; save(); applyTheme(); };
  $("#exp", v).onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: "application/json" })); a.download = `english-journey-${TODAY}.json`; a.click(); };
  $("#imp", v).onchange = async (e) => { try { S = { ...DEFAULT, ...JSON.parse(await e.target.files[0].text()) }; save(); alert("Progresso importado!"); route(); } catch (err) { alert("Arquivo inválido."); } };
  $("#reset", v).onclick = () => { if (confirm("Apagar todo o progresso? Isso não pode ser desfeito.")) { S = structuredClone(DEFAULT); save(); route(); } };
}

boot();
