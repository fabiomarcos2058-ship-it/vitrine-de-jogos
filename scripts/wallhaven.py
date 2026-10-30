# Robô de wallpapers de personagens (wallhaven.cc, só conteúdo "SFW").
# Para cada personagem de data/characters.json procura wallpapers com fundo, ordenados pelos
# mais favoritados, escolhe o melhor (alta resolução, de preferência em pé) e salva em chars/w/<id>.webp.
# Resultado: data/wall.json  +  folhas de conferência data/wall-sheet-N.jpg (só quando "sheet": true).
import json, io, os, re, sys, time, urllib.request, urllib.parse
from PIL import Image, ImageDraw

cfg = json.load(open("scripts/wallhaven-input.json"))
UA = {"User-Agent": "ZeraBot/1.0 (+https://zerastorecorp.netlify.app)"}
base = json.load(open("data/characters.json"))["games"]
skip = set((json.load(open("data/characters-extra.json")).get("games") or {}).keys())
out_path = "data/wall.json"
prev = json.load(open(out_path)) if os.path.exists(out_path) else {"games": {}}
only = set(cfg.get("only") or [])
over = cfg.get("override") or {}          # "Jogo|Personagem": "id" ou "" (sem imagem)
bad = set(cfg.get("exclude") or [])       # ids que nunca devem ser usados
alias = cfg.get("alias") or {}            # "Jogo": "nome curto da série para a busca"
os.makedirs("chars/w", exist_ok=True)

def get(url, timeout=40):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()

last = [0.0]
def api(params):
    wait = 1.45 - (time.time() - last[0])
    if wait > 0: time.sleep(wait)
    last[0] = time.time()
    q = urllib.parse.urlencode({"sorting": "favorites", "purity": "100", "categories": "110", **params})
    for i in range(3):
        try: return json.loads(get("https://wallhaven.cc/api/v1/search?" + q))
        except Exception as e:
            if "429" in str(e): time.sleep(20); continue
            return {"data": []}
    return {"data": []}

def series(game):
    if game in alias: return alias[game]
    g = re.sub(r"\s*[:(–-].*$", "", game)
    g = re.sub(r"\s+(\d+|II|III|IV|V|VI|VII|VIII|IX|X|XV|XVI|Remake|Remastered|Royal|Golden|Reload|Infinite|Ragnarök|Ragnarok)$", "", g, flags=re.I)
    return re.sub(r"^(Marvel's|Tom Clancy's|Sid Meier's)\s+", "", g).strip()

def clean(n):
    return re.sub(r"\s*\(.*?\)", "", n.split("||")[0]).strip()

def choose(res, used):
    best, score = None, -1
    for w in res.get("data", []):
        if w["id"] in bad or w["id"] in used: continue
        wd, ht = map(int, w["resolution"].split("x"))
        if max(wd, ht) < 1280: continue
        s = (w.get("favorites") or 0) + 5
        if ht > wd: s *= 1.7                       # em pé combina melhor com o cartão
        if s > score: best, score = w, s
    return best

cache, result, misses = {}, {g: v for g, v in prev.get("games", {}).items() if only and g not in only}, []
for game, lst in base.items():
    if game in skip or (only and game not in only): continue
    used, chosen = set(), []
    for c in lst[: cfg.get("perGame", 5)]:
        n = clean(c["n"]); key = f"{game}|{n}"
        w = None
        if key in over:
            if not over[key]: continue
            w = {"id": over[key], "path": None}
        else:
            for q in (f"{n} {series(game)}", n if (len(n) > 7 or " " in n) else None):
                if not q: continue
                if q not in cache: cache[q] = api({"q": q})
                w = choose(cache[q], used)
                if w: break
        if not w: misses.append(key); continue
        wid = w["id"]; used.add(wid)
        fn = f"chars/w/{wid}.webp"
        if not os.path.exists(fn):
            try:
                path = w["path"] or f"https://w.wallhaven.cc/full/{wid[:2]}/wallhaven-{wid}.jpg"
                try: raw = get(path, 90)
                except Exception: raw = get(path.replace(".jpg", ".png"), 90)
                im = Image.open(io.BytesIO(raw)).convert("RGB"); im.thumbnail((900, 900), Image.LANCZOS)
                im.save(fn, "WEBP", quality=74, method=6)
            except Exception as e:
                misses.append(key + f" (download: {e})"); continue
        chosen.append({"n": c["n"], "img": fn, "id": wid, "thumb": f"https://th.wallhaven.cc/small/{wid[:2]}/{wid}.jpg"})
    if chosen: result[game] = chosen
    print(game, len(chosen), flush=True)

json.dump({"updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "games": result, "misses": misses},
          open(out_path, "w"), ensure_ascii=False, indent=0)

if cfg.get("sheet"):
    items = [(g, c) for g, l in result.items() for c in l if not only or g in only]
    W, H, COLS, PER = 150, 200, 12, 96
    for k in range(0, len(items), PER):
        part = items[k:k + PER]; rows = (len(part) + COLS - 1) // COLS
        sh = Image.new("RGB", (COLS * W, rows * (H + 28)), (20, 20, 24)); dr = ImageDraw.Draw(sh)
        for i, (g, c) in enumerate(part):
            x, y = (i % COLS) * W, (i // COLS) * (H + 28)
            try:
                im = Image.open(c["img"]).convert("RGB")
                s = max(W / im.width, H / im.height); im = im.resize((int(im.width * s) + 1, int(im.height * s) + 1))
                l = (im.width - W) // 2; im = im.crop((l, 0, l + W, H)); sh.paste(im, (x, y))
            except Exception: dr.text((x + 4, y + 80), "ERRO", fill=(255, 80, 80))
            dr.text((x + 3, y + H + 2), f"{k + i} {clean(c['n'])[:19]}", fill=(255, 255, 255))
            dr.text((x + 3, y + H + 14), g[:22], fill=(150, 150, 160))
        sh.save(f"data/wall-sheet-{k // PER}.jpg", quality=70)
print("faltaram:", len(misses))
