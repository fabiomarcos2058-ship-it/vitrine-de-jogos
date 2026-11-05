// Prints da versão atual: telas internas (detalhe do jogo, menu, prateleiras, página do Google)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8200'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch();
  const shots = [
    ['atual-detalhe-pc', 1440, 900, false, '/#j-elden-ring', null],
    ['atual-detalhe-cel', 390, 844, true, '/#j-elden-ring', null],
    ['atual-prateleiras-pc', 1440, 900, false, '/', p => p.evaluate(() => window.scrollTo(0, 880))],
    ['atual-menu-pc', 1440, 900, false, '/', p => p.click('#menu-btn')],
    ['atual-menu-cel', 390, 844, true, '/', p => p.click('#menu-btn')],
    ['atual-pagina-pc', 1440, 900, false, '/jogo/elden-ring/', null],
    ['atual-pagina-cel', 390, 844, true, '/jogo/elden-ring/', null],
    ['atual-lista-pc', 1440, 900, false, '/jogo/', null]
  ];
  for (const [n, w, h, m, path, act] of shots) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: m, hasTouch: m, locale: 'pt-BR' });
    const p = await ctx.newPage();
    // as páginas dos jogos apontam para o domínio: troca pelo endereço local
    await p.route('https://zerajogos.com.br/**', r => r.continue({ url: r.request().url().replace('https://zerajogos.com.br', 'http://localhost:8200') }));
    try { await p.goto('http://localhost:8200' + path, { waitUntil: 'networkidle', timeout: 45000 }); } catch (e) { console.log(n, e.message); }
    await p.waitForTimeout(4000);
    if (act) { try { await act(p); } catch (e) { console.log(n, e.message); } await p.waitForTimeout(1800); }
    await p.screenshot({ path: `shots/${n}.png` });
    await ctx.close(); console.log('ok', n);
  }
  await b.close(); srv.kill();
})();
