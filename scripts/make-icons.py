"""يولّد أيقونة التطبيق وشاشة البداية لمشروع Android (يحتاج Pillow).
الاستخدام: python3 scripts/make-icons.py
"""
import glob
import os
from PIL import Image, ImageDraw

BG = (11, 15, 25, 255)
UP = (31, 199, 135, 255)
DOWN = (255, 84, 104, 255)
LINE = (75, 135, 255, 255)
RES = os.path.join(os.path.dirname(__file__), '..', 'android', 'app', 'src', 'main', 'res')


def draw_candles(d, x0, y0, s):
    """يرسم 3 شموع وخط ترند صاعد داخل مربع طول ضلعه s يبدأ من (x0,y0)."""
    u = s / 100.0
    # (المركز x, أعلى الظل, أعلى الجسم, أسفل الجسم, أسفل الظل, اللون)
    candles = [
        (22, 46, 56, 80, 88, UP),
        (50, 26, 34, 60, 70, DOWN),
        (78, 10, 18, 46, 58, UP),
    ]
    w = 15 * u
    for cx, wt, bt, bb, wb, col in candles:
        x = x0 + cx * u
        d.line([(x, y0 + wt * u), (x, y0 + wb * u)], fill=col, width=max(1, round(4 * u)))
        d.rounded_rectangle([x - w / 2, y0 + bt * u, x + w / 2, y0 + bb * u], radius=2.5 * u, fill=col)
    d.line([(x0 + 8 * u, y0 + 92 * u), (x0 + 50 * u, y0 + 72 * u), (x0 + 94 * u, y0 + 40 * u)],
           fill=LINE, width=max(1, round(5 * u)), joint='curve')


def icon(size, round_mask=False, bg=True):
    img = Image.new('RGBA', (size, size), BG if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = size * (0.2 if bg else 0.3)  # الواجهة الأمامية التكيفية تحتاج هامشاً أكبر
    draw_candles(d, pad, pad, size - 2 * pad)
    if round_mask:
        m = Image.new('L', (size, size), 0)
        ImageDraw.Draw(m).ellipse([0, 0, size - 1, size - 1], fill=255)
        img.putalpha(m)
    elif bg:
        m = Image.new('L', (size, size), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=size * 0.18, fill=255)
        img.putalpha(m)
    return img


SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
for dens, s in SIZES.items():
    folder = os.path.join(RES, f'mipmap-{dens}')
    icon(s).save(os.path.join(folder, 'ic_launcher.png'))
    icon(s, round_mask=True).save(os.path.join(folder, 'ic_launcher_round.png'))
    icon(int(s * 108 / 48), bg=False).save(os.path.join(folder, 'ic_launcher_foreground.png'))

# شاشات البداية: نحافظ على أبعاد كل ملف ونرسم الشعار في المنتصف
for path in glob.glob(os.path.join(RES, 'drawable*', 'splash.png')):
    w, h = Image.open(path).size
    img = Image.new('RGBA', (w, h), BG)
    s = int(min(w, h) * 0.32)
    draw_candles(ImageDraw.Draw(img), (w - s) / 2, (h - s) / 2, s)
    img.convert('RGB').save(path)

bgxml = os.path.join(RES, 'values', 'ic_launcher_background.xml')
with open(bgxml, 'w', encoding='utf-8') as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0B0F19</color>\n</resources>\n')
print('icons + splash generated')
