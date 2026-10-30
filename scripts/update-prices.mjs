// Zera — robô de preços.
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
const BAD = /soundtrack|trilha sonora|\bdlc\b|season pass|passe de temporada|\bpack\b|pacote|\bdemo\b|upgrade|artbook|bundle|cosmetic|skin|moedas|coins|points|pontos|virtual currency|expansion pass|costume|traje|ost\b|audiobook|audiolivro|piano|\bunlock\b|wallpaper|ringtone/i;
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
const STEAM_IDS = {"Elden Ring":1245620,"Sekiro: Shadows Die Twice":814380,"Baldur's Gate 3":1086940,"Cyberpunk 2077":1091500,"The Witcher 3: Wild Hunt":292030,"Red Dead Redemption 2":1174180,"Hogwarts Legacy":990080,"The Elder Scrolls V: Skyrim":489830,"Fallout 4":377160,"Hades":1145360,"Hades II":1145350,"Hollow Knight":367520,"Hollow Knight: Silksong":1030300,"Celeste":504230,"Stardew Valley":413150,"Balatro":2379780,"Cuphead":268910,"Stray":1332010,"Devil May Cry 5":601150,"Resident Evil 4":2050650,"Resident Evil Village":1196590,"Resident Evil 2":883710,"Resident Evil 3":952060,"Resident Evil 7: Biohazard":418370,"Monster Hunter Wilds":2246340,"Street Fighter 6":1364780,"Tekken 8":1778820,"Mortal Kombat 1":1971870,"God of War":1593500,"God of War Ragnarök":2322010,"Marvel's Spider-Man: Miles Morales":1817190,"Marvel's Spider-Man 2":2651280,"Ghost of Tsushima":2215430,"Horizon Forbidden West":2420110,"The Last of Us Part I":1888930,"The Last of Us Part II Remastered":2531310,"Returnal":1649240,"Ratchet & Clank: Em Uma Outra Dimensão":1895880,"Helldivers 2":553850,"Forza Horizon 5":1551360,"Persona 5 Royal":1687950,"Persona 3 Reload":2161700,"Lies of P":1627720,"Black Myth: Wukong":2358720,"Armored Core VI: Fires of Rubicon":1888160,"Dead Space":1693980,"Doom Eternal":782330,"Doom: The Dark Ages":3017860,"Starfield":1716740,"Indiana Jones e o Grande Círculo":2677660,"Sea of Thieves":1172620,"Hi-Fi Rush":1817230,"Clair Obscur: Expedition 33":1903340,"Kingdom Come: Deliverance II":1771300,"Silent Hill 2":2124490,"Apex Legends":1172470,"Final Fantasy XVI":2515020,"Final Fantasy VII Rebirth":2909400,"Final Fantasy VII Remake Intergrade":1462040,"Uncharted: Coleção Legado dos Ladrões":1659420,"Ori and the Will of the Wisps":1057090,"Gears 5":1097840,"Halo: The Master Chief Collection":976730,"Halo Infinite":1240440,"Like a Dragon: Infinite Wealth":2072450,"Tales of Arise":740130,"It Takes Two":1426210,"Split Fiction":2001120,"Star Wars Jedi: Survivor":1774580,"Assassin's Creed Shadows":3159330,"Prince of Persia: The Lost Crown":2751000,"Batman: Arkham Knight":208650,"Battlefield 6":2807960,"Sonic X Shadow Generations":2513280,"Sea of Stars":1244090,"Dragon Ball FighterZ":678950,"Dragon Ball Z: Kakarot":851850,"Dragon Ball Xenoverse 2":454650,"Dragon Ball Xenoverse":323470,"Dragon Ball: The Breakers":1272080,"Dragon Ball: Sparking! Zero":1790600,"Mass Effect Legendary Edition":1328670,"Diablo IV":2344520,"The Elder Scrolls IV: Oblivion Remastered":2623190,"Metaphor: ReFantazio":2679460,"Resident Evil 0":339340,"Resident Evil":304240,"Resident Evil 5":21690,"Resident Evil 6":221040,"Resident Evil Revelations":222480,"Resident Evil Revelations 2":287290,"Umbrella Corps":390340,"Grand Theft Auto IV":12210,"Final Fantasy VIII Remastered":1026680,"Final Fantasy IX":377840,"Final Fantasy X | X-2 HD Remaster":359870,"Final Fantasy XII: The Zodiac Age":595520,"Final Fantasy XIII":292120,"Final Fantasy XIII-2":292140,"Lightning Returns: Final Fantasy XIII":345350,"Final Fantasy XIV Online":39210,"Final Fantasy XV":637650,"Final Fantasy Type-0 HD":340170,"Dissidia Final Fantasy NT":921590,"World of Final Fantasy":552700,"Crisis Core – Final Fantasy VII – Reunion":1608070,"Nioh 2 Remastered":1325200,"Avowed":2457220,"The Outer Worlds 2":1449110,"Ninja Gaiden 4":2627260,"Stellar Blade":3489700,"Grand Theft Auto V":3240220,"Counter-Strike 2":730,"Marvel Rivals":2767030,"PUBG: Battlegrounds":578080,"Call of Duty: Black Ops 7":3606480,"Borderlands 4":1285190,"Mafia: The Old Country":1941540,"Elden Ring Nightreign":2622380,"Dark Souls III":374320,"Monster Hunter: World":582010,"Marvel's Spider-Man Remastered":1817070,"Days Gone":1259420,"Horizon Zero Dawn Remastered":2561580,"Death Stranding Director's Cut":1850570,"Detroit: Become Human":1222140,"Red Dead Redemption":2668510,"Hitman: World of Assassination":1659040,"Assassin's Creed Mirage":3035570,"Assassin's Creed Odyssey":812140,"Dying Light 2 Stay Human":534380,"Dead by Daylight":381210,"Palworld":1623730,"Terraria":105600,"Among Us":945360,"Euro Truck Simulator 2":227300,"The Sims 4":1222670,"Need for Speed Unbound":1846380,"NBA 2K26":3472040,"eFootball":1665460,"LEGO Star Wars: A Saga Skywalker":920210,"Crash Bandicoot N. Sane Trilogy":731490,"NieR:Automata":524220,"Persona 4 Golden":1113000,"Cult of the Lamb":1313140,"Dave the Diver":1868140,"Subnautica":264710,"Metal Gear Solid Delta: Snake Eater":2417610,"Lords of the Fallen":1501750,"Wo Long: Fallen Dynasty":1448440,"Rise of the Ronin":1340990,"Nioh 3":3681010,"Like a Dragon Gaiden: The Man Who Erased His Name":2375550,"Like a Dragon: Pirate Yakuza in Hawaii":3061810,"Judgment":2058180,"Persona 5 Strikers":1382330,"Assassin's Creed Origins":582160,"Far Cry 5":552520,"Tom Clancy's The Division 2":2221490,"Mafia: Definitive Edition":1030840,"Borderlands 3":397540,"Wolfenstein II: The New Colossus":612880,"Dishonored 2":403640,"Shadow of the Tomb Raider":750920,"Marvel's Guardians of the Galaxy":1088850,"Marvel's Midnight Suns":368260,"Batman: Arkham City":200260,"Injustice 2":627270,"Naruto x Boruto Ultimate Ninja Storm Connections":1020790,"Demon Slayer -Kimetsu no Yaiba- The Hinokami Chronicles":1490890,"One Piece Odyssey":814000,"Need for Speed Heat":1222680,"The Crew Motorfest":2698940,"Rust":252490,"ARK: Survival Ascended":2399830,"Don't Starve Together":322330,"Little Nightmares III":1392860,"The Outlast Trials":1304930,"Alien: Isolation":214490,"The Evil Within 2":601430,"Five Nights at Freddy's: Security Breach":747660,"Risk of Rain 2":632360,"The Binding of Isaac: Rebirth":250900,"Gris":683320,"Frostpunk 2":1601580,"Dark Souls: Remastered":570940,"Dark Souls II: Scholar of the First Sin":335300,"Sifu":2138710,"Ghostrunner":1139900,"Dead Cells":588650,"Slay the Spire":646570,"Vampire Survivors":1794680,"Hotline Miami":219150,"Inside":304430,"Little Nightmares II":860510,"A Plague Tale: Requiem":1182900,"Control":870780,"Remnant II":1282100,"Lethal Company":1966720,"Phasmophobia":739630,"Valheim":892970,"Satisfactory":526870,"RimWorld":294100,"Cities: Skylines II":949230,"Sid Meier's Civilization VII":1295660,"Total War: Warhammer III":1142710,"XCOM 2":268500,"Age of Empires II: Definitive Edition":813780,"Age of Empires IV":1466860,"Microsoft Flight Simulator 2024":2537590,"Dead Island 2":934700,"Dying Light: The Beast":3008130,"Sons of the Forest":1326470,"Outer Wilds":753640,"Disco Elysium":632470,"Divinity: Original Sin 2":435150,"Monster Hunter Rise":1446780,"Guilty Gear -Strive-":1384160,"NieR Replicant ver.1.22474487139...":1113560,"Octopath Traveler II":1971650,"Dragon Quest XI S":1295510,"Dragon's Dogma 2":2054970,"Metal Gear Solid V: The Phantom Pain":287700,"Tunic":553420,"Mortal Kombat 11":976310,"Titanfall 2":1237970,"Star Wars Jedi: Fallen Order":1172380,"Star Wars Outlaws":2842040,"Assassin's Creed Valhalla":2208920,"Far Cry 6":2369390,"Rainbow Six Siege X":359550,"Overwatch 2":2357570,"Destiny 2":1085660,"Warframe":230410,"Path of Exile 2":2694490,"Deep Rock Galactic":548430,"Left 4 Dead 2":550,"Portal 2":620,"Half-Life 2":220,"Ori and the Blind Forest":387290,"Psychonauts 2":607080,"Grounded":962130,"The Callisto Protocol":1544020,"Sonic Frontiers":1237320,"Spyro Reignited Trilogy":996580,"Kena: Bridge of Spirits":1954200,"Undertale":391540,"F1 25":3059520,"Bloons TD 6":960090};

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
    } catch (e) { unresolved.push(g.t + " (" + e.message + ")"); }
    if (hit && STEAM_IDS[g.t] && hit.id !== STEAM_IDS[g.t]) disagree.push(`${g.t}: busca=${hit.id} "${hit.name}" lista=${STEAM_IDS[g.t]}`);
    // a lista conferida tem prioridade sobre a busca (evita DLC, trilha sonora e relançamentos)
    if (STEAM_IDS[g.t] && (!hit || hit.id !== STEAM_IDS[g.t])) hit = { id: STEAM_IDS[g.t], name: g.t };
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
let psDebugSaved = false;
const PS_GQL = "https://web.np.playstation.com/api/graphql/v1/op";
const PS_HEADERS = { "content-type": "application/json", "x-psn-store-locale-override": "pt-BR", "apollographql-client-name": "@sie-ppr-web-store/app", origin: "https://store.playstation.com", referer: "https://store.playstation.com/" };
async function psDiscover() {
  const dbg = { chunks: 0, ops: {} };
  const html = await (await get("https://store.playstation.com/pt-br/search/god%20of%20war")).text();
  const urls = [...new Set([...html.matchAll(/(?:src|href)=["']([^"']+\.js)(?:\?[^"']*)?["']/g)].map(m => new URL(m[1], "https://store.playstation.com/pt-br/").href))].slice(0, 60);
  dbg.htmlLen = html.length; dbg.scripts = urls.slice(0, 40);
  for (const u of urls) {
    try {
      const js = await (await get(u, {}, 1)).text(); dbg.chunks++;
      for (const m of js.matchAll(/([A-Za-z]*[Ss]earch[A-Za-z]*)["']?\s*[:,]\s*[^;]{0,400}?["']([a-f0-9]{64})["']|["']([a-f0-9]{64})["'][^;]{0,400}?(get[A-Za-z]*[Ss]earch[A-Za-z]*)/g)) {
        const name = m[1] || m[4], hash = m[2] || m[3];
        (dbg.ops[name] ||= []).includes(hash) || dbg.ops[name].push(hash);
      }
      for (const m of js.matchAll(/\b(get[A-Z][A-Za-z]*Search[A-Za-z]*|[a-z]+Search[A-Z][A-Za-z]*|categoryGridRetrieve|metGet[A-Za-z]+)\b/g)) if (!(dbg.names ||= []).includes(m[1]) && dbg.names.length < 80) dbg.names.push(m[1]);
      const hx = js.match(/["'][a-f0-9]{64}["']/g); if (hx) dbg.hex = (dbg.hex || 0) + hx.length;
      const qi = js.indexOf("query getSearchResults"); if (qi >= 0 && !dbg.query) dbg.query = js.slice(qi, qi + 1500);
      for (const m of js.matchAll(/operationName\s*:\s*["']([A-Za-z]+)["'][^;]{0,300}?sha256Hash\s*:\s*["']([a-f0-9]{64})["']/g)) (dbg.ops[m[1]] ||= []).includes(m[2]) || dbg.ops[m[1]].push(m[2]);
    } catch (e) {}
  }
  dbg.chunkUrls = urls.length;
  return dbg;
}
async function psSearch(term, op, hash) {
  const vars = { searchTerm: term, searchContext: "MobileUniversalSearchGame", displayTitleLocale: "pt-BR", countryCode: "BR", languageCode: "pt", pageOffset: 0, pageSize: 20 };
  const url = `${PS_GQL}?operationName=${op}&variables=${encodeURIComponent(JSON.stringify(vars))}&extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }))}`;
  return (await get(url, { headers: PS_HEADERS }, 2)).json();
}
async function playstation() {
  let api = null, disc = null;
  try {
    disc = await psDiscover();
    outer: for (const [op, hashes] of Object.entries(disc.ops)) for (const h of hashes) {
      try {
        const r = await psSearch("God of War", op, h);
        let n = 0; walk(r, o => { if (typeof o.name === "string" && o.price) n++; });
        (disc.tries ||= []).push(`${op}:${h.slice(0, 8)} -> ${n} itens${r.errors ? " erro " + JSON.stringify(r.errors).slice(0, 120) : ""}`);
        if (n) { api = { op, h }; break outer; }
      } catch (e) { (disc.tries ||= []).push(`${op}:${h.slice(0, 8)} -> ${e.message}`); }
    }
  } catch (e) { disc = { error: e.message }; }
  fs.mkdirSync(ROOT + "data", { recursive: true });
  fs.writeFileSync(ROOT + "data/debug-ps.json", JSON.stringify({ api, disc }, null, 1).slice(0, 30000));
  psDebugSaved = true;
  if (api) return playstationApi(api);
  return playstationHtml();
}
async function playstationApi({ op, h }) {
  const list = games.filter(g => g.p.ps !== null && g.p.ps !== undefined && g.p.ps !== "pre");
  let ok = 0; const miss = []; let errors = 0;
  for (const g of list) {
    const term = searchName(g);
    try {
      const r = await psSearch(term, op, h);
      const cands = [];
      walk(r, o => { if (typeof o.name === "string" && o.price && typeof o.price === "object") cands.push(o); });
      const full = cands.filter(o => !o.storeDisplayClassification || /FULL_GAME|GAME_BUNDLE|PREMIUM_EDITION/.test(o.storeDisplayClassification) || /FULL_GAME/.test(JSON.stringify(o.localizedStoreDisplayClassification || "")));
      const hit = best(term, full.length ? full : cands, o => o.name) || best(g.t, full.length ? full : cands, o => o.name);
      if (!hit) { miss.push(g.t); await sleep(500); continue; }
      if (psPut(g, hit)) ok++; else miss.push(g.t + " (preço)");
    } catch (e) { errors++; miss.push(g.t + " (" + e.message + ")"); if (errors >= 6 && ok === 0) { miss.push("parado"); break; } }
    await sleep(500);
  }
  report("ps", { ok, total: list.length, errors, via: "api " + op, miss: miss.slice(0, 60) });
}
function psPut(g, hit) {
  const pr = hit.price;
  const b = pr.isFree ? 0 : pr.basePriceValue != null ? pr.basePriceValue / 100 : brNum(pr.basePrice);
  let f = pr.isFree ? 0 : pr.discountedValue != null ? pr.discountedValue / 100 : brNum(pr.discountedPrice);
  if (pr.isTiedToSubscription || (pr.serviceBranding || []).some(x => /PLUS/i.test(x))) f = b;
  if (b == null || f == null || isNaN(b) || isNaN(f)) return false;
  const pct = b > 0 && f < b ? Math.round((1 - f / b) * 100) : 0;
  const until = pr.endTime && /^\d+$/.test(String(pr.endTime)) ? new Date(Number(pr.endTime)).toISOString() : null;
  put(g.id, "ps", { b, f, pct, until, url: hit.id ? `https://store.playstation.com/pt-br/product/${hit.id}` : null, n: hit.name });
  return true;
}
async function playstationHtml() {
  const list = games.filter(g => g.p.ps !== null && g.p.ps !== undefined && g.p.ps !== "pre");
  let ok = 0; const miss = []; let errors = 0;
  for (const g of list) {
    const term = searchName(g);
    try {
      const html = await (await get(`https://store.playstation.com/pt-br/search/${encodeURIComponent(term)}`)).text();
      const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (!m) { miss.push(g.t + " (sem dados)"); continue; }
      const data = JSON.parse(m[1]);
      const refs = {};
      walk(data, o => { for (const [k, v] of Object.entries(o)) if (v && typeof v === "object" && !Array.isArray(v) && /^[A-Z][A-Za-z]+:/.test(k)) refs[k] = v; });
      const deref = v => { for (let i = 0; i < 4 && v && typeof v === "object"; i++) { const key = v.__ref || (v.type === "id" && v.id) || null; if (!key || !refs[key]) break; v = refs[key]; } return v; };
      const cands = [];
      walk(data, o => {
        if (typeof o.name !== "string") return;
        const pr = deref(o.price);
        if (pr && typeof pr === "object" && (pr.basePrice || pr.discountedPrice || pr.isFree || pr.basePriceValue != null)) cands.push({ ...o, price: pr });
      });
      if (!psDebugSaved) {
        psDebugSaved = true;
        const sample = []; walk(data, o => { if (sample.length < 6 && JSON.stringify(o).length < 1500 && /price/i.test(Object.keys(o).join(","))) sample.push(o); });
        fs.mkdirSync(ROOT + "data", { recursive: true });
        fs.writeFileSync(ROOT + "data/debug-ps.json", JSON.stringify({ term, topKeys: Object.keys(data.props || {}).concat(Object.keys((data.props || {}).pageProps || {})), refCount: Object.keys(refs).length, cands: cands.length, sample }, null, 1).slice(0, 20000));
      }
      const full = cands.filter(o => !o.storeDisplayClassification || /FULL_GAME|GAME_BUNDLE|PREMIUM_EDITION/.test(o.storeDisplayClassification));
      const hit = best(term, full.length ? full : cands, o => o.name) || best(g.t, full.length ? full : cands, o => o.name);
      if (!hit) { miss.push(g.t); continue; }
      const pr = hit.price;
      const b = pr.isFree ? 0 : pr.basePriceValue != null ? pr.basePriceValue / 100 : brNum(pr.basePrice);
      let f = pr.isFree ? 0 : pr.discountedValue != null ? pr.discountedValue / 100 : brNum(pr.discountedPrice);
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

// ---------- PLAYSTATION (via páginas oficiais) ----------
// 1) acha o código do produto na página do jogo em playstation.com/pt-br/games/<slug>/ (guardado em data/ps-ids.json)
// 2) lê o preço na página do produto na PS Store (preço normal e promoção para todos; ignora preços só para assinantes)
// Roda duas vezes por dia no horário agendado (ou sempre que o robô for disparado à mão).
const psSlugs = g => {
  const base = [g.w, g.t].filter(Boolean).map(t => t.replace(/\s*\((\d{4} )?video game\)$/i, ""));
  const sl = t => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/['’™®:.,!?]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const out = [];
  for (const t of base) { out.push(sl(t)); if (t.includes(":")) out.push(sl(t.split(":")[0])); out.push(sl(t.replace(/^(Marvel's|The)\s+/i, ""))); }
  return [...new Set(out)].filter(Boolean);
};
function psPickId(html) {
  const ids = [...new Set([...html.matchAll(/[A-Z]{2}\d{4}-[A-Z]{4}\d{5}_00-[A-Z0-9]{16}/g)].map(m => m[0]))];
  const plain = ids.filter(i => !/DELUX|ULTIM|GOLD|PREMIU|COMPLET|BUNDLE|SEASON|PASS|DLC|VIRTUAL|CURRENC|COINS|POINTS|EXPANS|UPGRADE|SOUNDTR|ARTBOOK/i.test(i.split("-")[2]));
  return plain.find(i => /-PPSA/.test(i)) || plain.find(i => /-CUSA/.test(i)) || ids[0] || null;
}
function psPricesFromProduct(html) {
  const outp = []; let i = 0;
  while ((i = html.indexOf('{"__typename":"Price"', i)) >= 0) {
    let d = 0, j = i;
    for (; j < html.length && j - i < 6000; j++) { if (html[j] === "{") d++; else if (html[j] === "}") { d--; if (!d) break; } }
    try { outp.push(JSON.parse(html.slice(i, j + 1))); } catch (e) {}
    i = j + 1;
  }
  return outp;
}
const PS_SLUGS = { "Resident Evil 4": ["resident-evil-4", "resident-evil-4-remake"], "Rainbow Six Siege X": ["tom-clancys-rainbow-six-siege-x", "tom-clancys-rainbow-six-siege"], "RimWorld": ["rimworld-console-edition"], "Dragon Quest XI S": ["dragon-quest-xi-s-echoes-of-an-elusive-age-definitive-edition"], "NieR Replicant ver.1.22474487139...": ["nier-replicant-ver122474487139"], "Grand Theft Auto: The Trilogy – The Definitive Edition": ["grand-theft-auto-the-trilogy-the-definitive-edition"], "Hades II": ["hades-ii", "hades-2"], "Remnant II": ["remnant-2", "remnant-ii"] };
const ROMAN = { ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10", xi: "11", xii: "12", xiii: "13", xiv: "14", xv: "15", xvi: "16" };
const decodeHtml = t => String(t || "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const psClean = n => decodeHtml(n).replace(/\s*\|.*$/, "").replace(/\(PlayStation®?\s*\d\)|PS4\s*(&|＆|e|and)\s*PS5|PS5\s*(&|＆|e|and)\s*PS4|\bPS[45]\b|Edição Padrão|Standard Edition|Edição Standard|™|®/gi, " ").replace(/\(\s*(e|&|＆|and)?\s*\)|\[\s*\]|\s[&＆]\s*$/g, " ").replace(/\s+/g, " ").trim();
const PS_EXTRA = /deluxe|ultimate|gold|premium|complet[ae]|bundle|pacote|collection|cole[cç][aã]o|beyond the dawn|season pass|passe de temporada|cross-gen|vault|cofre|digital deluxe/i;
function psIds(html) {
  const ids = [...new Set([...html.matchAll(/[A-Z]{2}\d{4}-[A-Z]{4}\d{5}_00-[A-Z0-9]{16}/g)].map(m => m[0]))];
  const plain = ids.filter(i => !/DELUX|ULTIM|GOLD|PREMIU|COMPLET|BUNDLE|SEASON|PASS|DLC|VIRTUAL|CURRENC|COINS|POINTS|EXPANS|UPGRADE|SOUNDTR|ARTBOOK|DEMO|TRIAL/i.test(i.split("-")[2]));
  return [...plain.filter(i => /-PPSA/.test(i)), ...plain.filter(i => /-CUSA/.test(i))];
}
async function playstationWeb() {
  const list = games.filter(g => g.p.ps !== null && g.p.ps !== undefined && g.p.ps !== "pre");
  let cache = {}; try { cache = JSON.parse(fs.readFileSync(ROOT + "data/ps-ids.json", "utf8")); } catch (e) {}
  let ok = 0, found = 0, errors = 0; const miss = [], usedIds = {};
  const matches = (g, name) => {
    const extra = (name.match(new RegExp(PS_EXTRA.source, "gi")) || []).filter(w => !new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(g.t + " " + (g.w || "")));
    return !extra.length && Math.max(score(searchName(g), name), score(g.t, name)) >= 74;
  };
  async function readProduct(id) {
    const url = `https://store.playstation.com/pt-br/product/${id}`;
    const html = await (await get(url, {}, 2)).text();
    const name = psClean((html.match(/<title>([^<]+)<\/title>/) || [])[1] || "");
    const prices = psPricesFromProduct(html).filter(p => !p.isTiedToSubscription && !(p.serviceBranding || []).some(x => /PLUS|EA_ACCESS|UBISOFT|GAME_?PASS/i.test(x)) && (p.isFree || p.basePriceValue > 0));
    return { url, name, pr: prices[0] || null };
  }
  for (const g of list) {
    try {
      let hit = null;
      const cached = g.psid || (cache[g.t] && cache[g.t].id);
      if (cached && !usedIds[cached]) {
        const r = await readProduct(cached); await sleep(500);
        if (r.pr && (g.psid || matches(g, r.name))) hit = { id: cached, ...r }; else if (!g.psid) delete cache[g.t];
      }
      const old = cache[g.t];
      if (!hit && !(old && old.none && Date.now() - new Date(old.at) < 7 * 864e5)) {
        const tried = new Set();
        const slugs = [...(PS_SLUGS[g.t] || []), ...psSlugs(g)];
        slugs.slice().forEach(sl => { const parts = sl.split("-"); const r = parts.map(w => ROMAN[w] || w).join("-"); if (r !== sl) slugs.push(r); });
        outer: for (const sl of [...new Set(slugs)]) {
          const r = await fetch(`https://www.playstation.com/pt-br/games/${sl}/`, { headers: { "user-agent": UA, "accept-language": "pt-BR" } });
          await sleep(400);
          if (!r.ok) continue;
          for (const id of psIds(await r.text()).slice(0, 9)) {
            if (tried.has(id) || usedIds[id]) continue; tried.add(id);
            const p = await readProduct(id); await sleep(500);
            if (p.pr && matches(g, p.name)) { hit = { id, ...p }; found++; break outer; }
          }
        }
        cache[g.t] = hit ? { id: hit.id, at: new Date().toISOString() } : { none: true, at: new Date().toISOString() };
      }
      if (!hit) { miss.push(g.t); continue; }
      usedIds[hit.id] = g.t;
      const pr = hit.pr;
      const b = pr.isFree ? 0 : pr.basePriceValue / 100, f = pr.isFree ? 0 : (pr.discountedValue != null ? pr.discountedValue : pr.basePriceValue) / 100;
      const pct = b > 0 && f < b ? Math.round((1 - f / b) * 100) : 0;
      const until = pr.endTime && /^\d+$/.test(String(pr.endTime)) ? new Date(Number(pr.endTime)).toISOString() : null;
      put(g.id, "ps", { b: round2(b), f: round2(f), pct, until, url: hit.url, n: hit.name || g.t });
      ok++;
    } catch (e) { errors++; miss.push(g.t + " (" + e.message + ")"); if (errors >= 12 && ok === 0) { miss.push("parado"); break; } }
  }
  fs.mkdirSync(ROOT + "data", { recursive: true });
  fs.writeFileSync(ROOT + "data/ps-ids.json", JSON.stringify(cache, null, 0));
  report("ps", { ok, total: list.length, novosIds: found, errors, via: "páginas oficiais", miss: miss.slice(0, 80) });
}
async function playstationScheduled() {
  const forced = process.env.GITHUB_EVENT_NAME && process.env.GITHUB_EVENT_NAME !== "schedule";
  if (forced || new Date().getUTCHours() % 12 < 3) return playstationWeb();
  // fora do horário: mantém os preços do PlayStation da última leitura (até 2 dias)
  try {
    const prev = JSON.parse(fs.readFileSync(ROOT + "data/prices.json", "utf8"));
    let n = 0;
    if (Date.now() - new Date(prev.updated).getTime() < 2 * 864e5) for (const [gid, st] of Object.entries(prev.p || {})) if (st.ps) { put(gid, "ps", st.ps); n++; }
    report("ps", { ok: n, skipped: true, via: "última leitura" });
  } catch (e) { report("ps", { ok: 0, skipped: true }); }
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
const epicEndpoints = ["https://store.epicgames.com/graphql", "https://graphql.epicgames.com/graphql"];
async function epicFree() {
  try {
    const d = await (await get("https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=pt-BR&country=BR&allowCountries=BR")).json();
    const els = d.data.Catalog.searchStore.elements || [];
    const now = Date.now(), list = [];
    for (const e of els) {
      const pr = e.promotions || {};
      const cur = ((pr.promotionalOffers || [])[0] || {}).promotionalOffers || [];
      const up = ((pr.upcomingPromotionalOffers || [])[0] || {}).promotionalOffers || [];
      const free = o => o.discountSetting && o.discountSetting.discountPercentage === 0;
      const live = cur.find(o => free(o) && new Date(o.startDate) <= now && new Date(o.endDate) > now);
      const next = up.find(free);
      if (!live && !next) continue;
      const ki = e.keyImages || [];
      const img = (["OfferImageWide", "DieselStoreFrontWide", "featuredMedia", "Thumbnail", "OfferImageTall"].map(t => ki.find(k => k.type === t)).find(Boolean) || ki[0] || {}).url || null;
      const slugP = (e.offerMappings || []).find(x => x.pageType === "productHome")?.pageSlug || (e.catalogNs && (e.catalogNs.mappings || [])[0] || {}).pageSlug || e.productSlug || e.urlSlug;
      const hitG = best(e.title, games, g => searchName(g));
      list.push({ name: e.title, img, now: !!live, from: (live || next).startDate, until: (live || next).endDate, b: round2(((e.price || {}).totalPrice || {}).originalPrice / 100 || 0), url: slugP ? `https://store.epicgames.com/pt-BR/p/${String(slugP).replace(/\/home$/, "")}` : "https://store.epicgames.com/pt-BR/free-games", id: hitG ? hitG.id : null });
    }
    out.top.epFree = list;
    report("epFree", { ok: list.length });
  } catch (e) { report("epFree", { error: e.message }); }
}
// A busca de preços da Epic fica atrás de bloqueio anti-robô; a vitrine pública (storefrontLayout) continua aberta
// e traz centenas de jogos com preço em reais, incluindo as promoções em destaque. Usamos o que aparecer lá.
async function epicStorefront() {
  const list = games.filter(g => g.p.ep !== null && g.p.ep !== undefined);
  const offers = new Map();
  for (const start of [0, 30, 60]) {
    try {
      const d = await (await get(`https://store-site-backend-static-ipv4.ak.epicgames.com/storefrontLayout?locale=pt-BR&country=BR&start=${start}&count=30`)).json();
      walk(d, o => {
        const tp = o && o.price && o.price.totalPrice;
        if (typeof o.title !== "string" || !tp || tp.currencyCode !== "BRL" || typeof tp.originalPrice !== "number") return;
        const slugP = ((o.offerMappings || []).find(x => x.pageType === "productHome") || {}).pageSlug || (((o.catalogNs || {}).mappings || [])[0] || {}).pageSlug || o.productSlug || o.urlSlug;
        const rule = (((o.price.lineOffers || [])[0] || {}).appliedRules || [])[0];
        const dec = Math.pow(10, (tp.currencyInfo && tp.currencyInfo.decimals) || 2);
        const prev = offers.get(o.title);
        const v = { title: o.title, b: round2(tp.originalPrice / dec), f: round2(tp.discountPrice / dec), until: rule && rule.endDate || null, url: slugP ? `https://store.epicgames.com/pt-BR/p/${String(slugP).replace(/\/home$/, "")}` : null };
        if (!prev || v.f < prev.f) offers.set(o.title, v);
      });
    } catch (e) { report("epErr" + start, { error: e.message }); }
    await sleep(800);
  }
  const all = [...offers.values()].filter(o => !BAD.test(o.title));
  let ok = 0;
  for (const g of list) {
    const strict = t => { let top = null; for (const o of all) { const sc = score(t, o.title); if (sc >= 92 && (!top || sc > top.sc)) top = { o, sc }; } return top && top.o; };
    const hit = strict(searchName(g)) || strict(g.t);
    if (!hit) continue;
    put(g.id, "ep", { b: hit.b, f: hit.f, pct: hit.b > 0 && hit.f < hit.b ? Math.round((1 - hit.f / hit.b) * 100) : 0, until: hit.until, url: hit.url, n: hit.title });
    ok++;
  }
  report("ep", { ok, total: list.length, ofertasNaVitrine: all.length, via: "vitrine pública da Epic" });
}
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
      const body = JSON.stringify({ query: Q, variables: { keywords: term, country: "BR", locale: "pt-BR", count: 10 } });
      let r;
      for (const ep of epicEndpoints) {
        try { r = await (await get(ep, { method: "POST", headers: { "content-type": "application/json", origin: "https://store.epicgames.com", referer: "https://store.epicgames.com/pt-BR/" }, body }, 1)).json(); epicEndpoints.splice(0, epicEndpoints.length, ep); break; }
        catch (e) { if (ep === epicEndpoints[epicEndpoints.length - 1]) throw e; }
      }
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

// ---------- GOOGLE PLAY ----------
// Para jogos pagos com "gpid" (pacote do app): lê o preço atual na página da loja.
// Se estiver abaixo do preço normal do catálogo, é promoção.
async function googlePlay() {
  const list = games.filter(g => g.gpid && typeof g.p.gp === "number" && g.p.gp > 0);
  let ok = 0; const miss = []; let errors = 0;
  for (const g of list) {
    try {
      const url = `https://play.google.com/store/apps/details?id=${g.gpid}&hl=pt_BR&gl=BR`;
      const html = await (await get(url)).text();
      const m = html.match(/R\$\s?([\d.]+,\d{2})/);
      if (!m) { miss.push(g.t + " (sem preço)"); continue; }
      const f = round2(Number(m[1].replace(/\./g, "").replace(",", ".")));
      const base = g.p.gp;
      if (!(f > base * 0.15 && f < base * 2)) { miss.push(g.t + " (preço estranho " + f + ")"); continue; }
      const b = Math.max(base, f), pct = f < b * 0.98 ? Math.round((1 - f / b) * 100) : 0;
      put(g.id, "gp", { b, f, pct, until: null, url, n: g.t });
      ok++;
    } catch (e) { errors++; miss.push(g.t + " (" + e.message + ")"); }
    await sleep(700);
  }
  report("gp", { ok, total: list.length, errors, miss: miss.slice(0, 30) });
}

// ---------- APP STORE (busca pública da Apple, Brasil) ----------
async function appStore() {
  const list = games.filter(g => g.p.ap !== null && g.p.ap !== undefined && g.p.ap !== "Netflix" && g.p.ap !== "pre");
  let ok = 0; const miss = []; let errors = 0;
  for (const g of list) {
    const term = searchName(g);
    try {
      const d = await (await get(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=br&entity=software&limit=15&lang=pt_br`)).json();
      const items = (d.results || []).filter(x => x.kind === "software" && ((x.genres || []).includes("Games") || (x.genres || []).includes("Jogos") || x.primaryGenreName === "Games" || x.primaryGenreName === "Jogos"));
      const hit = best(term, items, x => x.trackName) || best(g.t, items, x => x.trackName);
      if (!hit || typeof hit.price !== "number") { miss.push(g.t); await sleep(2500); continue; }
      const f = round2(hit.price), base = typeof g.p.ap === "number" ? g.p.ap : null;
      if (base > 0 && f === 0) { miss.push(g.t + " (grátis para baixar, desbloqueio dentro do app)"); await sleep(2500); continue; }
      if (base && f > 0 && (f > base * 2.6 || f < base * 0.15)) { miss.push(g.t + " (preço estranho " + f + ")"); await sleep(2500); continue; }
      // a Apple só informa o preço atual (sem o preço "de"), então não marcamos promoção
      put(g.id, "ap", { b: f, f, pct: 0, until: null, url: hit.trackViewUrl ? hit.trackViewUrl.split("?")[0] : null, n: hit.trackName });
      ok++;
    } catch (e) { errors++; miss.push(g.t + " (" + e.message + ")"); }
    await sleep(2500);
  }
  report("ap", { ok, total: list.length, errors, miss: miss.slice(0, 40) });
}

// ---------- execução ----------
const steps = { st: steam, ps: playstationScheduled, xb: xbox, ep: epicStorefront, epFree: epicFree, gp: googlePlay, ap: appStore };
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
  for (const k of ["st", "stSpecials", "epFree"]) if (!out.top[k] && prev.top && prev.top[k]) out.top[k] = prev.top[k];
} catch (e) {}

fs.mkdirSync(ROOT + "data", { recursive: true });
const report_ = out.report; delete out.report;
fs.writeFileSync(ROOT + "data/prices.json", JSON.stringify(out));
fs.writeFileSync(ROOT + "data/prices-report.json", JSON.stringify({ updated: out.updated, ...report_ }, null, 1));
const n = Object.values(out.p).reduce((a, s) => a + Object.keys(s).length, 0);
console.log("preços gravados:", n);
