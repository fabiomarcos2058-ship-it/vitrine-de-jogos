// Zera — sonda: testa endereços das lojas (PlayStation, Epic) a partir do GitHub e grava data/probe.json.
import fs from "node:fs";
import crypto from "node:crypto";
const ROOT = new URL("..", import.meta.url).pathname;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const out = {};
async function hit(name, url, opts = {}) {
  try {
    const r = await fetch(url, { ...opts, headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9", ...(opts.headers || {}) } });
    const t = await r.text();
    const prices = [...t.matchAll(/R\$\s?[\d.]+,\d{2}/g)].slice(0, 12).map(m => m[0]);
    out[name] = { status: r.status, type: r.headers.get("content-type"), len: t.length, prices, head: t.slice(0, 600) };
    return t;
  } catch (e) { out[name] = { error: e.message }; return ""; }
}
const around = (t, re, n = 400) => { const m = t.search(re); return m < 0 ? null : t.slice(Math.max(0, m - n), m + n); };

// ---------- PlayStation ----------
const ps = await hit("ps_search", "https://store.playstation.com/pt-br/search/god%20of%20war%20ragnarok");
out.ps_search_links = [...new Set([...ps.matchAll(/\/pt-br\/(product|concept)\/([A-Za-z0-9_-]+)/g)].map(m => m[1] + "/" + m[2]))].slice(0, 10);
out.ps_search_price_ctx = around(ps, /R\$/);
const link = out.ps_search_links[0];
if (link) {
  const pg = await hit("ps_page", "https://store.playstation.com/pt-br/" + link);
  out.ps_page_qa = [...pg.matchAll(/data-qa="([^"]*(?:finalPrice|originalPrice|price)[^"]*)"[^>]*>([^<]{0,40})</gi)].slice(0, 12).map(m => m[1] + " = " + m[2]);
  out.ps_page_ctx = around(pg, /finalPrice/);
}
// tenta montar a consulta do próprio site e mandar sem hash (POST) e com hash calculado (GET)
try {
  const urls = [...new Set([...ps.matchAll(/(?:src|href)=["']([^"']+\.js)(?:\?[^"']*)?["']/g)].map(m => new URL(m[1], "https://store.playstation.com/pt-br/").href))];
  let q = null; const frags = {};
  for (const u of urls) {
    const js = await (await fetch(u)).text();
    const qi = js.indexOf("query getSearchResults"); if (qi >= 0 && !q) { const end = js.indexOf("`", qi); q = js.slice(qi, end); }
    for (const m of js.matchAll(/fragment (\w+) on \w+ ?\{/g)) { if (frags[m[1]]) continue; let i = m.index, d = 0, j = js.indexOf("{", i); for (; j < js.length; j++) { if (js[j] === "{") d++; else if (js[j] === "}") { d--; if (!d) break; } } frags[m[1]] = js.slice(i, j + 1); }
  }
  if (q) {
    q = q.replace(/\\n/g, "\n").replace(/\$\{[^}]*\}/g, "");
    const used = [...new Set([...q.matchAll(/\.\.\.\s*(\w+)/g)].map(m => m[1]))];
    const full = q + "\n" + used.map(n => (frags[n] || "").replace(/\\n/g, "\n").replace(/\$\{[^}]*\}/g, "")).join("\n");
    out.ps_query_len = full.length; out.ps_frags = used.map(n => n + ":" + !!frags[n]);
    const vars = { searchTerm: "God of War Ragnarök", countryCode: "BR", languageCode: "pt", pageOffset: 0, pageSize: 10 };
    const H = { "content-type": "application/json", "x-psn-store-locale-override": "pt-BR", "apollographql-client-name": "@sie-ppr-web-store/app", origin: "https://store.playstation.com", referer: "https://store.playstation.com/" };
    await hit("ps_gql_post", "https://web.np.playstation.com/api/graphql/v1/op", { method: "POST", headers: H, body: JSON.stringify({ operationName: "getSearchResults", query: full, variables: vars }) });
    for (const [nm, txt] of [["raw", q], ["full", full]]) {
      const h = crypto.createHash("sha256").update(txt).digest("hex");
      await hit("ps_gql_get_" + nm, `https://web.np.playstation.com/api/graphql/v1/op?operationName=getSearchResults&variables=${encodeURIComponent(JSON.stringify(vars))}&extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: h } }))}`, { headers: H });
    }
  }
} catch (e) { out.ps_build_err = e.message; }

// ---------- Epic ----------
await hit("ep_gql_post", "https://store.epicgames.com/graphql", { method: "POST", headers: { "content-type": "application/json", origin: "https://store.epicgames.com" }, body: JSON.stringify({ query: "{Catalog{searchStore(keywords:\"Hades\",country:\"BR\",locale:\"pt-BR\",count:3){elements{title price(country:\"BR\"){totalPrice{originalPrice discountPrice currencyCode}}}}}}" }) });
await hit("ep_gql_get_hash", `https://store.epicgames.com/graphql?operationName=searchStoreQuery&variables=${encodeURIComponent(JSON.stringify({ allowCountries: "BR", category: "games/edition/base", count: 3, country: "BR", keywords: "Hades", locale: "pt-BR", sortBy: "relevancy", sortDir: "DESC", withPrice: true }))}&extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: "7d58e12d9dd8cb14c84a3ff18d360bf9f0caa96bf218f2c5fda68ba88d68a437" } }))}`);
const ep = await hit("ep_page", "https://store.epicgames.com/pt-BR/p/hades");
out.ep_page_ctx = around(ep, /R\$/); out.ep_page_ld = around(ep, /"price"\s*:/, 300);
await hit("ep_cms", "https://store-content-ipv4.ak.epicgames.com/api/pt-BR/content/products/hades");
await hit("ep_platform_home", "https://egs-platform-service.store.epicgames.com/api/v2/public/discover/home?count=5&country=BR&locale=pt-BR&platform=android&start=0&store=EGS");
await hit("ep_platform_search", "https://egs-platform-service.store.epicgames.com/api/v1/egs/search?country=BR&locale=pt-BR&q=hades&platform=android&count=5");
await hit("ep_static_layout", "https://store-site-backend-static-ipv4.ak.epicgames.com/storefrontLayout?locale=pt-BR&country=BR&start=0&count=5");

fs.writeFileSync(ROOT + "data/probe.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v && v.status ? v.status + " " + (v.prices || []).slice(0, 3).join(" ") : v]))).slice(0, 3000));
