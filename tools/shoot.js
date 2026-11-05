// Tira print de várias versões antigas do site (cada uma servida num endereço local próprio)
const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const list = process.argv.slice(2);
(async () => {
  fs.mkdirSync('shots', { recursive: true });
  const b = await chromium.launch();
  let port = 8100;
  for (const c of list) {
    const dir = `/tmp/v/${c}`; port++;
    execSync(`mkdir -p ${dir} && git archive ${c} | tar -x -C ${dir}`);
    const srv = spawn('python3', ['-m', 'http.server', String(port), '-d', dir], { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 1200));
    for (const [w, h, n, m] of [[1440, 900, 'pc', false], [390, 844, 'cel', true]]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: m, hasTouch: m, locale: 'pt-BR' });
      const p = await ctx.newPage();
      try { await p.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle', timeout: 45000 }); } catch (e) { console.log(c, e.message); }
      await p.waitForTimeout(5000);
      await p.keyboard.press('Escape').catch(() => {});
      await p.screenshot({ path: `shots/${c}-${n}.png` });
      await ctx.close();
    }
    srv.kill(); console.log('ok', c);
  }
  await b.close();
})();
