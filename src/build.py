#!/usr/bin/env python3
"""建置《德州軍師》。

  python3 src/build.py
      src/dist/index.html    可直接用瀏覽器開的完整頁面（本機測試用）

  python3 src/build.py https://<帳號>.github.io/<repo>/
      另外在 repo 根目錄產生公開網頁 App：index.html、sw.js、manifest.webmanifest
      （圖示與預覽圖用 src/gen_icons.py 產生一次即可）

頁面裡有三段 <script>：
  #engine     引擎（src/engine/ 除了 90-worker），一般的 script，頂層名稱大家都看得到
  #workersrc  背景執行緒的主程式（type="text/plain"，頁面拿 #engine＋它做成 Blob Worker）
  畫面        src/parts/*.js，包在一個函式裡
"""
import pathlib, re, sys, time, urllib.parse
root = pathlib.Path(__file__).resolve().parent
parts = root / 'parts'
eng = root / 'engine'
head = (parts / '00-head.html').read_text(encoding='utf8')
ui_js = '\n'.join(p.read_text(encoding='utf8') for p in sorted(parts.glob('*.js')))
ui_js = ui_js.replace("'use strict';\n", '', 1)
engine_js = '\n'.join(p.read_text(encoding='utf8') for p in sorted(eng.glob('*.js')) if not p.name.startswith('90-'))
worker_js = (eng / '90-worker.js').read_text(encoding='utf8')
web_path = root / 'webparts' / '90-web.js'
web_js = web_path.read_text(encoding='utf8') if web_path.exists() else ''

def noscript_end(s):
    return s.replace('</script', '<\\/script')

# 標題字型（Noto Serif TC 900）只載畫面上會出現的字
body_html = re.sub(r'<style>.*?</style>', '', head, flags=re.S)
code = re.sub(r'/\*.*?\*/', '', ui_js + engine_js + web_js, flags=re.S)
code = re.sub(r'(?m)(^|\s)//.*$', '', code)
cjk = sorted(set(ch for ch in body_html + code if '一' <= ch <= '鿿'))
glyphs = ''.join(cjk) + '0123456789AKQJT%.,+-—（）：、♠♥♦♣'
def font_link(href):
    # media="print" 先載、載到再改 all：字型連不上也不會擋住頁面
    return '<link rel="stylesheet" href="' + href + '" media="print" onload="this.media=\'all\'">'
fonts = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         + font_link('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@900&display=swap&text=' + urllib.parse.quote(glyphs)))
head = head.replace('<!--FONTS-->', fonts)

def scripts(extra_ui):
    return ('<script id="engine">\n' + noscript_end(engine_js) + '\n</script>\n'
            '<script type="text/plain" id="workersrc">\n' + noscript_end(worker_js) + '\n</script>\n'
            '<script>\n(function () {\n\'use strict\';\n' + noscript_end(ui_js + '\n' + extra_ui) + '\n})();\n</script>\n')

def full_page(extra_head, extra_ui):
    cut = head.index('<div id="app"')
    return ('<!doctype html>\n<html lang="zh-Hant"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
            + extra_head + head[:cut] + '</head><body>\n' + head[cut:] + '\n' + scripts(extra_ui) + '</body></html>\n')

dist = root / 'dist'; dist.mkdir(exist_ok=True)
page = full_page('', '')
(dist / 'index.html').write_text(page, encoding='utf8')
print('built', len(page) // 1024, 'KB; engine', len(engine_js) // 1024, 'KB;', len(cjk), 'cjk glyphs')

if len(sys.argv) > 1:
    url = sys.argv[1].rstrip('/') + '/'
    site = root.parent
    desc = '德州撲克的勝率計算機：每一手對 1 到 8 家的勝率、到河牌的牌型機率、出牌數，隨公牌即時更新；還有 GTO 求解器。手機點開就能用。'
    meta = ('<meta name="theme-color" content="#0e1d19">'
            f'<meta name="description" content="{desc}">'
            '<link rel="manifest" href="manifest.webmanifest">'
            '<link rel="icon" type="image/png" href="icon-192.png"><link rel="apple-touch-icon" href="apple-touch-icon.png">'
            '<meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes">'
            '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="德州軍師">'
            '<meta property="og:type" content="website"><meta property="og:title" content="德州軍師">'
            f'<meta property="og:description" content="{desc}"><meta property="og:image" content="{url}og.png"><meta property="og:url" content="{url}">'
            '<meta name="twitter:card" content="summary_large_image">')
    (site / 'index.html').write_text(full_page(meta, web_js), encoding='utf8')
    stamp = time.strftime('%Y%m%d%H%M%S')
    sw = (root / 'webparts' / 'sw.js').read_text(encoding='utf8').replace('__CACHE__', 'dezhou-' + stamp)
    (site / 'sw.js').write_text(sw, encoding='utf8')
    (site / 'manifest.webmanifest').write_text((root / 'webparts' / 'manifest.json').read_text(encoding='utf8'), encoding='utf8')
    (site / '.nojekyll').touch()
    print('web app written to', site, 'for', url, 'cache', 'dezhou-' + stamp)
