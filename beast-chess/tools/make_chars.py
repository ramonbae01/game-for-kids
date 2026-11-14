#!/usr/bin/env python3
"""characters/ 폴더의 그림(.webp)과 names.json을 index.html 안에 넣어줍니다.
캐릭터를 추가/삭제한 뒤 실행:  python3 tools/make_chars.py"""
import base64, json, os, re
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
names = json.load(open(os.path.join(HERE, 'characters', 'names.json'), encoding='utf-8'))
chars = []
for cid, name in names.items():  # names.json 순서대로 (맨 앞이 목록 첫 칸)
    b = open(os.path.join(HERE, 'characters', cid + '.webp'), 'rb').read()
    chars.append({'id': cid, 'n': name, 'src': 'data:image/webp;base64,' + base64.b64encode(b).decode()})
block = '/*CHARS_START*/\nconst CHARS = ' + json.dumps(chars, ensure_ascii=False) + ';\n/*CHARS_END*/'
p = os.path.join(HERE, 'index.html')
html = open(p, encoding='utf-8').read()
html, n = re.subn(r'/\*CHARS_START\*/.*?/\*CHARS_END\*/', lambda m: block, html, flags=re.S)
assert n == 1, 'index.html에서 CHARS 표시를 찾지 못했어요'
open(p, 'w', encoding='utf-8').write(html)
print('캐릭터 %d개를 넣었어요 (%.0f KB)' % (len(chars), len(block) / 1024))
