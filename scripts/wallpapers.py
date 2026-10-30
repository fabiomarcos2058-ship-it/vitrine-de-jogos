# Robô de artes de personagens (wallpapers.com).
# Modo "explore": lê páginas de temas, baixa as miniaturas e monta uma folha numerada para escolha.
# Modo "pick": baixa em alta resolução as imagens escolhidas e salva em chars/<nome>.webp.
import json, io, re, sys, time, urllib.request
from PIL import Image, ImageDraw

cfg = json.load(open("scripts/wallpapers-input.json"))
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8"}

def get(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def explore():
    seen, cands, errs = set(), [], []
    for topic in cfg.get("topics", []):
        url = topic if topic.startswith("http") else "https://wallpapers.com/" + topic
        try:
            html = get(url).decode("utf-8", "ignore")
        except Exception as e:
            errs.append(f"{topic}: {e}"); continue
        n = 0
        for m in re.finditer(r'<img[^>]+>', html):
            tag = m.group(0)
            s = re.search(r'images/(?:thumbnail|thumbnails|high|hd)/([a-z0-9-]+)\.(?:jpg|png|webp)', tag)
            if not s or s.group(1) in seen: continue
            alt = re.search(r'alt="([^"]*)"', tag)
            seen.add(s.group(1)); n += 1
            cands.append({"i": len(cands), "slug": s.group(1), "topic": topic, "alt": alt.group(1) if alt else ""})
            if n >= cfg.get("perTopic", 24): break
        time.sleep(1)
    W, H, COLS = 150, 200, 12
    rows = max(1, (len(cands) + COLS - 1) // COLS)
    sheet = Image.new("RGB", (COLS * W, rows * (H + 16)), (20, 20, 24)); dr = ImageDraw.Draw(sheet)
    for c in cands:
        x, y = (c["i"] % COLS) * W, (c["i"] // COLS) * (H + 16)
        try:
            im = Image.open(io.BytesIO(get(f"https://wallpapers.com/images/thumbnail/{c['slug']}.jpg"))).convert("RGB")
            c["thumb"] = list(im.size)
            s = max(W / im.width, H / im.height); im = im.resize((int(im.width * s) + 1, int(im.height * s) + 1))
            im = im.crop(((im.width - W) // 2, (im.height - H) // 2, (im.width - W) // 2 + W, (im.height - H) // 2 + H)); sheet.paste(im, (x, y))
        except Exception as e:
            dr.text((x + 4, y + 80), "ERRO", fill=(255, 80, 80))
        dr.text((x + 3, y + H + 2), f"#{c['i']} {c['slug'][:20]}", fill=(255, 255, 255))
    sheet.save("data/wp-sheet.jpg", quality=72)
    json.dump({"candidates": cands, "errors": errs}, open("data/wp-candidates.json", "w"), ensure_ascii=False, indent=1)
    print(len(cands), "candidatas;", len(errs), "erros")

def pick():
    rep = {}
    for name, slug in cfg.get("pick", {}).items():
        best = None
        for kind in ("file", "hd", "high"):
            try:
                im = Image.open(io.BytesIO(get(f"https://wallpapers.com/images/{kind}/{slug}.jpg", 60))).convert("RGB")
                if not best or im.width * im.height > best[1].width * best[1].height: best = (kind, im)
            except Exception as e:
                rep.setdefault(name, {}).setdefault("errs", []).append(f"{kind}: {e}")
        if not best: continue
        kind, im = best; orig = im.size
        im.thumbnail((1000, 1000), Image.LANCZOS)
        im.save(f"chars/{name}.webp", "WEBP", quality=82, method=6)
        rep.setdefault(name, {}).update({"slug": slug, "from": kind, "orig": list(orig), "saved": list(im.size)})
    json.dump(rep, open("data/wp-report.json", "w"), ensure_ascii=False, indent=1)
    print(json.dumps(rep, indent=1))

pick() if cfg.get("mode") == "pick" else explore()
