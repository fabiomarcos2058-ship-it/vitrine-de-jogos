// Zera — robô que adiciona jogos sozinho (até 60 a cada 16 horas).
// Fonte: mais vendidos e mais jogados da Steam no Brasil. Preços: Steam e Xbox primeiro;
// PlayStation com no máximo 3 tentativas (se não achar, desiste e segue). Grava games.js e data/auto-add.json.
import fs from "node:fs";
import vm from "node:vm";

const ROOT = new URL("..", import.meta.url).pathname;
const PER_RUN = 60;            // jogos por rodada
const EVERY_H = 16;            // intervalo entre rodadas
const MAX_TOTAL = 1200;        // teto do catálogo (para o site e o robô de preços continuarem rápidos)
const MIN_REVIEWS = 2000, MIN_POSITIVE = 0.7;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const statePath = ROOT + "data/auto-add.json";
let state = { last: null, runs: [], rejected: {} };
try { state = { ...state, ...JSON.parse(fs.readFileSync(statePath, "utf8")) }; } catch (e) {}

const forced = process.env.GITHUB_EVENT_NAME && process.env.GITHUB_EVENT_NAME !== "schedule";
if (!forced && state.last && Date.now() - new Date(state.last).getTime() < (EVERY_H - 0.5) * 3600e3) { console.log("Ainda não deu 16 horas desde a última rodada."); process.exit(0); }

const src = fs.readFileSync(ROOT + "games.js", "utf8");
const sb = { window: {} }; vm.runInNewContext(src, sb);
const games = sb.window.GAMES;
if (games.length >= MAX_TOTAL) { console.log("Catálogo já está no teto de", MAX_TOTAL); state.last = new Date().toISOString(); fs.writeFileSync(statePath, JSON.stringify(state)); process.exit(0); }

const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[™®©]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set(["the", "of", "a", "and", "edition", "edicao", "standard", "padrao", "game", "jogo", "ps4", "ps5", "remastered"]);
const toks = s => norm(s).split(" ").filter(w => w && !STOP.has(w));
const BAD = /soundtrack|trilha sonora|\bdlc\b|season pass|passe de temporada|\bpack\b|pacote|\bdemo\b|upgrade|artbook|bundle|cosmetic|skin|moedas|coins|points|pontos|virtual currency|expansion pass|costume|traje|ost\b|playtest|dedicated server|editor\b|benchmark|wallpaper/i;
function score(target, cand) {
  const a = norm(target), b = norm(cand);
  if (!b) return 0; if (BAD.test(cand) && !BAD.test(target)) return 0; if (a === b) return 100;
  const ta = toks(target), tb = toks(cand); if (!ta.length || !tb.length) return 0;
  const inter = ta.filter(w => tb.includes(w)).length, missing = ta.length - inter;
  if (missing > 0 && !(missing === 1 && ta.length >= 4)) return 0;
  let s = 60 + 30 * (inter / Math.max(ta.length, tb.length)); if (b.startsWith(a) || a.startsWith(b)) s += 8;
  const nums = x => (norm(x).match(/\b(\d+|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv|xvi)\b/g) || []).join(" ");
  if (nums(target) !== nums(cand)) s -= 40;
  return s;
}
const best = (t, list, nameOf, min = 74) => { let top = null; for (const it of list) { const sc = score(t, nameOf(it)); if (sc >= min && (!top || sc > top.sc)) top = { it, sc }; } return top && top.it; };
async function get(url, opts = {}, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { ...opts, headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9", ...(opts.headers || {}) } });
      if (r.status === 429) { await sleep(30000 * (i + 1)); continue; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r;
    } catch (e) { if (i === tries - 1) throw e; await sleep(1500 * (i + 1)); }
  }
  throw new Error("sem resposta");
}
function walk(o, fn, seen = new Set()) { if (!o || typeof o !== "object" || seen.has(o)) return; seen.add(o); fn(o); for (const v of Object.values(o)) walk(v, fn, seen); }
const round2 = n => Math.round(n * 100) / 100;
const decode = t => String(t || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const cut = (t, n) => t.length <= n ? t : t.slice(0, t.lastIndexOf(" ", n - 1)) + "…";

// ---------- candidatos ----------
const have = new Set(games.map(g => norm(g.t)));
const haveIds = new Set(games.map(g => g.stid).filter(Boolean).map(String));
let PRICES = {}; try { PRICES = JSON.parse(fs.readFileSync(ROOT + "data/prices.json", "utf8")).p || {}; } catch (e) {}
for (const st of Object.values(PRICES)) { const m = st.st && st.st.url && st.st.url.match(/\/app\/(\d+)/); if (m) haveIds.add(m[1]); }
const cands = new Map();
const addCand = (id, name, src) => { id = String(id); if (!id || haveIds.has(id) || state.rejected[id] || cands.has(id)) return; cands.set(id, { id, name, src }); };
try {
  const r = await (await get("https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/")).json();
  for (const x of ((r.response || {}).ranks || [])) addCand(x.appid, "", "mais jogados");
} catch (e) { console.log("mais jogados:", e.message); }
for (let start = 0; start < 500; start += 100) {
  try {
    const r = await (await get(`https://store.steampowered.com/search/results/?filter=topsellers&category1=998&cc=br&l=portuguese&json=1&start=${start}&count=100`)).json();
    for (const it of r.items || []) { const m = (it.logo || "").match(/\/apps\/(\d+)\//); if (m) addCand(m[1], it.name, "mais vendidos"); }
  } catch (e) { console.log("mais vendidos", start, e.message); }
  await sleep(1200);
}
console.log("candidatos:", cands.size);

// ---------- Xbox ----------
async function xboxPrice(title) {
  const html = await (await get(`https://www.xbox.com/pt-BR/search/results/games?q=${encodeURIComponent(title)}`)).text();
  const m = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\})\s*;\s*(?:window\.|<\/script>)/);
  if (!m) return null;
  const list = []; walk(JSON.parse(m[1]), o => { if (typeof o.title === "string" && o.specificPrices && Array.isArray(o.specificPrices.purchaseable) && o.specificPrices.purchaseable.length) list.push(o); });
  const hit = best(title, list.filter(o => !o.availableOn || o.availableOn.some(x => /Xbox/i.test(x))), o => o.title, 80);
  if (!hit) return null;
  const pr = hit.specificPrices.purchaseable[0], b = pr.msrp ?? pr.listPrice;
  return typeof b === "number" ? round2(b) : null;
}
// ---------- PlayStation: no máximo 3 tentativas ----------
const PS_EXTRA = /deluxe|ultimate|gold|premium|complet[ae]|bundle|pacote|collection|cole[cç][aã]o|season pass|passe de temporada|cross-gen|vault|digital deluxe/i;
const psClean = n => n.replace(/\s*\|.*$/, "").replace(/\(PlayStation®?\s*\d\)|PS4\s*(&|＆|e|and)\s*PS5|PS5\s*(&|＆|e|and)\s*PS4|\bPS[45]\b|Edição Padrão|Standard Edition|Edição Standard|™|®/gi, " ").replace(/\(\s*(e|&|＆|and)?\s*\)|\[\s*\]|\s[&＆]\s*$/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
function psPrices(html) {
  const out = []; let i = 0;
  while ((i = html.indexOf('{"__typename":"Price"', i)) >= 0) { let d = 0, j = i; for (; j < html.length && j - i < 6000; j++) { if (html[j] === "{") d++; else if (html[j] === "}") { d--; if (!d) break; } } try { out.push(JSON.parse(html.slice(i, j + 1))); } catch (e) {} i = j + 1; }
  return out.filter(p => !p.isTiedToSubscription && !(p.serviceBranding || []).some(x => /PLUS|EA_ACCESS|UBISOFT|GAME_?PASS/i.test(x)) && (p.isFree || p.basePriceValue > 0));
}
async function psFind(title) {
  const sl = title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/['’™®:.,!?]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const slugs = [...new Set([sl, title.includes(":") ? sl.split("-").slice(0, title.split(":")[0].split(/\s+/).length).join("-") : null, sl.replace(/^the-/, "")].filter(Boolean))];
  let tries = 0;
  for (const s of slugs) {
    if (tries >= 3) break;
    tries++;
    const r = await fetch(`https://www.playstation.com/pt-br/games/${s}/`, { headers: { "user-agent": UA, "accept-language": "pt-BR" } }).catch(() => null);
    await sleep(400);
    if (!r || !r.ok) continue;
    const ids = [...new Set([...(await r.text()).matchAll(/[A-Z]{2}\d{4}-[A-Z]{4}\d{5}_00-[A-Z0-9]{16}/g)].map(m => m[0]))]
      .filter(i => !/DELUX|ULTIM|GOLD|PREMIU|COMPLET|BUNDLE|SEASON|PASS|DLC|VIRTUAL|CURRENC|COINS|POINTS|EXPANS|UPGRADE|SOUNDTR|DEMO|TRIAL/i.test(i.split("-")[2]));
    for (const id of [...ids.filter(i => /-PPSA/.test(i)), ...ids.filter(i => /-CUSA/.test(i))].slice(0, 3)) {
      if (tries > 3) break;
      const html = await (await get(`https://store.playstation.com/pt-br/product/${id}`, {}, 2)).text().catch(() => "");
      await sleep(500);
      const name = psClean((html.match(/<title>([^<]+)<\/title>/) || [])[1] || "");
      const extra = (name.match(new RegExp(PS_EXTRA.source, "gi")) || []).filter(w => !new RegExp(w, "i").test(title));
      const pr = psPrices(html)[0];
      if (pr && !extra.length && score(title, name) >= 74) return { id, b: pr.isFree ? 0 : round2(pr.basePriceValue / 100) };
    }
  }
  return null;
}
// ---------- capas (Steam) ----------
async function steamAssets(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 40) {
    const q = { ids: ids.slice(i, i + 40).map(a => ({ appid: Number(a) })), context: { language: "brazilian", country_code: "BR" }, data_request: { include_assets: true } };
    try {
      const r = await (await get("https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=" + encodeURIComponent(JSON.stringify(q)))).json();
      for (const it of (r.response && r.response.store_items) || []) { const as = it.assets || {}, fmt = as.asset_url_format || ""; const f = as.library_capsule_2x || as.library_capsule; if (f) out[it.appid] = "https://shared.akamai.steamstatic.com/store_item_assets/" + fmt.replace("${FILENAME}", f); }
    } catch (e) {}
    await sleep(800);
  }
  return out;
}
const GENRE = gs => {
  const has = n => gs.some(g => norm(g) === norm(n));
  if (has("Corrida") || has("Racing")) return "Corrida";
  if (has("Esportes") || has("Sports")) return "Esporte";
  if (has("Estratégia") || has("Strategy")) return "Estratégia";
  if (has("Simulação") || has("Simulation")) return "Simulação";
  if (has("RPG")) return "RPG";
  if (has("Ação") || has("Action")) return "Ação";
  if (has("Aventura") || has("Adventure")) return "Aventura";
  return "Ação";
};

// ---------- avaliações em lote (API oficial da Steam) ----------
const REV = {};
{
  const ids = [...cands.keys()];
  for (let i = 0; i < ids.length; i += 50) {
    const q = { ids: ids.slice(i, i + 50).map(a => ({ appid: Number(a) })), context: { language: "brazilian", country_code: "BR" }, data_request: { include_reviews: true } };
    try {
      const r = await (await get("https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=" + encodeURIComponent(JSON.stringify(q)))).json();
      for (const it of (r.response && r.response.store_items) || []) {
        const sm = (it.reviews && (it.reviews.summary_filtered || it.reviews.summary_unfiltered)) || {};
        REV[it.appid] = { total: Number(sm.review_count) || 0, pos: (Number(sm.percent_positive) || 0) / 100 };
      }
    } catch (e) { console.log("avaliações", e.message); }
    await sleep(800);
  }
  console.log("avaliações lidas:", Object.keys(REV).length);
}

// ---------- avaliação dos candidatos ----------
const added = [], log = [];
const reject = (id, why) => { state.rejected[id] = why; log.push(id + " " + why); };
for (const c of cands.values()) {
  if (added.length >= PER_RUN || games.length + added.length >= MAX_TOTAL) break;
  const rv0 = REV[c.id];
  if (rv0 && (rv0.total < MIN_REVIEWS || rv0.pos < MIN_POSITIVE)) { reject(c.id, `avaliações ${rv0.total} / ${Math.round(rv0.pos * 100)}%`); continue; }
  if (!rv0) { log.push(c.id + " sem avaliações"); continue; }
  try {
    const d = (await (await get(`https://store.steampowered.com/api/appdetails?appids=${c.id}&cc=br&l=brazilian`)).json())[c.id];
    await sleep(1700);
    const a = d && d.success && d.data;
    if (!a) { reject(c.id, "sem dados"); continue; }
    if (a.type !== "game") { reject(c.id, "não é jogo"); continue; }
    const name = decode(a.name).replace(/[™®©]/g, "").replace(/\s+/g, " ").trim();
    const gnames = (a.genres || []).map(x => x.description);
    if (gnames.some(x => /utilit|design|ilustra|produ[cç][aã]o|v[ií]deo|[aá]udio|anima[cç][aã]o|modelagem|treinamento|educa[cç]|desenvolvimento|contabilidade|fotografia|software|web publishing|publica[cç][aã]o/i.test(x)) && !gnames.some(x => /a[cç][aã]o|aventura|rpg|estrat|simula|corrida|esporte|casual|indie|multijogador/i.test(x))) { reject(c.id, "não é jogo (programa)"); continue; }
    if (/^(obs studio|wallpaper engine|crosshair x|bongo cat|aimlabs|lossless scaling|steamvr|soundpad|spacedesk|vtube studio)$/i.test(name)) { reject(c.id, "não é jogo (programa)"); continue; }
    if (BAD.test(name)) { reject(c.id, "extra/DLC"); continue; }
    if (have.has(norm(name)) || added.some(x => norm(x.t) === norm(name))) { reject(c.id, "já no catálogo"); continue; }
    const cd = ((a.content_descriptors || {}).ids || []).map(Number);
    if (cd.some(x => [3, 4].includes(x))) { reject(c.id, "conteúdo adulto"); continue; }
    if (a.release_date && a.release_date.coming_soon) { continue; } // tenta de novo quando lançar
    if (!a.is_free && !a.price_overview) { reject(c.id, "sem preço no Brasil"); continue; }
    const total = rv0.total, pos = rv0.pos;
    const st = a.is_free ? 0 : round2(a.price_overview.initial / 100);
    let xb = null; try { xb = await xboxPrice(name); } catch (e) {} await sleep(800);
    let ps = null; try { ps = await psFind(name); } catch (e) {}
    const y = Number(((a.release_date && a.release_date.date) || "").match(/(\d{4})/)?.[1]) || new Date().getFullYear();
    const e = {
      t: name, y, g: GENRE((a.genres || []).map(x => x.description)), d: decode((a.developers || [])[0] || (a.publishers || [])[0] || "—"),
      n: a.metacritic && a.metacritic.score ? a.metacritic.score : null,
      p: { ps: ps ? ps.b : null, xb, st, ep: null, gp: null, ap: null },
      desc: cut(decode(a.short_description) || "Jogo adicionado automaticamente a partir da Steam.", 300),
      ed: [[st === 0 ? "Gratuito" : "Padrão", "Jogo completo", st]],
      w: name, stid: Number(c.id), auto: true
    };
    if (ps) e.psid = ps.id;
    added.push(e);
    console.log("+", name, "| Steam", st, "| Xbox", xb, "| PS", ps ? ps.b : "—", "|", total, "avaliações", Math.round(pos * 100) + "%");
  } catch (err) { log.push(c.id + " erro " + (err && err.stack ? err.stack.split("\n").slice(0, 2).join(" ") : err)); }
}
// capas e gravação
const caps = await steamAssets(added.map(e => e.stid));
added.forEach(e => { if (caps[e.stid]) e.img = caps[e.stid]; });
if (added.length) {
  const i = src.lastIndexOf("\n];", src.indexOf("window.TOP"));
  let pre = src.slice(0, i).trimEnd(); if (!pre.endsWith(",")) pre += ",";
  const order = ["t", "img", "y", "g", "d", "n", "p", "desc", "ed", "w", "stid", "psid", "auto"];
  const line = e => JSON.stringify(Object.fromEntries(order.filter(k => e[k] !== undefined).map(k => [k, e[k]])));
  fs.writeFileSync(ROOT + "games.js", pre + added.map(e => "\n" + line(e)).join(",") + src.slice(i));
}
state.last = new Date().toISOString();
state.runs = [{ at: state.last, added: added.map(e => e.t), checked: log.length + added.length, errors: log.filter(x => / erro /.test(x)).slice(0, 15) }, ...state.runs].slice(0, 30);
fs.writeFileSync(statePath, JSON.stringify(state));
console.log("adicionados:", added.length, "| rejeitados nesta rodada:", log.length, "| catálogo:", games.length + added.length);
