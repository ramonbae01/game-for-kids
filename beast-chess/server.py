#!/usr/bin/env python3
"""비스트 챌린지 체스 - 집 PC용 서버 (설치할 것 없음, 파이썬 3만 있으면 됨)

    python3 server.py          # 기본 8000번 포트
    python3 server.py 8080     # 다른 포트

같은 와이파이에 연결된 폰/태블릿에서 화면에 나오는 주소로 접속하세요.
"""
import json
import os
import random
import re
import socket
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
LOCK = threading.Lock()
ROOMS = {}
SEEN = {}
ROOM_TTL = 6 * 3600
LIST_AGE = 15 * 60


class ApiError(Exception):
    pass


def clean_name(n):
    n = ''.join(ch for ch in str(n or '') if ch not in '<>&"\'').strip()[:8]
    return n or '챌린저'


def clean_skin(s):
    s = s if isinstance(s, dict) else {}
    out = {}
    for k in 'KQRBNP':
        v = s.get(k)
        out[k] = v if isinstance(v, str) and re.fullmatch(r'c\d{1,3}', v) else None
    return out


def color_of(r, pid):
    for c in ('w', 'b'):
        if r['players'][c] and r['players'][c]['pid'] == pid:
            return c
    return None


def bump(r):
    r['ver'] += 1
    r['updated'] = time.time()


def touch(code, pid):
    if pid:
        SEEN[(code, str(pid))] = time.time()


def pub(r):
    now = time.time()
    out = json.loads(json.dumps(r))
    out['now'] = now_ms()
    out['seen'] = {}
    for c in ('w', 'b'):
        p = r['players'][c]
        t = SEEN.get((r['code'], p['pid'])) if p else None
        out['seen'][c] = round(now - t) if t else None
    return out


TC_OK = (0, 180, 300, 600)


def now_ms():
    return time.time() * 1000


def fresh_clock(r):
    return {'w': r['tc'] * 1000, 'b': r['tc'] * 1000, 'start': now_ms()} if r.get('tc') else None


def turn_of(r):
    return 'w' if len(r['moves']) % 2 == 0 else 'b'


def check_flag(r):
    """시간이 다 된 쪽이 있으면 게임 종료. 끝났으면 True"""
    ck = r.get('clock')
    if not ck or r['status'] != 'playing':
        return False
    t = turn_of(r)
    if ck[t] - (now_ms() - ck['start']) <= 0:
        ck[t] = 0
        r['status'] = 'over'
        r['result'] = {'winner': 'b' if t == 'w' else 'w', 'reason': 'time'}
        return True
    return False


def must_room(code):
    r = ROOMS.get(str(code))
    if not r:
        raise ApiError('방이 사라졌어요')
    return r


def handle(a, p):
    with LOCK:
        now = time.time()
        for code in [c for c, r in ROOMS.items() if now - r['updated'] > ROOM_TTL]:
            del ROOMS[code]
        pid = str(p.get('pid', ''))

        if a == 'list':
            rooms = [{'code': r['code'], 'name': r['players']['w']['name'],
                      'king': (r['players']['w'].get('skin') or {}).get('K'),
                      'tc': r.get('tc') or 0}
                     for r in ROOMS.values()
                     if r['status'] == 'waiting' and now - r['updated'] < LIST_AGE]
            return {'rooms': rooms[::-1]}

        if a == 'create':
            while True:
                code = str(random.randint(1000, 9999))
                if code not in ROOMS:
                    break
            r = {'code': code, 'gid': 1, 'ver': 0, 'status': 'waiting', 'updated': now,
                 'players': {'w': {'pid': pid, 'name': clean_name(p.get('name')),
                                   'skin': clean_skin(p.get('skin'))}, 'b': None},
                 'moves': [], 'result': None, 'rematch': {}, 'clock': None,
                 'tc': int(p.get('tc') or 0) if int(p.get('tc') or 0) in TC_OK else 0}
            bump(r)
            ROOMS[code] = r
            touch(code, pid)
            return {'room': pub(r)}

        if a == 'join':
            r = ROOMS.get(str(p.get('code')))
            if not r:
                raise ApiError('그 번호의 방을 찾을 수 없어요')
            if not color_of(r, pid):
                if r['status'] != 'waiting' or r['players']['b']:
                    raise ApiError('이미 게임 중인 방이에요')
                r['players']['b'] = {'pid': pid, 'name': clean_name(p.get('name')),
                                     'skin': clean_skin(p.get('skin'))}
                r['status'] = 'playing'
                r['clock'] = fresh_clock(r)
                bump(r)
            touch(r['code'], pid)
            return {'room': pub(r)}

        if a == 'get':
            r = must_room(p.get('code'))
            touch(r['code'], pid)
            return {'room': pub(r)}

        if a == 'move':
            r = must_room(p.get('code'))
            c = color_of(r, pid)
            if not c:
                raise ApiError('이 방의 선수가 아니에요')
            if r['status'] != 'playing':
                raise ApiError('게임이 끝났어요')
            if int(p.get('gid', -1)) != r['gid'] or int(p.get('n', -1)) != len(r['moves']):
                raise ApiError('순서가 맞지 않아요')
            if c != ('w' if len(r['moves']) % 2 == 0 else 'b'):
                raise ApiError('상대 차례예요')
            m = p.get('move') or {}
            fr, to = int(m.get('from', -1)), int(m.get('to', -1))
            if not (0 <= fr < 64 and 0 <= to < 64):
                raise ApiError('잘못된 수예요')
            promo = m.get('promo') if m.get('promo') in ('Q', 'R', 'B', 'N') else None
            if check_flag(r):  # 시간 초과로 이미 짐
                bump(r)
                return {'room': pub(r)}
            if r.get('clock'):
                r['clock'][c] -= now_ms() - r['clock']['start']
                r['clock']['start'] = now_ms()
            r['moves'].append({'from': fr, 'to': to, 'promo': promo})
            r['rematch'] = {}
            bump(r)
            touch(r['code'], pid)
            return {'room': pub(r)}

        if a == 'flag':
            r = must_room(p.get('code'))
            if check_flag(r):
                bump(r)
            return {'room': pub(r)}

        if a == 'resign':
            r = must_room(p.get('code'))
            c = color_of(r, pid)
            if c and r['status'] == 'playing':
                r['status'] = 'over'
                r['result'] = {'winner': 'b' if c == 'w' else 'w', 'reason': 'resign'}
                bump(r)
            return {'room': pub(r)}

        if a == 'rematch':
            r = must_room(p.get('code'))
            if not color_of(r, pid):
                raise ApiError('이 방의 선수가 아니에요')
            if r['status'] == 'left':
                raise ApiError('상대가 나갔어요')
            r['rematch'][pid] = True
            P = r['players']
            if P['w'] and P['b'] and P['w']['pid'] in r['rematch'] and P['b']['pid'] in r['rematch']:
                P['w'], P['b'] = P['b'], P['w']   # 색 바꾸기
                r['gid'] += 1
                r['moves'] = []
                r['status'] = 'playing'
                r['result'] = None
                r['rematch'] = {}
                r['clock'] = fresh_clock(r)
            bump(r)
            return {'room': pub(r)}

        if a == 'leave':
            r = ROOMS.get(str(p.get('code')))
            if r:
                if r['status'] == 'waiting':
                    del ROOMS[r['code']]
                elif color_of(r, pid):
                    r['status'] = 'left'
                    r['leftBy'] = pid
                    bump(r)
            return {'ok': True}

    raise ApiError('알 수 없는 요청: ' + a)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        if self.path in ('/', '') or self.path.startswith('/?'):
            self.path = '/index.html'
        if self.path.split('?')[0] != '/index.html':
            self.send_error(404)
            return
        super().do_GET()

    def do_POST(self):
        if not self.path.startswith('/api/'):
            self.send_error(404)
            return
        action = self.path[5:].split('?')[0]
        try:
            n = int(self.headers.get('Content-Length') or 0)
            payload = json.loads(self.rfile.read(n) or b'{}')
            out = handle(action, payload if isinstance(payload, dict) else {})
        except ApiError as e:
            out = {'error': str(e)}
        except Exception as e:  # noqa
            out = {'error': '서버 오류: %s' % e}
        body = json.dumps(out, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))  # 실제로 패킷을 보내지 않음
        return s.getsockname()[0]
    except OSError:
        return '127.0.0.1'
    finally:
        s.close()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    srv = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    print('👑 비스트 챌린지 체스 서버 시작!')
    print('   이 PC에서:            http://localhost:%d' % port)
    print('   같은 와이파이 기기에서: http://%s:%d' % (lan_ip(), port))
    print('   (끄려면 Ctrl+C)')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\n서버를 껐어요. 안녕! 👋')
