// Zera — sonda 2: PlayStation (consulta registrada e páginas de produto) e Epic (vitrine pública).
import fs from "node:fs";
import crypto from "node:crypto";
import { parse, print } from "graphql";
const ROOT = new URL("..", import.meta.url).pathname;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const out = {};
const sha = t => crypto.createHash("sha256").update(t).digest("hex");
async function hit(name, url, opts = {}) {
  try {
    const r = await fetch(url, { ...opts, headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9", ...(opts.headers || {}) } });
    const t = await r.text();
    out[name] = { status: r.status, len: t.length, prices: [...t.matchAll(/R\$\s?[\d.]+,\d{2}/g)].slice(0, 8).map(m => m[0]), head: t.slice(0, 300) };
    return t;
  } catch (e) { out[name] = { error: e.message }; return ""; }
}
// adiciona __typename como o Apollo faz antes de calcular o hash
function addTypename(doc) {
  const visit = (sel, root) => {
    if (!sel || !sel.selections) return;
    sel.selections.forEach(s => visit(s.selectionSet, false));
    const has = sel.selections.some(s => s.kind === "Field" && s.name.value === "__typename");
    const onlyFrag = false;
    if (!root && !has && !onlyFrag) sel.selections.push({ kind: "Field", name: { kind: "Name", value: "__typename" } });
  };
  doc.definitions.forEach(d => visit(d.selectionSet, d.kind === "OperationDefinition"));
  return doc;
}
const H = { "content-type": "application/json", "x-psn-store-locale-override": "pt-BR", "apollographql-client-name": "@sie-ppr-web-store/app", origin: "https://store.playstation.com", referer: "https://store.playstation.com/" };
const vars = { searchTerm: "God of War Ragnarök", countryCode: "BR", languageCode: "pt", pageOffset: 0, pageSize: 10 };
const ps = await (await fetch("https://store.playstation.com/pt-br/search/god%20of%20war", { headers: { "user-agent": UA } })).text();
const urls = [...new Set([...ps.matchAll(/(?:src|href)=["']([^"']+\.js)(?:\?[^"']*)?["']/g)].map(m => new URL(m[1], "https://store.playstation.com/pt-br/").href))];
let qsrc = null, chunk = null; const frags = {};
for (const u of urls) {
  const js = await (await fetch(u)).text();
  const qi = js.indexOf("query getSearchResults");
  if (qi >= 0 && !qsrc) { qsrc = js.slice(qi, js.indexOf("`", qi)); chunk = js; out.ps_ctx_before = js.slice(Math.max(0, qi - 600), qi); out.ps_ctx_after = js.slice(qi + qsrc.length, qi + qsrc.length + 800); }
  for (const m of js.matchAll(/fragment (\w+) on (\w+)\s*\{/g)) {
    if (frags[m[1]]) continue;
    let d = 0, j = js.indexOf("{", m.index);
    for (; j < js.length; j++) { if (js[j] === "{") d++; else if (js[j] === "}") { d--; if (!d) break; } }
    frags[m[1]] = js.slice(m.index, j + 1);
  }
  for (const m of js.matchAll(/["']([a-f0-9]{64})["']/g)) (out.hexes ||= []).length < 40 && out.hexes.push(m[1]);
}
out.ps_qsrc = qsrc && qsrc.slice(0, 4000);
out.ps_frag_names = Object.keys(frags);
if (qsrc) {
  const clean = s => s.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\$\{[^}]*\}/g, "");
  const q = clean(qsrc);
  const needed = new Set(); let grow = q; let added = true;
  while (added) { added = false; for (const m of grow.matchAll(/\.\.\.\s*([A-Za-z_]\w*)/g)) if (frags[m[1]] && !needed.has(m[1])) { needed.add(m[1]); grow += "\n" + clean(frags[m[1]]); added = true; } }
  const fragsTxt = [...needed].map(n => clean(frags[n]));
  const variants = {};
  try {
    const doc = parse(q + "\n" + fragsTxt.join("\n"));
    variants.printed = print(doc);
    variants.printed_tn = print(addTypename(parse(q + "\n" + fragsTxt.join("\n"))));
    variants.op_only_printed = print(parse(q + "\n" + fragsTxt.join("\n")).definitions[0] ? { kind: "Document", definitions: [parse(q + "\n" + fragsTxt.join("\n")).definitions[0]] } : doc);
  } catch (e) { out.parse_err = e.message; }
  variants.raw_join = q + "\n" + fragsTxt.join("\n");
  variants.raw_q = q;
  out.ps_tries = {};
  for (const [k, txt] of Object.entries(variants)) {
    const h = sha(txt);
    try {
      const r = await fetch(`https://web.np.playstation.com/api/graphql/v1/op?operationName=getSearchResults&variables=${encodeURIComponent(JSON.stringify(vars))}&extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: h } }))}`, { headers: { ...H, "user-agent": UA } });
      const t = await r.text(); out.ps_tries[k] = r.status + " " + t.slice(0, 160);
    } catch (e) { out.ps_tries[k] = e.message; }
  }
  for (const h of (out.hexes || []).slice(0, 25)) {
    try {
      const r = await fetch(`https://web.np.playstation.com/api/graphql/v1/op?operationName=getSearchResults&variables=${encodeURIComponent(JSON.stringify(vars))}&extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: h } }))}`, { headers: { ...H, "user-agent": UA } });
      const t = await r.text(); (out.ps_hex_tries ||= {})[h.slice(0, 10)] = r.status + " " + t.slice(0, 100);
    } catch (e) {}
  }
}
// página oficial do jogo em playstation.com → IDs de produto → página da loja
const pg = await hit("ps_site_game", "https://www.playstation.com/pt-br/games/god-of-war-ragnarok/");
out.ps_site_ids = [...new Set([...pg.matchAll(/[A-Z]{2}\d{4}-[A-Z]{4}\d{5}_00-[A-Z0-9]{16}/g)].map(m => m[0]))].slice(0, 10);
out.ps_site_concepts = [...new Set([...pg.matchAll(/concept\/(\d+)/g)].map(m => m[1]))].slice(0, 5);
if (out.ps_site_ids[0]) {
  const pp = await hit("ps_product", "https://store.playstation.com/pt-br/product/" + out.ps_site_ids[0]);
  out.ps_product_qa = [...pp.matchAll(/data-qa="([^"]*[Pp]rice[^"]*)"[^>]*>([^<]{0,40})</g)].slice(0, 12).map(m => m[1] + " = " + m[2]);
  const i = pp.search(/basePrice|discountedPrice/); out.ps_product_json = i >= 0 ? pp.slice(Math.max(0, i - 200), i + 400) : null;
}
if (out.ps_site_concepts[0]) {
  const cp = await hit("ps_concept", "https://store.playstation.com/pt-br/concept/" + out.ps_site_concepts[0]);
  out.ps_concept_qa = [...cp.matchAll(/data-qa="([^"]*[Pp]rice[^"]*)"[^>]*>([^<]{0,40})</g)].slice(0, 12).map(m => m[1] + " = " + m[2]);
}
// Epic: o que a vitrine pública e o CMS oferecem
const lay = await (await fetch("https://store-site-backend-static-ipv4.ak.epicgames.com/storefrontLayout?locale=pt-BR&country=BR&start=0&count=30", { headers: { "user-agent": UA } })).json().catch(() => null);
if (lay) {
  const offers = []; const walk = o => { if (!o || typeof o !== "object") return; if (o.title && o.price && o.price.totalPrice) offers.push({ t: o.title, b: o.price.totalPrice.originalPrice, f: o.price.totalPrice.discountPrice, c: o.price.totalPrice.currencyCode }); for (const v of Object.values(o)) walk(v); };
  walk(lay); out.ep_layout_offers = offers.length; out.ep_layout_sample = offers.slice(0, 15);
}
const cms = await (await fetch("https://store-content-ipv4.ak.epicgames.com/api/pt-BR/content/products/hades", { headers: { "user-agent": UA } })).text().catch(() => "");
out.ep_cms_keys = (() => { try { const j = JSON.parse(cms); return Object.keys(j).slice(0, 30).concat((j.pages || []).slice(0, 2).map(p => Object.keys(p).join(","))); } catch (e) { return e.message; } })();
out.ep_cms_offer = (cms.match(/"offerId"\s*:\s*"[^"]+"|"namespace"\s*:\s*"[^"]+"/g) || []).slice(0, 6);
fs.writeFileSync(ROOT + "data/probe.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.ps_tries), JSON.stringify(out.ps_site_ids), out.ep_layout_offers);
