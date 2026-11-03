// Robô das páginas dos jogos: gera uma página estática por jogo em jogo/<slug>/index.html,
// a lista jogo/index.html, sitemap.xml e robots.txt. Assim o Google lê preço, nota e descrição
// de cada jogo, e o link compartilhado mostra capa e título certos.
import fs from "node:fs";
import vm from "node:vm";

const BASE = (process.env.SITE_URL || "https://zerajogos.com.br").replace(/\/$/, "");
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };

const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync("games.js", "utf8"), ctx);
const idOf = t => "j-" + t.normalize("NFD").replace(/[^\w\s-]/g, "").trim().toLowerCase().replace(/\s+/g, "-");
const slugOf = id => id.slice(2).replace(/_/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
const games = ctx.window.GAMES.map(g => ({ ...g, id: idOf(g.t) }));
const LIVE = read("data/prices.json", { p: {} }).p || {};
const SCENES = read("data/scenes.json", {});
const ADDED = read("data/added.json", {}).games || {};

const STORES = [
  ["ps", "PlayStation Store", "PS5 e PS4", q => "https://store.playstation.com/pt-br/search/" + encodeURIComponent(q)],
  ["xb", "Microsoft Store", "Xbox Series e Xbox One", q => "https://www.xbox.com/pt-BR/search?q=" + encodeURIComponent(q)],
  ["st", "Steam", "PC", q => "https://store.steampowered.com/search/?term=" + encodeURIComponent(q)],
  ["ep", "Epic Games Store", "PC", q => "https://store.epicgames.com/pt-BR/browse?q=" + encodeURIComponent(q)],
  ["gp", "Google Play", "Android", q => "https://play.google.com/store/search?c=apps&hl=pt_BR&q=" + encodeURIComponent(q)],
  ["ap", "App Store", "iPhone e iPad", q => "https://apps.apple.com/br/search?term=" + encodeURIComponent(q)]
];
const PLAT = { ps: "PlayStation", xb: "Xbox", st: "PC", ep: "PC", gp: "Android", ap: "iOS" };

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = v => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = v => typeof v === "number";
const cut = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length <= n ? s : s.slice(0, s.lastIndexOf(" ", n - 1)).replace(/[,.;:]$/, "") + "…"; };
const scoreClass = n => n == null ? "none" : n >= 85 ? "good" : n >= 70 ? "mid" : "bad";

// slugs únicos
const seen = new Set();
games.forEach(g => { let s = slugOf(g.id) || "jogo", k = s, i = 2; while (seen.has(k)) k = `${s}-${i++}`; seen.add(k); g.slug = k; });

// capa: própria do catálogo > Wikipédia (mesma fonte do site) > cabeçalho da Steam
const steamId = g => g.stid ? String(g.stid) : ((LIVE[g.id]?.st?.url || "").match(/\/app\/(\d+)/) || [])[1];
const steamHeader = g => { const a = steamId(g); return a ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${a}/header.jpg` : null; };
const WIKI = read("data/seo-covers.json", {});
async function wikiCovers() {
  const want = [...new Set(games.filter(g => !g.img && g.w && !(g.w in WIKI)).map(g => g.w))];
  for (let i = 0; i < want.length; i += 50) {
    const batch = want.slice(i, i + 50);
    try {
      const url = "https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=500&pilicense=any&pilimit=50&titles=" + encodeURIComponent(batch.join("|"));
      const d = await (await fetch(url, { headers: { "User-Agent": "ZeraBot/1.0 (" + BASE + ")" } })).json();
      const step = {}; [...(d.query.normalized || []), ...(d.query.redirects || [])].forEach(m => { step[m.from] = m.to; });
      const th = {}; Object.values(d.query.pages || {}).forEach(p => { if (p.thumbnail) th[p.title] = p.thumbnail.source; });
      batch.forEach(a => { let t = a; for (let k = 0; k < 3 && step[t]; k++) t = step[t]; WIKI[a] = th[t] || ""; });
    } catch (e) { console.log("wikipédia:", e.message); }
  }
  fs.writeFileSync("data/seo-covers.json", JSON.stringify(WIKI));
}
const coverOf = g => g.img || (g.w && WIKI[g.w]) || steamHeader(g) || "";
const abs = u => !u ? `${BASE}/icons/share.png` : /^https?:/.test(u) ? u : `${BASE}/${u}`;

// preços: o do robô (ao vivo) quando existe; senão o de referência do catálogo
function prices(g) {
  const out = [];
  for (const [k, name, plat, search] of STORES) {
    const ref = g.p?.[k], lv = LIVE[g.id]?.[k];
    if (lv && num(lv.f)) out.push({ k, name, plat, now: lv.f, was: lv.pct > 0 && lv.f > 0 ? lv.b : null, pct: lv.pct > 0 && lv.f > 0 ? lv.pct : 0, until: lv.until || null, url: lv.url || search(g.t), live: true });
    else if (ref === null || ref === undefined) continue;
    else out.push({ k, name, plat, now: num(ref) ? ref : null, label: ref === "?" ? "Ver na loja" : ref === "pre" ? "Pré-venda" : ref === "Netflix" ? "Netflix" : null, url: search(g.t), live: false });
  }
  return out;
}

const CSS = `:root{--bg:#0D0F14;--bg-2:#12151C;--surface:#171B23;--raised:#1F242E;--line:#282E3A;--fg:#F4F6F8;--muted:#A3ACBB;--faint:#6B7384;--brand:#C6FF3D;--brand-ink:#0D0F14;--brand-text:#C6FF3D;--good:#3DD68C;--mid:#FFC83D;--bad:#FF6B5B;--display:"Unbounded","Arial Black",system-ui,sans-serif;--body:"Onest",system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"JetBrains Mono",ui-monospace,Menlo,monospace;color-scheme:dark}
@media (prefers-color-scheme:light){:root[data-theme="system"]{--bg:#F2F3F5;--bg-2:#E8EAEE;--surface:#FFFFFF;--raised:#F4F5F7;--line:#DDE1E7;--fg:#0D0F14;--muted:#555D6D;--faint:#8A919E;--brand-text:#4A7A00;--good:#138A52;--mid:#9A6B00;--bad:#C93A2B;color-scheme:light}}
:root[data-theme="light"]{--bg:#F2F3F5;--bg-2:#E8EAEE;--surface:#FFFFFF;--raised:#F4F5F7;--line:#DDE1E7;--fg:#0D0F14;--muted:#555D6D;--faint:#8A919E;--brand-text:#4A7A00;--good:#138A52;--mid:#9A6B00;--bad:#C93A2B;color-scheme:light}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 var(--body)}
a{color:inherit}img{max-width:100%;display:block}
.wrap{max-width:1040px;margin:0 auto;padding:0 16px}
.top{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.top .wrap{display:flex;align-items:center;gap:12px;height:58px}
.brand{display:flex;align-items:center;gap:9px;text-decoration:none;font:800 19px var(--display);letter-spacing:-.02em}
.brand i{width:28px;height:28px;border-radius:8px;background:var(--brand);display:grid;place-items:center}.brand i::after{content:"";width:14px;height:14px;border-radius:50%;border:3px solid var(--brand-ink)}
.top .go{margin-left:auto;text-decoration:none;font-weight:600;font-size:14px;padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--surface)}
.crumb{font-size:13px;color:var(--faint);margin:18px 0 0}.crumb a{color:var(--muted);text-decoration:none}.crumb a:hover{color:var(--fg)}
.hero{position:relative;margin:14px 0 0;border-radius:22px;overflow:hidden;background:var(--surface);border:1px solid var(--line)}
.hero .bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:blur(3px) brightness(.45);transform:scale(1.04)}
.hero .in{position:relative;display:grid;grid-template-columns:200px 1fr;gap:24px;padding:24px;align-items:end;min-height:300px}
.hero .cv{aspect-ratio:3/4;border-radius:14px;overflow:hidden;background:var(--raised);box-shadow:0 18px 50px rgba(0,0,0,.45)}.hero .cv img{width:100%;height:100%;object-fit:cover}
.hero.has-bg{color:#F4F6F8}.hero.has-bg .meta{color:#C9CFDA}
h1{font:800 clamp(26px,5vw,42px)/1.08 var(--display);letter-spacing:-.025em;margin:0 0 10px}
.meta{display:flex;flex-wrap:wrap;gap:6px 14px;color:var(--muted);font-size:14px;margin:0}
.score{display:inline-flex;align-items:center;gap:8px;margin-top:14px;font-weight:600;font-size:14px}
.score b{font:700 18px var(--mono);width:48px;height:48px;border-radius:50%;display:grid;place-items:center;border:3px solid currentColor}
.score.good b{color:var(--good)}.score.mid b{color:var(--mid)}.score.bad b{color:var(--bad)}
.ctas{grid-column:2;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;font-size:13px;color:#C9CFDA}.hero:not(.has-bg) .ctas{color:var(--muted)}.cta{display:inline-flex;align-items:center;gap:8px;background:var(--brand);color:var(--brand-ink);text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px}
section{margin:30px 0}h2{font:700 20px var(--display);letter-spacing:-.01em;margin:0 0 12px}
.desc{color:var(--muted);max-width:70ch;margin:0}
.prices{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.prices li a{display:grid;grid-template-columns:1fr auto;gap:2px 14px;align-items:center;text-decoration:none;padding:14px 16px;border-radius:14px;background:var(--surface);border:1px solid var(--line)}
.prices li a:hover{border-color:var(--brand)}
.prices .st{font-weight:700}.prices .pl{grid-column:1;color:var(--faint);font-size:13px}
.prices .pr{grid-row:1/3;grid-column:2;text-align:right;font:700 17px var(--mono)}.prices .pr s{display:block;font:500 12px var(--mono);color:var(--faint)}
.prices .pr em{font-style:normal;font-size:12px;background:var(--brand);color:var(--brand-ink);padding:2px 7px;border-radius:6px;margin-right:6px;vertical-align:2px}
.prices .free{color:var(--good)}
.note{font-size:13px;color:var(--faint);margin:10px 0 0}
table{width:100%;border-collapse:collapse;font-size:15px}td,th{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line)}th{color:var(--faint);font-weight:600;font-size:13px}td:last-child{text-align:right;font-family:var(--mono)}
.trailer{display:block;position:relative;max-width:560px;border-radius:14px;overflow:hidden;aspect-ratio:16/9;background:var(--raised)}.trailer img{width:100%;height:100%;object-fit:cover}
.trailer span{position:absolute;inset:auto auto 14px 14px;background:rgba(0,0,0,.7);color:#fff;font-weight:700;padding:8px 14px;border-radius:999px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px}
.grid a{text-decoration:none;font-size:14px;font-weight:600}.grid .cv{aspect-ratio:3/4;border-radius:12px;overflow:hidden;background:var(--raised);margin-bottom:6px;display:grid;place-items:center;color:var(--faint);font:800 28px var(--display)}.grid .cv img{width:100%;height:100%;object-fit:cover}
.grid small{display:block;color:var(--faint);font-weight:500;font-family:var(--mono)}
.letters{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 18px}.letters a{font:600 13px var(--mono);text-decoration:none;padding:6px 10px;border-radius:8px;background:var(--surface);border:1px solid var(--line)}
.az h2{margin-top:26px}.az ul{columns:2 260px;margin:0;padding:0 0 0 18px}.az li{margin:3px 0}.az a{text-decoration:none}.az a:hover{color:var(--brand-text)}
footer{border-top:1px solid var(--line);margin-top:40px;padding:22px 0 36px;color:var(--faint);font-size:13px}footer a{color:var(--muted)}footer p{margin:4px 0}
@media (max-width:640px){.hero .in{grid-template-columns:104px 1fr;gap:14px;padding:16px;min-height:0;align-items:center}.ctas{grid-column:1/-1}.cta{flex:1;justify-content:center}.score b{width:42px;height:42px;font-size:16px}}`;

const head = ({ title, desc, url, image, ld }) => `<!doctype html>
<html lang="pt-BR" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<script>try{var t=localStorage.getItem("zera-tema")||"dark";document.documentElement.setAttribute("data-theme",t)}catch(e){document.documentElement.setAttribute("data-theme","dark")}</script>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#0D0F14">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Zera">
<meta property="og:locale" content="pt_BR">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%23C6FF3D'/%3E%3Ccircle cx='32' cy='32' r='14' fill='none' stroke='%230D0F14' stroke-width='6'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@700;800&family=Onest:wght@400;600;700&family=JetBrains+Mono:wght@500;700&display=swap">
<style>${CSS}</style>
${ld.map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head>
<body>
<header class="top"><div class="wrap"><a class="brand" href="${BASE}/"><i></i>Zera</a><a class="go" href="${BASE}/jogo/">Todos os jogos</a></div></header>
<main class="wrap">`;

const foot = `</main>
<footer><div class="wrap">
<p><a href="${BASE}/">Zera</a> compara notas e preços de jogos nas lojas digitais do Brasil. Os preços são conferidos automaticamente e podem mudar: o que vale é o da loja na hora da compra.</p>
<p><a href="${BASE}/#privacidade">Privacidade</a> · <a href="${BASE}/#termos">Termos de Uso</a> · <a href="https://www.instagram.com/zera.corporation/" rel="noopener">@zera.corporation</a></p>
</div></footer>
</body>
</html>
`;

function priceHTML(p) {
  if (p.now === null) return `<span class="pr">${esc(p.label || "Ver na loja")}</span>`;
  if (p.now === 0) return `<span class="pr free">Grátis</span>`;
  return `<span class="pr">${p.pct ? `<em>-${p.pct}%</em>` : ""}${brl(p.now)}${p.was ? `<s>${brl(p.was)}</s>` : ""}</span>`;
}

function gamePage(g, related) {
  const url = `${BASE}/jogo/${g.slug}/`, cover = coverOf(g), scene = SCENES[g.t];
  const ps = prices(g), paid = ps.filter(p => num(p.now));
  const min = paid.length ? Math.min(...paid.map(p => p.now)) : null;
  const sale = ps.filter(p => p.pct).sort((a, b) => b.pct - a.pct)[0];
  const plats = [...new Set(ps.map(p => PLAT[p.k]))];
  const title = `${g.t}: preço${plats.length ? " no " + plats.join(", ").replace(/, ([^,]*)$/, " e $1") : ""} e nota | Zera`;
  const lead = min === 0 ? "Grátis" : min !== null ? `A partir de ${brl(min)}` : g.pre ? "Em pré-venda" : "Veja onde comprar";
  const desc = cut(`${lead}${sale ? ` (até -${sale.pct}% na ${sale.name})` : ""}. ${g.n != null ? `Nota ${g.n}. ` : ""}${g.desc || ""}`, 158);
  const ld = [{
    "@context": "https://schema.org", "@type": "VideoGame", name: g.t, url, description: cut(g.desc, 300) || undefined,
    image: cover ? abs(cover) : undefined, genre: g.g || undefined, datePublished: g.y ? String(g.y) : undefined,
    author: g.d ? { "@type": "Organization", name: g.d } : undefined,
    gamePlatform: plats.length ? plats : undefined,
    offers: paid.length ? { "@type": "AggregateOffer", priceCurrency: "BRL", lowPrice: min.toFixed(2), highPrice: Math.max(...paid.map(p => p.now)).toFixed(2), offerCount: paid.length } : undefined
  }, {
    "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Zera", item: `${BASE}/` },
      { "@type": "ListItem", position: 2, name: "Jogos", item: `${BASE}/jogo/` },
      { "@type": "ListItem", position: 3, name: g.t, item: url }]
  }];
  const bg = scene ? `${BASE}/${scene}` : "";
  return head({ title, desc, url, image: abs(scene || cover), ld }) + `
<p class="crumb"><a href="${BASE}/">Zera</a> › <a href="${BASE}/jogo/">Jogos</a> › ${esc(g.t)}</p>
<div class="hero${bg ? " has-bg" : ""}">${bg ? `<div class="bg" style="background-image:url('${esc(bg)}')"></div>` : ""}
<div class="in">
<div class="cv">${cover ? `<img src="${esc(cover)}" alt="Capa de ${esc(g.t)}" width="200" height="267" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}</div>
<div>
<h1>${esc(g.t)}</h1>
<p class="meta">${[g.y && (g.pre ? `Chega ${esc(g.pre)}` : esc(g.y)), g.g && esc(g.g), g.d && esc(g.d), plats.length && esc(plats.join(" · "))].filter(Boolean).map(s => `<span>${s}</span>`).join("")}</p>
${g.n != null ? `<div class="score ${scoreClass(g.n)}"><b>${g.n}</b>Nota da crítica</div>` : ""}
</div>
<div class="ctas"><a class="cta" href="${BASE}/#${g.id}">Abrir no Zera</a><span>Favoritar, carrinho e amigos</span></div>
</div></div>
${g.desc ? `<section><h2>Sobre o jogo</h2><p class="desc">${esc(g.desc)}</p></section>` : ""}
${ps.length ? `<section><h2>Preço de ${esc(g.t)} em cada loja</h2>
<ul class="prices">${ps.map(p => `<li><a href="${esc(p.url)}" rel="nofollow noopener" target="_blank"><span class="st">${esc(p.name)}</span><span class="pl">${esc(p.plat)}${p.until ? ` · promoção até ${esc(new Date(p.until).toLocaleDateString("pt-BR"))}` : ""}</span>${priceHTML(p)}</a></li>`).join("")}</ul>
<p class="note">Preços em reais conferidos automaticamente pelo robô do Zera${LIVE[g.id] ? "" : " (preços de referência)"}. O que vale é o preço da loja na hora da compra.</p></section>` : ""}
${Array.isArray(g.ed) && g.ed.length > 1 ? `<section><h2>Edições</h2><table><thead><tr><th>Edição</th><th>O que vem</th><th>Preço</th></tr></thead><tbody>${g.ed.map(e => `<tr><td>${esc(e[0])}</td><td>${esc(e[1])}</td><td>${num(e[2]) ? (e[2] === 0 ? "Grátis" : brl(e[2])) : "–"}</td></tr>`).join("")}</tbody></table></section>` : ""}
${g.yt ? `<section><h2>Trailer</h2><a class="trailer" href="https://www.youtube.com/watch?v=${esc(g.yt)}" rel="noopener" target="_blank"><img src="https://i.ytimg.com/vi/${esc(g.yt)}/hqdefault.jpg" alt="Trailer de ${esc(g.t)}" loading="lazy"><span>▶ Ver trailer no YouTube</span></a></section>` : ""}
${related.length ? `<section><h2>Jogos parecidos</h2><div class="grid">${related.map(cardHTML).join("")}</div></section>` : ""}
` + foot;
}

function cardHTML(r) {
  const c = coverOf(r), ps = prices(r).filter(p => num(p.now)), min = ps.length ? Math.min(...ps.map(p => p.now)) : null;
  return `<a href="${BASE}/jogo/${r.slug}/"><div class="cv">${c ? `<img src="${esc(c)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : esc(r.t.charAt(0))}</div>${esc(r.t)}<small>${min === 0 ? "Grátis" : min !== null ? brl(min) : ""}</small></a>`;
}

function indexPage() {
  const sorted = [...games].sort((a, b) => a.t.localeCompare(b.t, "pt-BR"));
  const groups = {};
  sorted.forEach(g => { const l = g.t.normalize("NFD").charAt(0).toUpperCase(); (groups[/[A-Z]/.test(l) ? l : "#"] ||= []).push(g); });
  const keys = Object.keys(groups).sort((a, b) => a === "#" ? -1 : b === "#" ? 1 : a.localeCompare(b));
  const url = `${BASE}/jogo/`;
  const top = [...games].filter(g => g.n != null).sort((a, b) => b.n - a.n).slice(0, 12);
  return head({
    title: `Todos os ${games.length} jogos: preços e notas | Zera`,
    desc: `Lista completa dos ${games.length} jogos do Zera, com preço no PlayStation, Xbox, Steam, Epic Games e celular, nota da crítica e promoções.`,
    url, image: `${BASE}/icons/share.png`,
    ld: [{ "@context": "https://schema.org", "@type": "CollectionPage", name: "Jogos do Zera", url, numberOfItems: games.length }]
  }) + `
<p class="crumb"><a href="${BASE}/">Zera</a> › Jogos</p>
<h1 style="margin-top:14px">Todos os jogos</h1>
<p class="desc">${games.length} jogos com preço em cada loja e nota da crítica. Toque num jogo para ver os detalhes.</p>
<section><h2>Mais bem avaliados</h2><div class="grid">${top.map(cardHTML).join("")}</div></section>
<section class="az"><h2>De A a Z</h2><nav class="letters">${keys.map(k => `<a href="#l-${k === "#" ? "0" : k}">${k}</a>`).join("")}</nav>
${keys.map(k => `<h2 id="l-${k === "#" ? "0" : k}">${k}</h2><ul>${groups[k].map(g => `<li><a href="${BASE}/jogo/${g.slug}/">${esc(g.t)}</a></li>`).join("")}</ul>`).join("\n")}
</section>
` + foot;
}

await wikiCovers();
fs.rmSync("jogo", { recursive: true, force: true });
fs.mkdirSync("jogo", { recursive: true });
const byGenre = {};
games.forEach(g => (byGenre[g.g] ||= []).push(g));
for (const g of games) {
  const related = (byGenre[g.g] || []).filter(r => r !== g).sort((a, b) => (b.n ?? 0) - (a.n ?? 0)).slice(0, 8);
  fs.mkdirSync(`jogo/${g.slug}`, { recursive: true });
  fs.writeFileSync(`jogo/${g.slug}/index.html`, gamePage(g, related));
}
fs.writeFileSync("jogo/index.html", indexPage());

const day = new Date().toISOString().slice(0, 10);
const lastmod = () => day;
fs.writeFileSync("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${BASE}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
<url><loc>${BASE}/jogo/</loc><changefreq>daily</changefreq><priority>0.8</priority></url>
${games.map(g => `<url><loc>${BASE}/jogo/${g.slug}/</loc><lastmod>${lastmod(g)}</lastmod><changefreq>daily</changefreq></url>`).join("\n")}
</urlset>
`);
fs.writeFileSync("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`);
fs.writeFileSync("data/seo-slugs.json", JSON.stringify(Object.fromEntries(games.map(g => [g.id, g.slug]))));
console.log("páginas:", games.length, "base:", BASE);
