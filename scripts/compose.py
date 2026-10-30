# Robô de artes com fundo: junta a arte oficial do personagem (Fandom, PNG sem fundo)
# com um cenário do próprio jogo (arte "hero" da Steam, ou a capa do jogo), desfocado e escurecido.
# Saída: chars/c/<hash>.webp + data/wall.json; folhas de conferência data/wall-sheet-N.jpg se "sheet": true.
import json, io, os, re, hashlib, time, urllib.request
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

cfg = json.load(open("scripts/compose-input.json"))
UA = {"User-Agent": "Mozilla/5.0 (ZeraBot; +https://zerastorecorp.netlify.app)"}
W, H = 640, 800
base = json.load(open("data/characters.json"))["games"]
skip = set((json.load(open("data/characters-extra.json")).get("games") or {}).keys())
games = {g["t"]: g for g in json.load(open("/tmp/games.json"))}
prices = json.load(open("data/prices.json"))["p"]
only = set(cfg.get("only") or [])
bgover = cfg.get("bg") or {}             # "Jogo": appid da Steam ou URL de imagem para o fundo
os.makedirs("chars/c", exist_ok=True)

def get(url, timeout=40):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()

def img(url):
    return Image.open(io.BytesIO(get(url)))

def full(u):  # tira o redimensionamento da Fandom para pegar a arte no tamanho original
    return re.sub(r"/scale-to-width-down/\d+", "", u)

def appid(game):
    g = games.get(game) or {}
    st = (prices.get(g.get("id", ""), {}) or {}).get("st") or {}
    m = re.search(r"/app/(\d+)", st.get("url", ""))
    return m.group(1) if m else None

def cover(im, w, h, fy=0.5):
    s = max(w / im.width, h / im.height); im = im.resize((int(im.width * s) + 1, int(im.height * s) + 1), Image.LANCZOS)
    l = (im.width - w) // 2; t = int((im.height - h) * fy)
    return im.crop((l, t, l + w, t + h))

shots = {}
def shotlist(game):
    if game in shots: return shots[game]
    srcs = []
    o = bgover.get(game)
    if o and str(o).startswith("http"): srcs.append(o)
    a = str(o) if o and not str(o).startswith("http") else appid(game)
    if a:
        try:
            time.sleep(0.6)
            j = json.loads(get(f"https://store.steampowered.com/api/appdetails?appids={a}&filters=screenshots"))
            srcs += [x["path_full"] for x in (j.get(a, {}).get("data") or {}).get("screenshots", [])[:6]]
        except Exception as e: print("appdetails", game, e)
    c = (games.get(game) or {}).get("img")
    if c: srcs.append(c)
    shots[game] = srcs
    return srcs

bgcache = {}
def background(game, i):
    srcs = shotlist(game)
    order = list(range(len(srcs)))
    if len(srcs) > 1: k = i % max(1, len(srcs) - 1); order = [k] + [j for j in order if j != k]
    for j in order:
        s = srcs[j]
        if s in bgcache: return bgcache[s]
        try:
            bg = Image.open(s).convert("RGB") if not s.startswith("http") else img(s).convert("RGB")
        except Exception: continue
        bg = cover(bg, W, H).filter(ImageFilter.GaussianBlur(3))
        bg = ImageEnhance.Brightness(bg).enhance(0.72)
        g = Image.linear_gradient("L").resize((W, H)).point(lambda v: 0 if v < 110 else int((v - 110) / 145 * 170))
        bg = Image.composite(Image.new("RGB", (W, H), (8, 8, 10)), bg, g)
        bgcache[s] = bg
        return bg
    return Image.new("RGB", (W, H), (24, 26, 32))

def unwhite(ch):  # tira fundo branco liso (artes antigas) a partir dos cantos
    ch = ch.convert("RGBA"); px = ch.load(); w, h = ch.size
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    if not all(min(px[c][:3]) > 235 for c in corners): return ch
    for c in corners: ImageDraw.floodfill(ch, c, (255, 255, 255, 0), thresh=28)
    return ch

def compose(game, url, i=0):
    ch = unwhite(img(full(url)))
    if ch.mode in ("P", "LA") or "transparency" in ch.info: ch = ch.convert("RGBA")
    if ch.mode == "RGBA":
        a = ch.getchannel("A"); hist = a.histogram()
        transp = sum(hist[:16]) / (ch.width * ch.height)
    else:
        transp = 0
    if transp < 0.08:                 # já é uma foto com fundo: só enquadra
        return cover(ch.convert("RGB"), W, H, 0.2)
    ch = ch.crop(ch.getchannel("A").getbbox())
    s = min(H * 0.94 / ch.height, W * 0.98 / ch.width)
    ch = ch.resize((max(1, int(ch.width * s)), max(1, int(ch.height * s))), Image.LANCZOS)
    x, y = (W - ch.width) // 2, H - ch.height
    if ch.height < H * 0.7: y = int(H * 0.18)   # retrato (busto) pequeno: um pouco acima do meio
    out = background(game, i).copy().convert("RGBA")
    sh = Image.new("RGBA", out.size, (0, 0, 0, 0))
    sh.paste(Image.new("RGBA", ch.size, (0, 0, 0, 170)), (x, y + 10), ch.getchannel("A"))
    out.alpha_composite(sh.filter(ImageFilter.GaussianBlur(14)))
    out.alpha_composite(ch, (x, y))
    return out.convert("RGB")

prev = json.load(open("data/wall.json")) if os.path.exists("data/wall.json") else {"games": {}}
result = {g: v for g, v in prev.get("games", {}).items() if only and g not in only}
errs = []
for game, lst in base.items():
    if game in skip or (only and game not in only): continue
    out = []
    for i, c in enumerate(lst):
        fn = "chars/c/" + hashlib.md5((game + "|" + c["n"]).encode()).hexdigest()[:12] + ".webp"
        try:
            compose(game, c["img"], i).save(fn, "WEBP", quality=74, method=6)
            out.append({"n": c["n"], "img": fn})
        except Exception as e:
            errs.append(f"{game}|{c['n']}: {e}")
    if out: result[game] = out
    print(game, len(out), "fundos:", len(shots.get(game, [])), flush=True)

json.dump({"updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "games": result, "errors": errs, "fundos": {g: len(v) for g, v in shots.items()}},
          open("data/wall.json", "w"), ensure_ascii=False, indent=0)

if cfg.get("sheet"):
    items = [(g, c) for g, l in result.items() for c in l if not only or g in only]
    w, h, COLS, PER = 128, 160, 14, 140
    for k in range(0, len(items), PER):
        part = items[k:k + PER]; rows = (len(part) + COLS - 1) // COLS
        sht = Image.new("RGB", (COLS * w, rows * (h + 24)), (20, 20, 24)); dr = ImageDraw.Draw(sht)
        for i, (g, c) in enumerate(part):
            x, y = (i % COLS) * w, (i // COLS) * (h + 24)
            sht.paste(Image.open(c["img"]).convert("RGB").resize((w, h)), (x, y))
            dr.text((x + 2, y + h + 1), f"{k + i} {c['n'][:18]}", fill=(255, 255, 255))
            dr.text((x + 2, y + h + 12), g[:20], fill=(150, 150, 160))
        sht.save(f"data/wall-sheet-{k // PER}.jpg", quality=72)
print("erros:", len(errs))
