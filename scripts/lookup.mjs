// Zera — robô de busca: coleta dados reais (Steam, Xbox, Wikipédia) para novos jogos e capas.
// Roda no GitHub Actions (.github/workflows/lookup.yml) e grava data/lookup.json.
import fs from "node:fs";
import vm from "node:vm";

const ROOT = new URL("..", import.meta.url).pathname;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const input = JSON.parse(fs.readFileSync(ROOT + "scripts/lookup-input.json", "utf8"));
const sb = { window: {} }; vm.runInNewContext(fs.readFileSync(ROOT + "games.js", "utf8"), sb);
const games = sb.window.GAMES;

const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[™®©]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
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
function walk(o, fn, seen = new Set()) { if (!o || typeof o !== "object" || seen.has(o)) return; seen.add(o); fn(o); for (const v of Object.values(o)) walk(v, fn, seen); }
const pick = (q, items, nameOf) => {
  const a = norm(q);
  return items.find(x => norm(nameOf(x)) === a) || items.find(x => norm(nameOf(x)).startsWith(a)) || items.find(x => a.startsWith(norm(nameOf(x)))) || null;
};

async function steamAssets(appids) {
  const out = {};
  for (let i = 0; i < appids.length; i += 40) {
    const ids = appids.slice(i, i + 40).map(a => ({ appid: Number(a) }));
    const q = { ids, context: { language: "brazilian", country_code: "BR" }, data_request: { include_assets: true } };
    try {
      const r = await (await get("https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=" + encodeURIComponent(JSON.stringify(q)))).json();
      for (const it of (r.response && r.response.store_items) || []) {
        const as = it.assets || {}, fmt = as.asset_url_format || "";
        const mk = f => f ? "https://shared.akamai.steamstatic.com/store_item_assets/" + fmt.replace("${FILENAME}", f) : null;
        out[it.appid] = { capsule: mk(as.library_capsule_2x || as.library_capsule), header: mk(as.header), hero: mk(as.library_hero) };
      }
    } catch (e) { console.log("assets", e.message); }
    await sleep(800);
  }
  return out;
}

const result = { updated: new Date().toISOString(), new: [], covers: {} };
// modo "conferir": só testa endereços de imagens e títulos da Wikipédia
if (input.verify) {
  const out = { updated: result.updated, urls: {}, wiki: {}, assets: {} };
  for (const u of input.verify.urls || []) { try { const r = await fetch(u, { headers: { "user-agent": UA } }); out.urls[u] = r.status + " " + (r.headers.get("content-type") || ""); } catch (e) { out.urls[u] = "erro " + e.message; } }
  const ws = input.verify.wiki || [];
  if (ws.length) {
    const d = await (await get("https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=thumbnail|name&pithumbsize=600&pilicense=any&titles=" + encodeURIComponent(ws.join("|")))).json();
    const step = {}; [...(d.query.normalized || []), ...(d.query.redirects || [])].forEach(m => { step[m.from] = m.to; });
    const th = {}; Object.values(d.query.pages || {}).forEach(p => { th[p.title] = p.thumbnail ? p.thumbnail.source : (p.missing !== undefined ? "MISSING PAGE" : "NO IMAGE"); });
    ws.forEach(w => { let t = w; for (let k = 0; k < 3 && step[t]; k++) t = step[t]; out.wiki[w] = th[t] || null; });
  }
  if (input.verify.appids) Object.assign(out.assets, await steamAssets(input.verify.appids));
  out.xboxImg = {};
  for (const q of input.verify.xbox || []) {
    try {
      const html = await (await get(`https://www.xbox.com/pt-BR/search/results/games?q=${encodeURIComponent(q)}`)).text();
      const m = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\})\s*;\s*(?:window\.|<\/script>)/);
      const c = []; if (m) walk(JSON.parse(m[1]), o => { if (typeof o.title === "string" && o.images && typeof o.images === "object") c.push({ title: o.title, images: Object.fromEntries(Object.entries(o.images).map(([k, v]) => [k, v && (v.url || (Array.isArray(v) && v[0] && v[0].url)) || null])) }); });
      out.xboxImg[q] = c.slice(0, 3);
    } catch (e) { out.xboxImg[q] = "erro " + e.message; }
    await sleep(800);
  }
  out.itunes = {};
  for (const q of input.verify.itunes || []) {
    try { const d = await (await get(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&country=br&entity=software&limit=3`)).json(); out.itunes[q] = (d.results || []).map(r => ({ n: r.trackName, a: r.artworkUrl512, p: r.price })); } catch (e) { out.itunes[q] = "erro " + e.message; }
  }
  fs.writeFileSync(ROOT + "data/lookup-verify.json", JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out).slice(0, 2000));
  process.exit(0);
}

// ---------- jogos novos ----------
for (const q of input.new) {
  const row = { q };
  try {
    const s = await (await get(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&cc=br&l=portuguese`)).json();
    const items = (s.items || []).filter(x => x.type === "app");
    const hit = pick(q, items, x => x.name) || items[0];
    if (hit) {
      const d = await (await get(`https://store.steampowered.com/api/appdetails?appids=${hit.id}&cc=br&l=brazilian`)).json();
      const a = d[hit.id] && d[hit.id].data;
      if (a) row.steam = { appid: hit.id, name: a.name, free: a.is_free, b: a.price_overview ? a.price_overview.initial / 100 : null, f: a.price_overview ? a.price_overview.final / 100 : null, pct: a.price_overview ? a.price_overview.discount_percent : 0, mc: a.metacritic ? a.metacritic.score : null, date: a.release_date && a.release_date.date, soon: a.release_date && a.release_date.coming_soon, genres: (a.genres || []).map(g => g.description), devs: a.developers, pubs: a.publishers, desc: a.short_description, plat: a.platforms, other: items.slice(0, 5).map(x => x.name + " #" + x.id) };
    }
  } catch (e) { row.steamErr = e.message; }
  await sleep(1200);
  try {
    const html = await (await get(`https://www.xbox.com/pt-BR/search/results/games?q=${encodeURIComponent(q)}`)).text();
    const m = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\})\s*;\s*(?:window\.|<\/script>)/);
    if (m) {
      const cands = []; walk(JSON.parse(m[1]), o => { if (typeof o.title === "string" && o.specificPrices && Array.isArray(o.specificPrices.purchaseable)) cands.push(o); });
      row.xboxAll = cands.slice(0, 6).map(o => { const p = o.specificPrices.purchaseable[0] || {}; return { title: o.title, id: o.productId || o.id, b: p.msrp ?? null, f: p.listPrice ?? null, on: o.availableOn }; });
    }
  } catch (e) { row.xboxErr = e.message; }
  await sleep(800);
  result.new.push(row); console.log(q, row.steam ? row.steam.name + " " + row.steam.f : "-", (row.xboxAll || []).length);
}
const newIds = result.new.map(r => r.steam && r.steam.appid).filter(Boolean);

// ---------- capas: o que falta na Wikipédia ----------
const back = {}; games.forEach(g => (back[g.w || g.t] ||= []).push(g.t));
const titles = Object.keys(back), thumbs = {};
for (let i = 0; i < titles.length; i += 50) {
  const batch = titles.slice(i, i + 50);
  try {
    const d = await (await get("https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=500&pilicense=any&pilimit=50&titles=" + encodeURIComponent(batch.join("|")))).json();
    const step = {}; [...(d.query.normalized || []), ...(d.query.redirects || [])].forEach(m => { step[m.from] = m.to; });
    const th = {}; Object.values(d.query.pages || {}).forEach(p => { if (p.thumbnail) th[p.title] = p.thumbnail.source; });
    batch.forEach(art => { let t = art; for (let k = 0; k < 3 && step[t]; k++) t = step[t]; thumbs[art] = th[t] || null; });
  } catch (e) { console.log("wiki", e.message); }
  await sleep(600);
}
const prices = JSON.parse(fs.readFileSync(ROOT + "data/prices.json", "utf8"));
const slug = t => "j-" + t.normalize("NFD").replace(/[^\w\s-]/g, "").trim().toLowerCase().replace(/\s+/g, "-");
const missing = games.filter(g => !g.img && !thumbs[g.w || g.t]).map(g => {
  const u = prices.p[slug(g.t)] && prices.p[slug(g.t)].st && prices.p[slug(g.t)].st.url;
  return { t: g.t, w: g.w || g.t, appid: u ? Number(u.split("/app/")[1]) : null };
});
const assets = await steamAssets([...new Set([...missing.map(m => m.appid).filter(Boolean), ...newIds])]);
missing.forEach(m => { if (m.appid && assets[m.appid]) m.capsule = assets[m.appid].capsule; });
result.new.forEach(r => { if (r.steam && assets[r.steam.appid]) Object.assign(r.steam, assets[r.steam.appid]); });
result.covers = { checked: titles.length, missing };

fs.writeFileSync(ROOT + "data/lookup.json", JSON.stringify(result, null, 1));
console.log("capas faltando:", missing.length);
