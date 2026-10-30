// Zera — data em que cada jogo entrou no site, tirada do histórico do git (games.js).
// Grava data/added.json: { updated, games: { "Título": "2026-10-29T12:32:00Z" } }
import fs from "node:fs";
import vm from "node:vm";
import { execSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const sh = cmd => execSync(cmd, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const titlesOf = src => { try { const sb = { window: {} }; vm.runInNewContext(src, sb); return (sb.window.GAMES || []).map(g => g.t); } catch (e) { return null; } };

const commits = sh("git log --reverse --format=%H%x09%cI -- games.js").trim().split("\n").filter(Boolean).map(l => l.split("\t"));
const first = {};
for (const [h, when] of commits) {
  const ts = titlesOf(sh(`git show ${h}:games.js`));
  if (!ts) continue;
  for (const t of ts) if (!first[t]) first[t] = new Date(when).toISOString();
}
// jogos ainda não commitados (rodando local) entram com a hora atual
const now = titlesOf(fs.readFileSync(ROOT + "games.js", "utf8")) || [];
const games = {};
for (const t of now) games[t] = first[t] || new Date().toISOString();
fs.writeFileSync(ROOT + "data/added.json", JSON.stringify({ updated: new Date().toISOString(), games }, null, 0));
console.log("jogos com data:", Object.keys(games).length, "commits lidos:", commits.length);
