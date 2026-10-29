# Monta uma folha de conferência com as imagens dos personagens (só para revisão).
import json, io, sys, urllib.request
if not json.load(open("scripts/lookup-input.json")).get("sheet"): sys.exit(0)
from PIL import Image, ImageDraw
d = json.load(open("data/characters.json"))["games"]
items = []
for g, lst in d.items():
    for c in lst[:2]: items.append((g, c["n"], c["img"]))
W, H, COLS = 110, 150, 16
rows = (len(items) + COLS - 1) // COLS
sheet = Image.new("RGB", (COLS * W, rows * (H + 26)), (20, 20, 24))
dr = ImageDraw.Draw(sheet)
for i, (g, n, u) in enumerate(items):
    x, y = (i % COLS) * W, (i // COLS) * (H + 26)
    try:
        req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
        im = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=20).read())).convert("RGBA")
        bg = Image.new("RGBA", im.size, (60, 60, 70, 255)); bg.alpha_composite(im); im = bg.convert("RGB")
        s = max(W / im.width, H / im.height); im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))))
        im = im.crop(((im.width - W) // 2, 0, (im.width - W) // 2 + W, H)); sheet.paste(im, (x, y))
    except Exception as e:
        dr.text((x + 4, y + 60), "ERRO", fill=(255, 80, 80))
    dr.text((x + 3, y + H + 1), n[:17], fill=(255, 255, 255)); dr.text((x + 3, y + H + 13), g[:17], fill=(150, 150, 160))
sheet.save("data/characters-sheet.jpg", quality=70)
print("folha:", len(items))
