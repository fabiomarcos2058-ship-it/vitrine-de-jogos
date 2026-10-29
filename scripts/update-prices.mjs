// ASFE Store — robô de preços.
// Busca preços e promoções nas lojas brasileiras e grava data/prices.json.
// Roda no GitHub Actions (ver .github/workflows/precos.yml). Não precisa de chaves.
import fs from "node:fs";
import vm from "node:vm";

const ROOT = new URL("..", import.meta.url).pathname;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- jogos do catálogo ----------
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(ROOT + "games.js", "utf8"), sandbox);
const slug = t => "j-" + t.normalize("NFD").replace(/[^\w\s-]/g, "").trim().toLowerCase().replace(/\s+/g, "-");
const games = sandbox.window.GAMES.map(g => ({ ...g, id: slug(g.t) }));
const searchName = g => (g.w || g.t).replace(/\s*\((\d{4} )?video game\)$/i, "").replace(/\s*\(video game\)$/i, "");

// ---------- utilidades ----------
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[™®©]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set(["the", "of", "a", "and", "edition", "edicao", "standard", "padrao", "game", "jogo", "ps4", "ps5", "remastered"]);
const toks = s => norm(s).split(" ").filter(w => w && !STOP.has(w));
const BAD = /soundtrack|trilha sonora|\bdlc\b|season pass|passe de temporada|\bpack\b|pacote|\bdemo\b|upgrade|artbook|bundle|cosmetic|skin|moedas|coins|points|pontos|virtual currency|expansion pass|costume|traje|ost\b/i;
function score(target, cand) {
  const a = norm(target), b = norm(cand);
  if (!b) return 0;
  if (BAD.test(cand) && !BAD.test(target)) return 0;
  if (a === b) return 100;
  const ta = toks(target), tb = toks(cand);
  if (!ta.length || !tb.length) return 0;
  const inter = ta.filter(w => tb.includes(w)).length;
  const missing = ta.length - inter;
  if (missing > 0 && !(missing === 1 && ta.length >= 4)) return 0;
  let s = 60 + 30 * (inter / Math.max(ta.length, tb.length));
  if (b.startsWith(a) || a.startsWith(b)) s += 8;
  // números (2, 3, IV, 7…) precisam bater para não confundir partes da série
  const nums = x => (norm(x).match(/\b(\d+|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv|xvi)\b/g) || []).join(" ");
  if (nums(target) !== nums(cand)) s -= 40;
  return s;
}
function best(target, list, nameOf) {
  let top = null;
  for (const it of list) { const sc = score(target, nameOf(it)); if (sc >= 70 && (!top || sc > top.sc)) top = { it, sc }; }
  return top && top.it;
}
async function get(url, opts = {}, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { ...opts, headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9", ...(opts.headers || {}) } });
      if (r.status === 429) { await sleep(5000 * (i + 1)); continue; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r;
    } catch (e) { if (i === tries - 1) throw e; await sleep(1500 * (i + 1)); }
  }
}
const brNum = s => { if (s == null) return null; if (typeof s === "number") return s; const m = String(s).replace(/\s/g, "").match(/(\d{1,3}(\.\d{3})*|\d+)(,\d{2})?/); return m ? Number(m[0].replace(/\./g, "").replace(",", ".")) : null; };
function walk(obj, fn, seen = new Set()) {
  if (!obj || typeof obj !== "object" || seen.has(obj)) return;
  seen.add(obj); fn(obj);
  for (const v of Object.values(obj)) walk(v, fn, seen);
}
const round2 = n => Math.round(n * 100) / 100;

const out = { updated: new Date().toISOString(), p: {}, top: {}, report: {} };
const put = (id, k, v) => { (out.p[id] ||= {})[k] = v; };
const report = (k, info) => { out.report[k] = info; };

// ---------- STEAM ----------
const STEAM_IDS = {"Elden Ring":1245620,"Sekiro: Shadows Die Twice":814380,"Baldur's Gate 3":1086940,"Cyberpunk 2077":1091500,"The Witcher 3: Wild Hunt":292030,"Red Dead Redemption 2":1174180,"Hogwarts Legacy":990080,"The Elder Scrolls V: Skyrim":489830,"Fallout 4":377160,"Hades":1145360,"Hades II":1145350,"Hollow Knight":367520,"Hollow Knight: Silksong":1030300,"Celeste":504230,"Stardew Valley":413150,"Balatro":2379780,"Cuphead":268910,"Stray":1332010,"Devil May Cry 5":601150,"Resident Evil 4":2050650,"Resident Evil Village":1196590,"Resident Evil 2":883710,"Resident Evil 3":952060,"Resident Evil 7: Biohazard":418370,"Monster Hunter Wilds":2246340,"Street Fighter 6":1364780,"Tekken 8":1778820,"Mortal Kombat 1":1971870,"God of War":1593500,"God of War Ragnarök":2322010,"Marvel's Spider-Man: Miles Morales":1817190,"Marvel's Spider-Man 2":2651280,"Ghost of Tsushima":2215430,"Horizon Forbidden West":2420110,"The Last of Us Part I":1888930,"The Last of Us Part II Remastered":2531310,"Returnal":1649240,"Ratchet & Clank: Em Uma Outra Dimensão":1895880,"Helldivers 2":553850,"Forza Horizon 5":1551360,"Persona 5 Royal":1687950,"Persona 3 Reload":2161700,"Lies of P":1627720,"Black Myth: Wukong":2358720,"Armored Core VI: Fires of Rubicon":1888160,"Dead Space":1693980,"Doom Eternal":782330,"Doom: The Dark Ages":3017860,"Starfield":1716740,"Indiana Jones e o Grande Círculo":2677660,"Sea of Thieves":1172620,"Hi-Fi Rush":1817230,"Clair Obscur: Expedition 33":1903340,"Kingdom Come: Deliverance II":1771300,"Silent Hill 2":2124490,"Apex Legends":1172470,"Final Fantasy XVI":2515020,"Final Fantasy VII Rebirth":2909400,"Final Fantasy VII Remake Intergrade":1462040,"Uncharted: Coleção Legado dos Ladrões":1659420,"Ori and the Will of the Wisps":1057090,"Gears 5":1097840,"Halo: The Master Chief Collection":976730,"Halo Infinite":1240440,"Like a Dragon: Infinite Wealth":2072450,"Yakuza 0":638970,"Tales of Arise":740130,"It Takes Two":1426210,"Split Fiction":2001120,"Star Wars Jedi: Survivor":1774580,"Assassin's Creed Shadows":3159330,"Prince of Persia: The Lost Crown":2751000,"Batman: Arkham Knight":208650,"Call of Duty: Black Ops 6":2933620,"Battlefield 6":2807960,"Sonic X Shadow Generations":2513280,"Sea of Stars":1244090,"Dragon Ball FighterZ":678950,"Dragon Ball Z: Kakarot":851850,"Dragon Ball Xenoverse 2":454650,"Dragon Ball Xenoverse":323470,"Dragon Ball: The Breakers":1272080,"Dragon Ball: Sparking! Zero":1790600,"Mass Effect Legendary Edition":1328670,"Diablo IV":2344520,"The Elder Scrolls IV: Oblivion Remastered":2623190,"Metaphor: ReFantazio":2679460,"Resident Evil 0":339340,"Resident Evil":304240,"Resident Evil 5":21690,"Resident Evil 6":221040,"Resident Evil Revelations":222480,"Resident Evil Revelations 2":287290,"Umbrella Corps":390340,"Grand Theft Auto IV":12210,"Final Fantasy VII":39140,"Final Fantasy VIII Remastered":1026680,"Final Fantasy IX":377840,"Final Fantasy X | X-2 HD Remaster":359870,"Final Fantasy XII: The Zodiac Age":595520,"Final Fantasy XIII":292120,"Final Fantasy XIII-2":292140,"Lightning Returns: Final Fantasy XIII":345350,"Final Fantasy XIV Online":39210,"Final Fantasy XV":637650,"Final Fantasy Type-0 HD":340170,"Dissidia Final Fantasy NT":921590,"World of Final Fantasy":552700,"Crisis Core – Final Fantasy VII – Reunion":1608070,"Nioh 2 Remastered":1325200,"Gears of War: Reloaded":3164330,"Avowed":2457220,"The Outer Worlds 2":1449110,"Ninja Gaiden 4":2627260,"Stellar Blade":3489700,"Grand Theft Auto V":3240220};

async function steam() {
  const list = games.filter(g => g.p.st !== null && g.p.st !== undefined);
  const ids = {}; const queue = []; const unresolved = []; const disagree = [];
  let ok = 0;
  for (const g of list) {
    const term = searchName(g);
    let hit = null;
    try {
      const r = await (await get(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&cc=br&l=portuguese`)).json();
      const items = (r.items || []).filter(x => x.type === "app");
      hit = best(term, items, x => x.name) || best(g.t, items, x => x.name);
      if (!hit && STEAM_IDS[g.t]) hit = items.find(x => x.id === STEAM_IDS[g.t]) || null;
    } catch (e) { unresolved.push(g.t + " (" + e.message + ")"); }
    if (hit && STEAM_IDS[g.t] && hit.id !== STEAM_IDS[g.t]) disagree.push(`${g.t}: busca=${hit.id} "${hit.name}" lista=${STEAM_IDS[g.t]}`);
    if (hit) {
      ids[g.id] = hit.id;
      const url = `https://store.steampowered.com/app/${hit.id}`;
      if (hit.price && hit.price.currency === "BRL") { put(g.id, "st", { b: round2(hit.price.initial / 100), f: round2(hit.price.final / 100), pct: hit.price.initial > hit.price.final ? Math.round((1 - hit.price.final / hit.price.initial) * 100) : 0, url, n: hit.name }); ok++; }
      else if (g.p.st === 0) { put(g.id, "st", { b: 0, f: 0, pct: 0, url, n: hit.name }); ok++; }
      else queue.push([g.id, hit.id]);
    } else if (STEAM_IDS[g.t]) { ids[g.id] = STEAM_IDS[g.t]; queue.push([g.id, STEAM_IDS[g.t]]); }
    else unresolved.push(g.t);
    await sleep(350);
  }
  const missing = [];
  for (let i = 0; i < queue.length; i += 30) {
    const chunk = queue.slice(i, i + 30);
    try {
      const r = await (await get(`https://store.steampowered.com/api/appdetails?appids=${chunk.map(([, a]) => a).join(",")}&cc=br&filters=price_overview`)).json();
      for (const [gid, app] of chunk) {
        const d = r[app]; const po = d && d.success && d.data && d.data.price_overview;
        if (po && po.currency === "BRL") { put(gid, "st", { b: round2(po.initial / 100), f: round2(po.final / 100), pct: po.discount_percent || 0, url: `https://store.steampowered.com/app/${app}` }); ok++; }
        else missing.push(gid);
      }
    } catch (e) { missing.push("lote " + i + ": " + e.message); }
    await sleep(1500);
  }
  report("st", { ok, total: list.length, unresolved, missing: missing.slice(0, 40), disagree: disagree.slice(0, 40) });

  // Mais vendidos e ofertas em destaque na Steam (Brasil)
  try {
    const fc = await (await get("https://store.steampowered.com/api/featuredcategories?cc=br&l=portuguese")).json();
    const map = Object.fromEntries(Object.entries(ids).map(([g, a]) => [a, g]));
    const pick = arr => (arr || []).filter(x => x && x.name).slice(0, 12).map(x => ({ name: x.name, app: x.id, img: x.header_image || x.large_capsule_image, b: x.original_price ? x.original_price / 100 : x.final_price / 100, f: (x.final_price || 0) / 100, pct: x.discount_percent || 0, id: map[x.id] || null }));
    out.top.st = pick(fc.top_sellers && fc.top_sellers.items);
    out.top.stSpecials = pick(fc.specials && fc.specials.items);
  } catch (e) { report("stTop", { error: e.message }); }
}

// ---------- PLAYSTATION STORE ----------
async function playstation() {
  const list = games.filter(g => g.p.ps !== null && g.p.ps !== undefined && g.p.ps !== "pre");
  let ok = 0; const miss = []; let errors = 0;
  for (const g of list) {
    const term = searchName(g);
    try {
      const html = await (await get(`https://store.playstation.com/pt-br/search/${encodeURIComponent(term)}`)).text();
      const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (!m) { miss.push(g.t + " (sem dados)"); continue; }
      const data = JSON.parse(m[1]);
      const cands = [];
      walk(data, o => {
        if (typeof o.name === "string" && o.price && typeof o.price === "object" && (o.price.basePrice || o.price.discountedPrice || o.price.isFree)) cands.push(o);
      });
      const full = cands.filter(o => !o.storeDisplayClassification || /FULL_GAME|GAME_BUNDLE|PREMIUM_EDITION/.test(o.storeDisplayClassification));
      const hit = best(term, full.length ? full : cands, o => o.name) || best(g.t, full.length ? full : cands, o => o.name);
      if (!hit) { miss.push(g.t); continue; }
      const pr = hit.price;
      const b = pr.isFree ? 0 : brNum(pr.basePrice);
      let f = pr.isFree ? 0 : brNum(pr.discountedPrice);
      if (pr.isTiedToSubscription || (pr.serviceBranding || []).some(x => /PLUS/i.test(x))) f = b; // desconto só para assinantes
      if (b == null || f == null) { miss.push(g.t + " (preço)"); continue; }
      const pct = b > 0 && f < b ? Math.round((1 - f / b) * 100) : 0;
      const until = pr.endTime && /^\d+$/.test(String(pr.endTime)) ? new Date(Number(pr.endTime)).toISOString() : null;
      put(g.id, "ps", { b, f, pct, until, url: hit.id ? `https://store.playstation.com/pt-br/product/${hit.id}` : null, n: hit.name });
      ok++;
    } catch (e) { errors++; miss.push(g.t + " (" + e.message + ")"); }
    await sleep(700);
  }
  report("ps", { ok, total: list.length, errors, miss: miss.slice(0, 60) });
}

// ---------- XBOX / MICROSOFT STORE ----------
async function xbox() {
  const list = games.filter(g => g.p.xb !== null && g.p.xb !== undefined && g.p.xb !== "pre");
  let ok = 0; const miss = []; let errors = 0;
  for (const g of list) {
    const term = searchName(g);
    try {
      const html = await (await get(`https://www.xbox.com/pt-BR/search/results/games?q=${encodeURIComponent(term)}`)).text();
      const m = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\})\s*;\s*(?:window\.|<\/script>)/);
      if (!m) { miss.push(g.t + " (sem dados)"); continue; }
      const data = JSON.parse(m[1]);
      const cands = [];
      walk(data, o => {
        if (typeof o.title === "string" && o.specificPrices && Array.isArray(o.specificPrices.purchaseable) && o.specificPrices.purchaseable.length) cands.push(o);
      });
      const consoleOnes = cands.filter(o => !o.availableOn || o.availableOn.some(x => /Xbox/i.test(x)));
      const hit = best(term, consoleOnes, o => o.title) || best(g.t, consoleOnes, o => o.title);
      if (!hit) { miss.push(g.t + (cands.length ? "" : " (0 itens)")); continue; }
      const pr = hit.specificPrices.purchaseable[0];
      const b = round2(pr.msrp ?? pr.listPrice), f = round2(pr.listPrice ?? pr.msrp);
      if (!(b >= 0) || !(f >= 0)) { miss.push(g.t + " (preço)"); continue; }
      const pct = pr.discountPercentage ? Math.round(pr.discountPercentage) : (b > 0 && f < b ? Math.round((1 - f / b) * 100) : 0);
      const pid = hit.productId || hit.id;
      put(g.id, "xb", { b, f, pct, until: pr.endDate || null, url: pid ? `https://www.xbox.com/pt-BR/games/store/jogo/${pid}` : null, n: hit.title });
      ok++;
    } catch (e) { errors++; miss.push(g.t + " (" + e.message + ")"); }
    await sleep(700);
  }
  report("xb", { ok, total: list.length, errors, miss: miss.slice(0, 60) });
}

// ---------- EPIC GAMES ----------
async function epic() {
  const list = games.filter(g => g.p.ep !== null && g.p.ep !== undefined);
  let ok = 0; const miss = []; let errors = 0;
  const Q = `query searchStoreQuery($keywords: String, $country: String!, $locale: String, $count: Int) {
    Catalog { searchStore(keywords: $keywords, country: $country, locale: $locale, count: $count, category: "games/edition/base|bundles/games|games/edition") {
      elements { title productSlug urlSlug offerMappings { pageSlug pageType }
        price(country: $country) { totalPrice { originalPrice discountPrice discount currencyCode currencyInfo { decimals } } lineOffers { appliedRules { endDate } } } } } } }`;
  for (const g of list) {
    const term = searchName(g);
    try {
      const r = await (await get("https://graphql.epicgames.com/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: Q, variables: { keywords: term, country: "BR", locale: "pt-BR", count: 10 } }) }, 2)).json();
      const els = (((r.data || {}).Catalog || {}).searchStore || {}).elements || [];
      const hit = best(term, els, e => e.title);
      if (!hit || !hit.price) { miss.push(g.t); continue; }
      const tp = hit.price.totalPrice; const dec = Math.pow(10, (tp.currencyInfo && tp.currencyInfo.decimals) || 2);
      if (tp.currencyCode && tp.currencyCode !== "BRL") { miss.push(g.t + " (moeda)"); continue; }
      const b = round2(tp.originalPrice / dec), f = round2(tp.discountPrice / dec);
      const rule = ((hit.price.lineOffers || [])[0] || {}).appliedRules || [];
      const slugP = (hit.offerMappings || []).find(x => x.pageType === "productHome")?.pageSlug || hit.productSlug || hit.urlSlug;
      put(g.id, "ep", { b, f, pct: b > 0 && f < b ? Math.round((1 - f / b) * 100) : 0, until: rule[0] && rule[0].endDate || null, url: slugP ? `https://store.epicgames.com/pt-BR/p/${slugP.replace(/\/home$/, "")}` : null, n: hit.title });
      ok++;
    } catch (e) { errors++; miss.push(g.t + " (" + e.message + ")"); if (errors >= 5 && ok === 0) { miss.push("parado: a Epic bloqueou as consultas"); break; } }
    await sleep(600);
  }
  report("ep", { ok, total: list.length, errors, miss: miss.slice(0, 40) });
}

// ---------- execução ----------
const steps = { st: steam, ps: playstation, xb: xbox, ep: epic };
for (const [k, fn] of Object.entries(steps)) {
  const t0 = Date.now();
  try { await fn(); } catch (e) { report(k, { error: String(e && e.message || e) }); }
  console.log(k, JSON.stringify(out.report[k] || {}).slice(0, 400), ((Date.now() - t0) / 1000).toFixed(0) + "s");
}

// mantém o último preço conhecido de uma loja que falhou nesta rodada (até 3 dias)
try {
  const prev = JSON.parse(fs.readFileSync(ROOT + "data/prices.json", "utf8"));
  const age = Date.now() - new Date(prev.updated).getTime();
  if (age < 3 * 864e5) for (const [gid, st] of Object.entries(prev.p || {})) for (const [k, v] of Object.entries(st)) {
    if (!(out.p[gid] && out.p[gid][k]) && (out.report[k] && (out.report[k].error || out.report[k].ok === 0))) put(gid, k, { ...v, stale: true });
  }
  if (!out.top.st && prev.top && prev.top.st) out.top = prev.top;
} catch (e) {}

fs.mkdirSync(ROOT + "data", { recursive: true });
const report_ = out.report; delete out.report;
fs.writeFileSync(ROOT + "data/prices.json", JSON.stringify(out));
fs.writeFileSync(ROOT + "data/prices-report.json", JSON.stringify({ updated: out.updated, ...report_ }, null, 1));
const n = Object.values(out.p).reduce((a, s) => a + Object.keys(s).length, 0);
console.log("preços gravados:", n);
