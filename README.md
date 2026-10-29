# Zera

Notas e preços de quase 150 jogos em todas as lojas (PlayStation, Xbox, Steam, Epic Games, Google Play e App Store), num lugar só.

**Site:** https://zerastorecorp.netlify.app

Também disponível em: https://fabiomarcos2058-ship-it.github.io/vitrine-de-jogos/

## O que tem
- Trailer de cada jogo, descrição, edições e escolha de edição + plataforma com o botão Continuar
- Comparar até 3 jogos lado a lado
- Quiz "Qual jogo é pra você?"
- Favoritos com o total da lista e a loja mais barata
- Calendário de lançamentos com contagem regressiva
- Ordem para jogar Resident Evil, GTA, Final Fantasy e Dragon Ball
- Compartilhar jogo pelo WhatsApp ou Telegram
- Instala como app no celular e funciona sem internet
- Contas com perfil, favoritos e carrinho sincronizados na hora entre aparelhos
- Preços e promoções ao vivo, com aviso quando um favorito entra em promoção

## Hospedagem
O GitHub Pages publica o site a cada mudança, de graça. O endereço zerastorecorp.netlify.app só repassa para lá (`netlify.toml`), então a Netlify não gasta créditos com as atualizações do robô de preços nem com mudanças no site.

## Atualizações automáticas
- **A cada 3 horas** o robô de preços (`.github/workflows/precos.yml` + `scripts/update-prices.mjs`) busca preços e promoções na Steam, Microsoft Store, PlayStation Store e Epic Games, o mais vendido da Steam e os jogos grátis da Epic, e grava em `data/prices.json`. O relatório de cada loja fica em `data/prices-report.json`.
- Para rodar na hora: aba **Actions** do GitHub → *Atualizar preços* → *Run workflow*.
- **Toda segunda-feira** uma revisão revisa mais vendidos do PlayStation e do Xbox, calendário, notas e lançamentos novos em `games.js`.

## Como editar
Jogos, preços, edições, trailers, calendário e guias ficam em `games.js`.
Ao mudar `games.js`, troque o número depois de `games.js?v=` no `index.html` para os visitantes receberem a versão nova.
