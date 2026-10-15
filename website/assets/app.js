/* Espace Etudiant ES — single-file SPA over generated DB */
(function(){
"use strict";
const view = document.getElementById("view");
const crumbs = document.getElementById("crumbs");

/* ---------- theme ---------- */
const root = document.documentElement;
root.dataset.theme = localStorage.getItem("es-theme") ||
  (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
document.getElementById("themeBtn").onclick = () => {
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("es-theme", root.dataset.theme);
};
document.addEventListener("keydown", e => {
  if (e.key === "/") {
    const q = document.getElementById("q");
    if (q) { e.preventDefault(); q.focus(); }
  }
});

/* ---------- done / travail finis (localStorage) ---------- */
const DONE_KEY = "es-done-v1";
let DONE = {};
try { DONE = JSON.parse(localStorage.getItem(DONE_KEY) || "{}"); }
catch(e){ DONE = {}; }
const saveDone = () => {
  try { localStorage.setItem(DONE_KEY, JSON.stringify(DONE)); } catch(e){}
  updateDoneCount();
};
const isDone = u => !!DONE[u];
function updateDoneCount(){
  const el = document.getElementById("doneCount");
  if (el) el.textContent = Object.keys(DONE).length;
}
function initials(name){
  const w = name.replace(/[_-]+/g, " ").split(/\s+/).filter(Boolean);
  return ((w[0] || "?")[0] + ((w[1] || "")[0] || "")).toUpperCase();
}
function trackable(cat){ return /^(tds|tps)$/i.test(cat || ""); }
function trackStats(mod){
  let total = 0, done = 0;
  mod.cats.forEach(c => {
    if (!trackable(c.name)) return;
    c.files.forEach(f => { total++; if (isDone(f.u)) done++; });
  });
  return {total, done};
}

/* ---------- helpers ---------- */
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const disp = s => esc(String(s).replace(/_/g, " "));
function fmtSize(b){
  if (b >= 1e9) return (b/1e9).toFixed(2)+" Go";
  if (b >= 1e6) return (b/1e6).toFixed(1)+" Mo";
  if (b >= 1e3) return Math.round(b/1e3)+" Ko";
  return b+" o";
}
function iconOf(name){
  const e = name.split(".").pop().toLowerCase();
  if (e === "pdf") return "📕";
  if (["ppt","pptx"].includes(e)) return "📊";
  if (["jpg","jpeg","png"].includes(e)) return "🖼️";
  if (e === "zip") return "🗜️";
  return "📄";
}
function badgeCls(cat){
  const c = cat.toLowerCase();
  if (c === "cours") return "cours";
  if (c === "tds") return "tds";
  if (c === "tps") return "tps";
  return "other";
}
function modByPath(path){
  const [sid, ...rest] = path.split("/");
  const sem = DB.semesters.find(s => s.id === sid);
  if (!sem) return null;
  const mod = sem.modules.find(m => m.name === rest.join("/") || m.path === path);
  return mod ? {sem, mod} : null;
}
function countMod(mod){
  return mod.cats.reduce((a,c) => a + c.files.length, 0);
}
document.getElementById("statFoot").textContent =
  DB.semesters.reduce((a,s) => a + s.modules.length, 0) + " modules · " +
  DB.semesters.reduce((a,s) => a + s.modules.reduce((x,m) => x + countMod(m), 0), 0) + " fichiers";

/* ---------- search index ---------- */
const INDEX = [];
DB.semesters.forEach(sem => sem.modules.forEach(mod =>
  mod.cats.forEach(cat => cat.files.forEach(f =>
    INDEX.push({sem: sem.id, mod: mod.name, path: mod.path,
      cat: cat.name, n: f.n, s: f.s, u: f.u})))));
function treeFiles(node, base){
  (node.files || []).forEach(f =>
    INDEX.push({sem: "EDT", mod: base + node.name, path: "", cat: "", n: f.n, s: f.s, u: f.u}));
  (node.dirs || []).forEach(d => treeFiles(d, base + node.name + " / "));
}
if (DB.edt) treeFiles(DB.edt, "");

/* ---------- views ---------- */
function fileRow(f, cat){
  const doneBtn = trackable(cat) ?
    `<button class="done-btn${isDone(f.u) ? " done" : ""}" data-u="${esc(f.u)}">` +
    `${isDone(f.u) ? "✓ Fini" : "✓ J'ai fini"}</button>` : ``;
  return `<div class="file${isDone(f.u) ? " done-row" : ""}">` +
    `<span class="icon">${iconOf(f.n)}</span>` +
    `<span class="name" title="${esc(f.n)}">${esc(f.n)}</span>` +
    `<span class="size">${fmtSize(f.s)}</span>${doneBtn}` +
    `<a class="btn" href="${f.u}" target="_blank" rel="noopener">Ouvrir</a></div>`;
}
function home(){
  crumbs.innerHTML = `Accueil`;
  const nMods = DB.semesters.reduce((a,s) => a + s.modules.length, 0);
  view.innerHTML =
    `<div class="hero"><h1>Électronique &amp; Systèmes</h1>` +
    `<p>Cours, TDs, TPs et emplois du temps — Filière Physique, FSA Agadir.</p>` +
    `<div class="stats">` +
    `<div class="stat"><b>${DB.semesters.length}</b><span>semestres</span></div>` +
    `<div class="stat"><b>${nMods}</b><span>modules</span></div>` +
    `<div class="stat"><b>${INDEX.length}</b><span>fichiers</span></div>` +
    `</div></div>` +
    `<h2 class="section-title">Rechercher</h2>` +
    `<div class="cat"><div style="padding:18px"><input id="q" type="search" ` +
    `placeholder="Nom d'un fichier, TD, TP…" autocomplete="off">` +
    `<div id="qres" style="margin-top:6px"></div></div></div>` +
    `<h2 class="section-title">Semestres</h2><div class="grid">` +
    DB.semesters.map(s => {
      const n = s.modules.reduce((a,m) => a + countMod(m), 0);
      return `<a class="card" href="#/s/${s.id}"><h3>${esc(s.name)}</h3>` +
        `<p>${s.modules.length} modules</p><span class="count">${n} fichiers</span></a>`;
    }).join("") + `</div>` +
    `<h2 class="section-title">Emploi du temps &amp; Assistant</h2><div class="grid">` +
    `<a class="card" href="#/ai"><h3>🤖 Assistant IA</h3>` +
    `<p>Pose tes questions — il cherche dans tes PDFs et t'explique</p></a>` +
    `<a class="card" href="#/edt"><h3>🗓️ Emplois du temps des TPs</h3>` +
    `<p>Par groupe — S5 Electronique &amp; Énergétique</p></a></div>`;
  const qi = document.getElementById("q");
  const qr = document.getElementById("qres");
  let deb2 = null;
  qi.addEventListener("input", () => {
    clearTimeout(deb2);
    deb2 = setTimeout(() => { qr.innerHTML = searchHtml(qi.value); }, 250);
  });
}
function semester(sid){
  const sem = DB.semesters.find(s => s.id === sid);
  if (!sem) return home();
  crumbs.innerHTML = `<a href="#/">Accueil</a> / ${esc(sem.name)}`;
  const shown = sem.modules.filter(m => countMod(m) > 0);
  view.innerHTML = `<h2 class="section-title">${esc(sem.name)}</h2><div class="grid">` +
    shown.map(m => {
      const n = countMod(m);
      const t = trackStats(m);
      const pct = t.total ? Math.round(100 * t.done / t.total) : 0;
      return `<a class="card" href="#/m/${sem.id}/${encodeURIComponent(m.name)}">` +
        `<span class="mcard-top"><span class="mcard-init">${esc(initials(m.name))}</span>` +
        `<span class="mcard-name">${disp(m.name)}</span></span>` +
        `<p>${m.cats.length} rubrique${m.cats.length > 1 ? "s" : ""}</p>` +
        `<span class="count">${n} fichier${n > 1 ? "s" : ""}</span>` +
        (t.total ? `<span class="progress"><i style="width:${pct}%"></i></span>` +
          `<span class="prog-label">✓ ${t.done}/${t.total} TD/TP terminés</span>` : ``) +
        `</a>`;
    }).join("") + `</div>`;
}
function module(sid, mname){
  const found = modByPath(sid + "/" + decodeURIComponent(mname));
  if (!found) return home();
  const {sem, mod} = found;
  crumbs.innerHTML =
    `<a href="#/">Accueil</a> / <a href="#/s/${sem.id}">${esc(sem.name)}</a> / ${disp(mod.name)}`;
  view.innerHTML = `<h2 class="section-title">${disp(mod.name)}</h2>` +
    (() => {
      const t = trackStats(mod);
      const pct = t.total ? Math.round(100 * t.done / t.total) : 0;
      return t.total ?
        `<div class="cat"><div class="cat-head">✓ Progression TD/TP — ${t.done}/${t.total}` +
        `</div><div style="padding:14px 18px"><span class="progress" style="margin:0">` +
        `<i style="width:${pct}%"></i></span></div></div>` : ``;
    })() +
    mod.cats.map(c =>
      `<div class="cat"><div class="cat-head">` +
      `<span class="badge ${badgeCls(c.name)}">${disp(c.name)}</span>` +
      `<span>${c.files.length} fichier${c.files.length > 1 ? "s" : ""}</span></div>` +
      (c.files.length ? c.files.map(f => fileRow(f, c.name)).join("") :
        `<div class="empty">Aucun fichier pour le moment.</div>`) +
      `</div>`).join("");
}
function edt(){
  crumbs.innerHTML = `<a href="#/">Accueil</a> / Emploi du temps`;
  const walk = node =>
    `<div class="cat"><div class="cat-head">🗓️ ${esc(node.name)}</div>` +
    (node.files || []).map(f => fileRow(f, "")).join("") +
    (node.dirs || []).map(walk).join("") + `</div>`;
  view.innerHTML = `<h2 class="section-title">Emplois du temps des TPs</h2>` +
    (DB.edt ? walk(DB.edt) : `<div class="empty">Aucun emploi du temps.</div>`);
}
function searchHtml(q){
  q = q.trim().toLowerCase();
  const norm = s => s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const res = q ? INDEX.filter(f => norm(f.n).includes(norm(q))).slice(0, 200) : [];
  if (!q) return `<div class="empty">Tapez le nom d'un fichier, TD ou TP.</div>`;
  return `<p><strong>${res.length}</strong> résultat${res.length > 1 ? "s" : ""}</p>` +
    (res.length ? res.map(f =>
      `<div class="result"><a href="${f.u}" target="_blank" rel="noopener">${esc(f.n)}</a><br>` +
      `<small>${esc(f.sem)}${f.mod ? " / " + disp(f.mod) : ""}${f.cat ? " / " + disp(f.cat) : ""} · ${fmtSize(f.s)}</small></div>`
    ).join("") : `<div class="empty">Aucun résultat.</div>`);
}
function search(q){
  crumbs.innerHTML = `<a href="#/">Accueil</a> / Recherche`;
  view.innerHTML = `<h2 class="section-title">Recherche</h2>` + searchHtml(q);
}

function doneView(){
  crumbs.innerHTML = `<a href="#/">Accueil</a> / Travail finis`;
  const items = INDEX.filter(f => isDone(f.u) && trackable(f.cat));
  const groups = {};
  items.forEach(f => {
    const k = f.sem + " / " + f.mod + " / " + f.cat;
    (groups[k] = groups[k] || []).push(f);
  });
  view.innerHTML = `<h2 class="section-title">✓ Travail finis (${items.length})</h2>` +
    (items.length ?
      `<p><button class="clear-btn" id="clearDone">Tout effacer</button></p>` +
      Object.keys(groups).sort().map(k =>
        `<div class="cat"><div class="cat-head"><span class="badge tps">✓</span>` +
        `<span>${disp(k)}</span></div>` +
        groups[k].map(f => fileRow(f, f.cat)).join("") + `</div>`
      ).join("") :
      `<div class="cat"><div class="empty">Rien de terminé pour le moment. ` +
      `Ouvrez un module, et cliquez « Terminé ? » à côté d'un TD ou TP.</div></div>`);
  const clr = document.getElementById("clearDone");
  if (clr) clr.onclick = () => {
    if (confirm("Effacer tout le travail marqué fini ?")) {
      DONE = {}; saveDone(); doneView();
    }
  };
}

/* ---------- Assistant IA : retrieval local + API clé perso ---------- */
let CORPUS = null;
function loadScript(src){
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}
async function getCorpus(statusEl){
  if (CORPUS) return CORPUS;
  if (statusEl) statusEl.textContent = "Chargement de la base documentaire…";
  await loadScript("data/corpus.js");
  CORPUS = window.CORPUS || null;
  if (statusEl) statusEl.textContent = CORPUS ?
    CORPUS.docs.length + " documents indexés." : "Base introuvable.";
  return CORPUS;
}
const FR_STOP = new Set(("le la les de des du un une et est en dans que qui par pour " +
  "au aux ce cette ces il ils elle elles nous vous leur leurs son sa ses mon ma mes " +
  "ton ta tes avec sans sous sur plus moins comme tout toute tous dont ou quand " +
  "non oui ne pas tres aussi entre vers chez annee etre avoir fait faire peut " +
  "peuvent doit doivent donc ainsi alors sinon car").split(" "));
function qtoks(s){
  return (s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .match(/[a-z0-9]{3,}/g) || []).filter(w => !FR_STOP.has(w));
}
function retrieve(question, k){
  k = k || 6;
  const q = qtoks(question);
  if (!q.length || !CORPUS) return [];
  const N = CORPUS.N, scored = [];
  for (let i = 0; i < CORPUS.chunks.length; i++){
    const c = CORPUS.chunks[i];
    const low = " " + c.t.toLowerCase() + " ";
    let score = 0;
    q.forEach(t => {
      const df = CORPUS.df[t] || 0;
      if (!df) return;
      let tf = 0, p = low.indexOf(t);
      while (p !== -1 && tf < 5){ tf++; p = low.indexOf(t, p + 1); }
      if (tf) score += Math.log(1 + N / df) * tf / (tf + 1.2);
    });
    if (score > 0) scored.push({i, score});
  }
  scored.sort((a,b) => b.score - a.score);
  const seen = {}, out = [];
  scored.forEach(s => {
    const c = CORPUS.chunks[s.i], d = CORPUS.docs[c.d];
    seen[d.id] = (seen[d.id] || 0) + 1;
    if (seen[d.id] <= 2 && out.length < k) out.push({doc: d, text: c.t});
  });
  return out;
}
function aiSettings(){
  const cfg = (window.AI_CONFIG || {});
  return {
    endpoint: (cfg.AI_ENDPOINT || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/$/, ""),
    model: cfg.AI_MODEL || "gemini-3.5-flash",
    key: cfg.AI_API_KEY || ""
  };
}
async function loadAiConfig(){
  if (window.AI_CONFIG) return;
  try { await loadScript("data/ai-config.js"); } catch(e){}
}
function mdLite(s){
  let h = esc(s);
  h = h.replace(/`([^`]+)`/g, "<code>$1</code>")
       .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return h.split(/\n{2,}|\n/).map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
}
async function aiView(){
  crumbs.innerHTML = `<a href="#/">Accueil</a> / Assistant IA`;
  view.innerHTML =
    `<h2 class="section-title">🤖 Assistant IA</h2>` +
    `<div class="cat"><div style="padding:18px"><div class="chat">` +
    `<div id="chatLog"><div class="msg ai"><p>Salut ! Pose ta question sur un cours, TD ou TP — ` +
    `je cherche dans tes PDFs puis je t'explique, étape par étape si tu veux.</p></div></div>` +
    `<div id="aiStatus" style="color:var(--muted);font-size:13px"></div>` +
    `<div class="chat-row"><input id="chatInput" placeholder="Ex : Explique l'exercice 2 du TD2 d'électronique analogique…" autocomplete="off">` +
    `<button class="btn" id="chatSend">Envoyer</button></div>` +
    `<div id="aiModelNote" style="font-size:13px;color:var(--muted)"></div></div></div></div>`;
  let BACKEND = null;
  try {
    const h = await (await fetch("api/health")).json();
    if (h && h.ok) BACKEND = h;
  } catch(e) {}
  document.getElementById("aiModelNote").textContent = BACKEND ?
    "Assistant connecté — modèle : " + BACKEND.model :
    "Backend hors ligne — mode guide (lance start-server.bat pour l'assistant complet).";
  const log = document.getElementById("chatLog");
  const inp = document.getElementById("chatInput");
  const status = document.getElementById("aiStatus");
  const add = (who, html) => {
    const d = document.createElement("div");
    d.className = "msg " + who; d.innerHTML = html;
    log.appendChild(d); log.scrollTop = log.scrollHeight;
    return d;
  };
  getCorpus(status);
  async function ask(){
    const q = inp.value.trim();
    if (!q) return;
    inp.value = "";
    add("user", esc(q));
    const hits = (await getCorpus(status)) ? retrieve(q, 6) : [];
    const showGuide = () => {
      if (!hits.length) { add("ai", `<p>Aucun passage trouvé. Essaie d'autres mots-clés.</p>`); return; }
      add("ai", `<p><strong>Mode guide</strong> — passages les plus pertinents :</p>` +
        hits.map(h => `<div class="src">📄 <a href="${h.doc.u}" target="_blank" rel="noopener">${esc(h.doc.n)}</a>` +
          `<br>${esc(h.text.slice(0, 400))}…</div>`).join(""));
    };
    if (!BACKEND) { showGuide(); return; }
    const typing = add("ai", `<span class="typing">Réflexion en cours…</span>`);
    try {
      const r = await fetch("api/chat", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({question: q,
          sources: hits.map(h => ({name: h.doc.sem + "/" + h.doc.mod + "/" + h.doc.n,
                                   text: h.text}))})
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || ("Backend : " + r.status));
      typing.innerHTML = mdLite(j.answer) +
        (hits.length ? `<div class="src">Sources : ` + hits.map(h =>
          `📄 <a href="${h.doc.u}" target="_blank" rel="noopener">${esc(h.doc.n)}</a>`).join(" · ") +
          `</div>` : ``);
      log.scrollTop = log.scrollHeight;
    } catch(err){
      typing.innerHTML = `<p>Erreur : ${esc(err.message)}</p>`;
      showGuide();
    }
  }
  document.getElementById("chatSend").onclick = ask;
  inp.addEventListener("keydown", e => { if (e.key === "Enter") ask(); });
}

/* ---------- router ---------- */
function route(){
  updateDoneCount();
  const h = location.hash || "#/";
  const parts = h.replace(/^#\//, "").split("/");
  if (parts[0] === "s" && parts[1]) return semester(parts[1]);
  if (parts[0] === "m" && parts[1] && parts[2]) return module(parts[1], parts.slice(2).join("/"));
  if (parts[0] === "edt") return edt();
  if (parts[0] === "done") return doneView();
  if (parts[0] === "ai") return aiView();
  return home();
}
window.addEventListener("hashchange", route);
/* Force render on every nav click, even if the hash didn't change. */
document.addEventListener("click", e => {
  if (e.target.closest('a[href^="#/"]')) setTimeout(route, 0);
});
view.addEventListener("click", e => {
  const b = e.target.closest(".done-btn");
  if (!b) return;
  const u = b.getAttribute("data-u");
  if (isDone(u)) delete DONE[u]; else DONE[u] = Date.now();
  saveDone();
  route();
});
updateDoneCount();
route();
})();
