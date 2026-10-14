#!/usr/bin/env python3
"""重新產生 App 圖示（朱印「德州軍師」）與連結預覽圖 og.png。
需要：pip install playwright pillow，以及 Noto Serif CJK 字型。
python3 src/gen_icons.py [預覽圖右半邊用的截圖.png]（沒給就用 src/og-shot.png）"""
import asyncio, base64, io, pathlib, sys
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw, ImageFont
root = pathlib.Path(__file__).resolve().parent
out = root.parent
PAGE = """<body style="margin:0;background:#333"><canvas id="c" width="512" height="512"></canvas><script>
function seal(c, cx, cy, s, rot) {
  c.save(); c.translate(cx, cy); c.rotate(rot);
  const r = s * 0.1;
  const box = (k, col) => { c.beginPath(); c.roundRect(-s / 2 + k, -s / 2 + k, s - 2 * k, s - 2 * k, Math.max(2, r - k * 0.5)); c.fillStyle = col; c.fill(); };
  box(0, '#c8372d');
  c.lineWidth = s * 0.03; c.strokeStyle = 'rgba(255,240,225,.75)';
  c.beginPath(); c.roundRect(-s / 2 + s * 0.06, -s / 2 + s * 0.06, s * 0.88, s * 0.88, r * 0.6); c.stroke();
  c.fillStyle = '#fff3e8'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = '900 ' + Math.round(s * 0.36) + 'px "Noto Serif CJK JP", "Noto Serif CJK TC", serif';
  const q = s * 0.205;
  [['德', -q, -q], ['州', q, -q], ['軍', -q, q], ['師', q, q]].forEach(([t, x, y]) => c.fillText(t, x, y + s * 0.015));
  c.restore();
}
function drawIcon(mask) {
  const cv = document.getElementById('c'), c = cv.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 512, 512);
  const g = c.createRadialGradient(256, 200, 20, 256, 256, 380); g.addColorStop(0, '#24543f'); g.addColorStop(1, '#0e1d19');
  c.fillStyle = g; c.fillRect(0, 0, 512, 512);
  seal(c, 256, 256, mask ? 300 : 392, -0.05);
  return cv.toDataURL('image/png');
}
</script></body>"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 512, 'height': 512})
        await pg.set_content(PAGE)
        await pg.wait_for_timeout(300)
        imgs = {}
        for name, m in [('plain', False), ('mask', True)]:
            data = await pg.evaluate('(m) => drawIcon(m)', m)
            imgs[name] = Image.open(io.BytesIO(base64.b64decode(data.split(',')[1]))).convert('RGBA')
        await b.close()
    imgs['plain'].save(out / 'icon-512.png')
    imgs['plain'].resize((192, 192), Image.LANCZOS).save(out / 'icon-192.png')
    imgs['plain'].resize((180, 180), Image.LANCZOS).convert('RGB').save(out / 'apple-touch-icon.png')
    imgs['mask'].save(out / 'icon-maskable-512.png')
    # 預覽圖 1200×630：左邊朱印與名稱，右邊一張截圖
    og = Image.new('RGB', (1200, 630), '#0e1d19')
    d = ImageDraw.Draw(og)
    for y in range(630):
        t = y / 630
        d.line([(0, y), (1200, y)], fill=(int(0x1d + (0x0e - 0x1d) * t), int(0x45 + (0x1d - 0x45) * t), int(0x38 + (0x19 - 0x38) * t)))
    shot_path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'og-shot.png'
    if shot_path.exists():
        shot = Image.open(shot_path).convert('RGB')
        shot.thumbnail((640, 560), Image.LANCZOS)
        mask = Image.new('L', shot.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, shot.size[0] - 1, shot.size[1] - 1], 18, fill=255)
        og.paste(shot, (1200 - shot.size[0] - 40, (630 - shot.size[1]) // 2), mask)
    icon = imgs['plain'].resize((220, 220), Image.LANCZOS)
    og.paste(icon, (60, 90), icon)
    f_big = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSerifCJK-Black.ttc', 84, index=0)
    f_sm = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 30, index=0)
    d.text((60, 340), '德州軍師', font=f_big, fill='#e6eee9')
    d.text((62, 460), '跟電腦打德州撲克', font=f_sm, fill='#c9d6cf')
    d.text((62, 504), '教練一步一步教你怎麼打', font=f_sm, fill='#c9d6cf')
    og.save(out / 'og.png')
    print('icons and og.png written')

asyncio.run(main())
