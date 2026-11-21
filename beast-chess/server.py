#!/usr/bin/env python3
"""비스트 챌린지 체스 - 집 PC용 서버 (설치할 것 없음, 파이썬 3만 있으면 됨)

    python3 server.py          # 기본 8000번 포트
    python3 server.py 8080     # 다른 포트

같은 와이파이에 연결된 폰/태블릿에서 화면에 나오는 주소로 접속하세요.
"""
import json
import os
import hashlib
import random
import secrets
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
USERS_FILE = os.path.join(ROOT, 'users.json')   # 게임 아이디 · 친구 목록 (PC에 저장)
try:
    USERS = json.load(open(USERS_FILE, encoding='utf-8'))
except (OSError, ValueError):
    USERS = {}
USEEN = {}      # 아이디별 마지막 접속 시각
CHS = {}        # 결투 신청
CH_IN = {}      # 받는 사람 아이디 → 신청 id
CH_OUT = {}     # 보낸 사람 아이디 → 신청 id
IMGS = {}       # 사진 말
ONLINE_SEC = 25
CH_SEC = 45
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
        out[k] = v if isinstance(v, str) and re.fullmatch(r'(c\d{1,3}|u[0-9a-f]{12})', v) else None
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

        s = social(a, p)
        if s is not None:
            return s

    raise ApiError('알 수 없는 요청: ' + a)


# ---------------------------------------------------------------- 게임 아이디 · 친구 · 결투 신청 · 사진 말
def save_users():
    tmp = USERS_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(USERS, f, ensure_ascii=False)
    os.replace(tmp, USERS_FILE)


def hash_tok(t):
    return hashlib.sha256(str(t or '').encode()).hexdigest()


def auth(p):
    u = USERS.get(str(p.get('id', '')))
    if not u or u['tk'] != hash_tok(p.get('token')):
        raise ApiError('아이디를 찾을 수 없어요. 다시 만들어 주세요')
    return u


def is_online(uid):
    return time.time() - USEEN.get(uid, 0) < ONLINE_SEC


def ch_view(ch):
    if not ch:
        return None
    if ch['status'] == 'pending' and time.time() - ch['t'] > CH_SEC:
        ch['status'] = 'expired'
    return {k: ch.get(k) for k in ('id', 'from', 'fromName', 'to', 'tc', 'skin', 'status', 'room', 'reason')}


def add_friend(u, f):
    u['fr'] = [x for x in u.get('fr', []) if x['id'] != f['id']] + [{'id': f['id'], 'n': f['n']}]
    u['rq'] = [x for x in u.get('rq', []) if x != f['id']]


def social(a, p):
    if a == 'register':
        while True:
            uid = str(random.randint(100000, 999999))
            if uid not in USERS:
                break
        token = secrets.token_hex(24)
        USERS[uid] = {'id': uid, 'n': clean_name(p.get('name')), 'tk': hash_tok(token), 'fr': [], 'rq': [], 't': time.time()}
        save_users()
        return {'id': uid, 'token': token, 'name': USERS[uid]['n']}

    if a == 'me':
        u = auth(p)
        USEEN[u['id']] = time.time()
        friends = [{'id': f['id'], 'n': f['n'], 'on': is_online(f['id'])} for f in u.get('fr', [])]
        requests = [{'id': USERS[r]['id'], 'n': USERS[r]['n']} for r in u.get('rq', []) if r in USERS]
        inc = ch_view(CHS.get(CH_IN.get(u['id'])))
        if inc and inc['status'] != 'pending':
            inc = None
        out = ch_view(CHS.get(CH_OUT.get(u['id'])))
        return {'id': u['id'], 'name': u['n'], 'friends': friends, 'requests': requests, 'challenge': inc, 'outgoing': out}

    if a == 'friendReq':
        u = auth(p)
        t = USERS.get(str(p.get('target', '')))
        if not t:
            raise ApiError('그 아이디의 친구를 찾을 수 없어요')
        if t['id'] == u['id']:
            raise ApiError('내 아이디예요! 친구 아이디를 입력해 주세요')
        if any(f['id'] == t['id'] for f in u.get('fr', [])):
            raise ApiError('이미 친구예요')
        if t['id'] in u.get('rq', []):
            add_friend(u, t)
            add_friend(t, u)
            save_users()
            return {'status': 'friends'}
        if u['id'] not in t.setdefault('rq', []):
            t['rq'] = (t['rq'] + [u['id']])[-30:]
            save_users()
        return {'status': 'sent'}

    if a == 'friendAns':
        u = auth(p)
        tid = str(p.get('target', ''))
        u['rq'] = [x for x in u.get('rq', []) if x != tid]
        t = USERS.get(tid)
        if p.get('accept') and t:
            add_friend(u, t)
            add_friend(t, u)
        save_users()
        return {'ok': True}

    if a == 'unfriend':
        u = auth(p)
        tid = str(p.get('target', ''))
        u['fr'] = [f for f in u.get('fr', []) if f['id'] != tid]
        t = USERS.get(tid)
        if t:
            t['fr'] = [f for f in t.get('fr', []) if f['id'] != u['id']]
        save_users()
        return {'ok': True}

    if a == 'challenge':
        u = auth(p)
        tid = str(p.get('target', ''))
        f = next((x for x in u.get('fr', []) if x['id'] == tid), None)
        if not f:
            raise ApiError('친구에게만 결투를 신청할 수 있어요')
        if not is_online(tid):
            raise ApiError('친구가 지금 접속해 있지 않아요')
        cur = ch_view(CHS.get(CH_IN.get(tid)))
        if cur and cur['status'] == 'pending' and cur['from'] != u['id']:
            raise ApiError('친구가 다른 신청을 보고 있어요. 잠시 뒤에 다시 해요!')
        tc = int(p.get('tc') or 0)
        ch = {'id': secrets.token_hex(6), 'from': u['id'], 'fromName': u['n'], 'to': tid, 'toName': f['n'],
              'tc': tc if tc in TC_OK else 0, 'pid': str(p.get('pid', '')), 'skin': clean_skin(p.get('skin')),
              'status': 'pending', 't': time.time(), 'room': None, 'reason': ''}
        CHS[ch['id']] = ch
        CH_IN[tid] = ch['id']
        CH_OUT[u['id']] = ch['id']
        return {'ch': ch_view(ch)}

    if a == 'chAnswer':
        u = auth(p)
        ch = CHS.get(str(p.get('chId', '')))
        if not ch or ch['to'] != u['id']:
            raise ApiError('결투 신청을 찾을 수 없어요')
        v = ch_view(ch)
        if v['status'] != 'pending':
            raise ApiError('친구가 신청을 취소했어요' if v['status'] == 'canceled' else '결투 신청 시간이 지났어요')
        room = None
        if p.get('accept'):
            while True:
                code = str(random.randint(1000, 9999))
                if code not in ROOMS:
                    break
            room = {'code': code, 'gid': 1, 'ver': 0, 'status': 'playing', 'updated': time.time(),
                    'players': {'w': {'pid': ch['pid'], 'name': ch['fromName'], 'skin': ch['skin']},
                                'b': {'pid': str(p.get('pid', '')), 'name': u['n'], 'skin': clean_skin(p.get('skin'))}},
                    'moves': [], 'result': None, 'rematch': {}, 'tc': ch['tc'], 'clock': None}
            room['clock'] = fresh_clock(room)
            bump(room)
            ROOMS[code] = room
            ch['status'] = 'accepted'
            ch['room'] = code
        else:
            ch['status'] = 'declined'
            ch['reason'] = 'busy' if p.get('busy') else ''
        CH_IN.pop(u['id'], None)
        return {'ch': ch_view(ch), 'room': pub(room) if room else None}

    if a == 'chCancel':
        u = auth(p)
        ch = CHS.get(str(p.get('chId', '')))
        if ch and ch['from'] == u['id'] and ch['status'] == 'pending':
            ch['status'] = 'canceled'
            CH_IN.pop(ch['to'], None)
        return {'ok': True}

    if a == 'putimg':
        hsh, data = str(p.get('hash', '')), str(p.get('data', ''))
        if not re.fullmatch(r'u[0-9a-f]{12}', hsh) or not data.startswith('data:image/') or len(data) > 95000:
            raise ApiError('사진을 올릴 수 없어요')
        IMGS[hsh] = data
        if len(IMGS) > 500:
            IMGS.pop(next(iter(IMGS)))
        return {'ok': True}

    if a == 'getimg':
        return {'data': IMGS.get(str(p.get('hash', '')))}

    return None


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
