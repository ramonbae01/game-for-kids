/**
 * 비스트 챌린지 체스 - Google Apps Script 웹앱
 * - index (HTML) : 게임 화면
 * - api()        : 온라인 대결용 방 관리 (CacheService에 저장, 최대 6시간 유지)
 */
/* 처음 한 번만: 편집기에서 이 함수를 선택해 ▶ 실행하고 권한을 허용해 주세요 (게임 아이디 저장용) */
function authorize() {
  PropertiesService.getScriptProperties().getKeys();
  CacheService.getScriptCache().put('auth_check', '1', 60);
  LockService.getScriptLock();
  Logger.log('권한 확인 완료! 이제 친구 기능을 쓸 수 있어요.');
}

/* 안드로이드 앱이 큰 데이터(사진 말)를 보낼 때: POST {api, p} */
function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
  return ContentService.createTextOutput(api(String(body.api || ''), body.p || {}))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  // 안드로이드 앱의 온라인 대결 요청: ?api=동작&p={JSON}
  if (e && e.parameter && e.parameter.api) {
    var payload = {};
    try { payload = JSON.parse(e.parameter.p || '{}'); } catch (err) {}
    return ContentService.createTextOutput(api(String(e.parameter.api), payload))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('비스트 챌린지 체스')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
    .addMetaTag('mobile-web-app-capable', 'yes')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

var TTL_ = 21600;          // 6시간
var LIST_AGE_MS_ = 15 * 60 * 1000;

function api(action, p) {
  try {
    return JSON.stringify(handle_(action, p || {}));
  } catch (e) {
    return JSON.stringify({ error: String((e && e.message) || e) });
  }
}

function cache_() { return CacheService.getScriptCache(); }
function getRoom_(code) {
  var s = cache_().get('room_' + code);
  return s ? JSON.parse(s) : null;
}
function putRoom_(r) {
  r.ver = (r.ver || 0) + 1;
  r.updated = Date.now();
  cache_().put('room_' + r.code, JSON.stringify(r), TTL_);
}
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function cleanName_(n) {
  n = String(n || '').replace(/[<>&"']/g, '').trim().slice(0, 8);
  return n || '챌린저';
}
function cleanSkin_(s) {
  var o = {};
  ['K', 'Q', 'R', 'B', 'N', 'P'].forEach(function (k) {
    var v = s && s[k];
    o[k] = (typeof v === 'string' && /^(c\d{1,3}|u[0-9a-f]{12})$/.test(v)) ? v : null;
  });
  return o;
}
function colorOf_(r, pid) {
  if (r.players.w && r.players.w.pid === pid) return 'w';
  if (r.players.b && r.players.b.pid === pid) return 'b';
  return null;
}
function touch_(code, pid) {
  if (pid) cache_().put('seen_' + code + '_' + pid, String(Date.now()), TTL_);
}
function pub_(r) {
  var keys = [], now = Date.now();
  ['w', 'b'].forEach(function (c) { if (r.players[c]) keys.push('seen_' + r.code + '_' + r.players[c].pid); });
  var got = keys.length ? cache_().getAll(keys) : {};
  var seen = {};
  ['w', 'b'].forEach(function (c) {
    var p = r.players[c];
    var t = p ? got['seen_' + r.code + '_' + p.pid] : null;
    seen[c] = t ? Math.round((now - Number(t)) / 1000) : null;
  });
  var out = JSON.parse(JSON.stringify(r));
  out.seen = seen;
  out.now = Date.now();
  return out;
}
var TC_OK_ = [0, 180, 300, 600];
function freshClock_(r) {
  return r.tc ? { w: r.tc * 1000, b: r.tc * 1000, start: Date.now() } : null;
}
function turnOf_(r) { return r.moves.length % 2 === 0 ? 'w' : 'b'; }
/* 시간이 다 된 쪽이 있으면 게임 종료. 끝났으면 true */
function checkFlag_(r) {
  if (!r.clock || r.status !== 'playing') return false;
  var t = turnOf_(r);
  if (r.clock[t] - (Date.now() - r.clock.start) <= 0) {
    r.clock[t] = 0;
    r.status = 'over';
    r.result = { winner: t === 'w' ? 'b' : 'w', reason: 'time' };
    return true;
  }
  return false;
}
function mustRoom_(code) {
  var r = getRoom_(String(code));
  if (!r) throw new Error('방이 사라졌어요');
  return r;
}

function handle_(a, p) {
  switch (a) {
    case 'list': {
      var codes = JSON.parse(cache_().get('rooms') || '[]');
      var all = codes.length ? cache_().getAll(codes.map(function (c) { return 'room_' + c; })) : {};
      var rooms = [];
      codes.forEach(function (c) {
        var s = all['room_' + c];
        if (!s) return;
        var r = JSON.parse(s);
        if (r.status === 'waiting' && Date.now() - r.updated < LIST_AGE_MS_)
          rooms.push({ code: r.code, name: r.players.w.name, king: (r.players.w.skin || {}).K || null, tc: r.tc || 0 });
      });
      return { rooms: rooms.reverse() };
    }
    case 'create':
      return withLock_(function () {
        var code;
        do { code = String(1000 + Math.floor(Math.random() * 9000)); } while (getRoom_(code));
        var r = { code: code, gid: 1, ver: 0, status: 'waiting',
                  players: { w: { pid: String(p.pid), name: cleanName_(p.name), skin: cleanSkin_(p.skin) }, b: null },
                  moves: [], result: null, rematch: {},
                  tc: TC_OK_.indexOf(Number(p.tc)) >= 0 ? Number(p.tc) : 0, clock: null };
        putRoom_(r);
        var codes = JSON.parse(cache_().get('rooms') || '[]');
        var alive = codes.length ? cache_().getAll(codes.map(function (c) { return 'room_' + c; })) : {};
        codes = codes.filter(function (c) { return alive['room_' + c]; });
        codes.push(code);
        cache_().put('rooms', JSON.stringify(codes.slice(-60)), TTL_);
        touch_(code, p.pid);
        return { room: pub_(r) };
      });
    case 'join':
      return withLock_(function () {
        var r = getRoom_(String(p.code));
        if (!r) throw new Error('그 번호의 방을 찾을 수 없어요');
        if (!colorOf_(r, p.pid)) {
          if (r.status !== 'waiting' || r.players.b) throw new Error('이미 게임 중인 방이에요');
          r.players.b = { pid: String(p.pid), name: cleanName_(p.name), skin: cleanSkin_(p.skin) };
          r.status = 'playing';
          r.clock = freshClock_(r);
          putRoom_(r);
        }
        touch_(r.code, p.pid);
        return { room: pub_(r) };
      });
    case 'get': {
      var r = mustRoom_(p.code);
      touch_(r.code, p.pid);
      return { room: pub_(r) };
    }
    case 'move':
      return withLock_(function () {
        var r = mustRoom_(p.code);
        var c = colorOf_(r, p.pid);
        if (!c) throw new Error('이 방의 선수가 아니에요');
        if (r.status !== 'playing') throw new Error('게임이 끝났어요');
        if (Number(p.gid) !== r.gid || Number(p.n) !== r.moves.length) throw new Error('순서가 맞지 않아요');
        if (c !== (r.moves.length % 2 === 0 ? 'w' : 'b')) throw new Error('상대 차례예요');
        var m = p.move || {};
        var from = Number(m.from), to = Number(m.to);
        if (!(from >= 0 && from < 64 && to >= 0 && to < 64)) throw new Error('잘못된 수예요');
        var promo = /^[QRBN]$/.test(m.promo || '') ? m.promo : null;
        if (checkFlag_(r)) { putRoom_(r); return { room: pub_(r) }; }   // 시간 초과로 이미 짐
        if (r.clock) { r.clock[c] -= Date.now() - r.clock.start; r.clock.start = Date.now(); }
        r.moves.push({ from: from, to: to, promo: promo });
        r.rematch = {};
        putRoom_(r);
        touch_(r.code, p.pid);
        return { room: pub_(r) };
      });
    case 'flag':
      return withLock_(function () {
        var r = mustRoom_(p.code);
        if (checkFlag_(r)) putRoom_(r);
        return { room: pub_(r) };
      });
    case 'resign':
      return withLock_(function () {
        var r = mustRoom_(p.code);
        var c = colorOf_(r, p.pid);
        if (c && r.status === 'playing') {
          r.status = 'over';
          r.result = { winner: c === 'w' ? 'b' : 'w', reason: 'resign' };
          putRoom_(r);
        }
        return { room: pub_(r) };
      });
    case 'rematch':
      return withLock_(function () {
        var r = mustRoom_(p.code);
        if (!colorOf_(r, p.pid)) throw new Error('이 방의 선수가 아니에요');
        if (r.status === 'left') throw new Error('상대가 나갔어요');
        r.rematch[p.pid] = true;
        if (r.players.w && r.players.b && r.rematch[r.players.w.pid] && r.rematch[r.players.b.pid]) {
          var t = r.players.w; r.players.w = r.players.b; r.players.b = t;   // 색 바꾸기
          r.gid += 1; r.moves = []; r.status = 'playing'; r.result = null; r.rematch = {};
          r.clock = freshClock_(r);
        }
        putRoom_(r);
        return { room: pub_(r) };
      });
    case 'leave':
      return withLock_(function () {
        var r = getRoom_(String(p.code));
        if (!r) return { ok: true };
        if (r.status === 'waiting') cache_().remove('room_' + r.code);
        else if (colorOf_(r, p.pid)) { r.status = 'left'; r.leftBy = String(p.pid); putRoom_(r); }
        return { ok: true };
      });
  }
  var s = social_(a, p);
  if (s) return s;
  throw new Error('알 수 없는 요청: ' + a);
}

/* =========================================================
   게임 아이디 · 친구 · 결투 신청 · 사진 말
   - 아이디 정보: ScriptProperties (계속 보관) + Cache (빠른 읽기)
   - 접속 상태 · 결투 신청 · 사진: Cache (잠깐 보관)
   ========================================================= */
var ONLINE_MS_ = 25000, CH_MS_ = 45000;
function props_() { return PropertiesService.getScriptProperties(); }
function getUser_(id) {
  id = String(id || '');
  if (!/^\d{6}$/.test(id)) return null;
  var c = cache_().get('U_' + id);
  if (c) return JSON.parse(c);
  var s = props_().getProperty('U_' + id);
  if (!s) return null;
  cache_().put('U_' + id, s, TTL_);
  return JSON.parse(s);
}
function putUser_(u) {
  var s = JSON.stringify(u);
  props_().setProperty('U_' + u.id, s);
  cache_().put('U_' + u.id, s, TTL_);
}
function hashTok_(t) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(t || '')));
}
function auth_(p) {
  var u = getUser_(p.id);
  if (!u || u.tk !== hashTok_(p.token)) throw new Error('아이디를 찾을 수 없어요. 다시 만들어 주세요');
  return u;
}
function isOnline_(id) {
  var t = cache_().get('S_' + id);
  return !!t && Date.now() - Number(t) < ONLINE_MS_;
}
function getCh_(id) { var s = id && cache_().get('CH_' + id); return s ? JSON.parse(s) : null; }
function putCh_(ch) { cache_().put('CH_' + ch.id, JSON.stringify(ch), 600); }
function chView_(ch) {
  if (!ch) return null;
  if (ch.status === 'pending' && Date.now() - ch.t > CH_MS_) ch.status = 'expired';
  return { id: ch.id, from: ch.from, fromName: ch.fromName, to: ch.to, tc: ch.tc, skin: ch.skin,
           status: ch.status, room: ch.room || null, reason: ch.reason || '' };
}
/* 글자 아이디: 한글·영문·숫자·_ 2~12자, 대소문자 구분 없이 하나뿐 */
function cleanHandle_(x) {
  x = String(x || '').trim();
  if (!/^[0-9A-Za-z가-힣_]{2,12}$/.test(x)) throw new Error('아이디는 한글·영문·숫자·밑줄(_)로 2~12자예요');
  return x;
}
function handleKey_(x) { return 'H_' + String(x).toLowerCase(); }
function idByHandle_(x) { return props_().getProperty(handleKey_(x)); }
function userView_(id) {
  var t = getUser_(id);
  return t ? { id: t.id, n: t.n, h: t.h || '' } : null;
}

function addFriend_(u, f) {
  u.fr = (u.fr || []).filter(function (x) { return x.id !== f.id; });
  u.fr.push({ id: f.id, n: f.n });
  u.rq = (u.rq || []).filter(function (x) { return x !== f.id; });
}

function social_(a, p) {
  switch (a) {
    case 'register':
      return withLock_(function () {
        var id, tries = 0;
        do { id = String(100000 + Math.floor(Math.random() * 900000)); tries++; } while (getUser_(id) && tries < 50);
        var hd = cleanHandle_(p.handle);
        if (idByHandle_(hd)) throw new Error('이미 누가 쓰고 있는 아이디예요. 다른 아이디로 해 주세요');
        var token = Utilities.getUuid() + Utilities.getUuid();
        var u = { id: id, n: cleanName_(p.name), h: hd, tk: hashTok_(token), fr: [], rq: [], t: Date.now() };
        putUser_(u);
        props_().setProperty(handleKey_(hd), id);
        return { id: id, token: token, name: u.n, h: hd };
      });
    case 'me': {
      var u = auth_(p);
      cache_().put('S_' + u.id, String(Date.now()), TTL_);
      var friends = (u.fr || []).map(function (f) {
        var t = userView_(f.id) || { id: f.id, n: f.n, h: '' };
        return { id: f.id, n: t.n, h: t.h, on: isOnline_(f.id) };
      });
      var requests = (u.rq || []).map(userView_).filter(function (x) { return x; });
      var inc = chView_(getCh_(cache_().get('CI_' + u.id)));
      if (inc && inc.status !== 'pending') inc = null;
      var out = chView_(getCh_(cache_().get('CO_' + u.id)));
      return { id: u.id, name: u.n, h: u.h || '', friends: friends, requests: requests, challenge: inc, outgoing: out };
    }
    case 'friendReq':
      return withLock_(function () {
        var u = auth_(p), t = getUser_(p.handle ? idByHandle_(p.handle) : p.target);
        if (!t) throw new Error('그 아이디의 친구를 찾을 수 없어요');
        if (t.id === u.id) throw new Error('내 아이디예요! 친구 아이디를 입력해 주세요');
        if ((u.fr || []).some(function (f) { return f.id === t.id; })) throw new Error('이미 친구예요');
        if ((u.rq || []).indexOf(t.id) >= 0) {     // 상대가 먼저 신청했으면 바로 친구
          addFriend_(u, t); addFriend_(t, u); putUser_(u); putUser_(t);
          return { status: 'friends' };
        }
        t.rq = t.rq || [];
        if (t.rq.indexOf(u.id) < 0) { t.rq.push(u.id); t.rq = t.rq.slice(-30); putUser_(t); }
        return { status: 'sent' };
      });
    case 'friendAns':
      return withLock_(function () {
        var u = auth_(p), t = getUser_(p.target);
        u.rq = (u.rq || []).filter(function (x) { return x !== String(p.target); });
        if (p.accept && t) { addFriend_(u, t); addFriend_(t, u); putUser_(t); }
        putUser_(u);
        return { ok: true };
      });
    case 'unfriend':
      return withLock_(function () {
        var u = auth_(p), t = getUser_(p.target);
        u.fr = (u.fr || []).filter(function (f) { return f.id !== String(p.target); });
        putUser_(u);
        if (t) { t.fr = (t.fr || []).filter(function (f) { return f.id !== u.id; }); putUser_(t); }
        return { ok: true };
      });
    case 'challenge':
      return withLock_(function () {
        var u = auth_(p), tid = String(p.target);
        var f = (u.fr || []).filter(function (x) { return x.id === tid; })[0];
        if (!f) throw new Error('친구에게만 결투를 신청할 수 있어요');
        if (!isOnline_(tid)) throw new Error('친구가 지금 접속해 있지 않아요');
        var cur = chView_(getCh_(cache_().get('CI_' + tid)));
        if (cur && cur.status === 'pending' && cur.from !== u.id) throw new Error('친구가 다른 신청을 보고 있어요. 잠시 뒤에 다시 해요!');
        var ch = { id: Utilities.getUuid().slice(0, 12), from: u.id, fromName: u.n, to: tid, toName: f.n,
                   tc: TC_OK_.indexOf(Number(p.tc)) >= 0 ? Number(p.tc) : 0, pid: String(p.pid || ''),
                   skin: cleanSkin_(p.skin), status: 'pending', t: Date.now() };
        putCh_(ch);
        cache_().put('CI_' + tid, ch.id, 600);
        cache_().put('CO_' + u.id, ch.id, 600);
        return { ch: chView_(ch) };
      });
    case 'chAnswer':
      return withLock_(function () {
        var u = auth_(p), ch = getCh_(String(p.chId));
        if (!ch || ch.to !== u.id) throw new Error('결투 신청을 찾을 수 없어요');
        var v = chView_(ch);
        if (v.status !== 'pending') throw new Error(v.status === 'canceled' ? '친구가 신청을 취소했어요' : '결투 신청 시간이 지났어요');
        var room = null;
        if (p.accept) {
          var code;
          do { code = String(1000 + Math.floor(Math.random() * 9000)); } while (getRoom_(code));
          room = { code: code, gid: 1, ver: 0, status: 'playing',
                   players: { w: { pid: ch.pid, name: ch.fromName, skin: ch.skin },
                              b: { pid: String(p.pid || ''), name: u.n, skin: cleanSkin_(p.skin) } },
                   moves: [], result: null, rematch: {}, tc: ch.tc, clock: null };
          room.clock = freshClock_(room);
          putRoom_(room);
          ch.status = 'accepted'; ch.room = code;
        } else {
          ch.status = 'declined'; ch.reason = p.busy ? 'busy' : '';
        }
        putCh_(ch);
        cache_().remove('CI_' + u.id);
        return { ch: chView_(ch), room: room ? pub_(room) : null };
      });
    case 'chCancel':
      return withLock_(function () {
        var u = auth_(p), ch = getCh_(String(p.chId));
        if (ch && ch.from === u.id && ch.status === 'pending') { ch.status = 'canceled'; putCh_(ch); cache_().remove('CI_' + ch.to); }
        return { ok: true };
      });
    case 'setHandle':
      return withLock_(function () {
        var u = auth_(p), hd = cleanHandle_(p.handle), owner = idByHandle_(hd);
        if (owner && owner !== u.id) throw new Error('이미 누가 쓰고 있는 아이디예요. 다른 아이디로 해 주세요');
        if (u.h && handleKey_(u.h) !== handleKey_(hd)) props_().deleteProperty(handleKey_(u.h));
        u.h = hd; putUser_(u);
        props_().setProperty(handleKey_(hd), u.id);
        return { h: hd };
      });
    case 'search': {
      var me = auth_(p), q = String(p.q || '').trim().toLowerCase();
      if (q.length < 2) throw new Error('아이디를 2글자 이상 입력해 주세요');
      var found = [], seen = {};
      var exact = idByHandle_(q);
      if (exact) { found.push(exact); seen[exact] = 1; }
      props_().getKeys().forEach(function (k) {
        if (found.length >= 5 || k.indexOf('H_' + q) !== 0) return;
        var id = props_().getProperty(k);
        if (id && !seen[id]) { found.push(id); seen[id] = 1; }
      });
      var list = found.filter(function (id) { return id !== me.id; }).map(function (id) {
        var t = getUser_(id); if (!t) return null;
        var rel = (me.fr || []).some(function (f) { return f.id === id; }) ? 'friend'
                : (t.rq || []).indexOf(me.id) >= 0 ? 'sent'
                : (me.rq || []).indexOf(id) >= 0 ? 'incoming' : 'none';
        return { id: t.id, n: t.n, h: t.h || '', rel: rel };
      }).filter(function (x) { return x; });
      return { results: list };
    }
    case 'deleteMe':
      return withLock_(function () {
        var u = auth_(p), all = props_().getProperties();
        Object.keys(all).forEach(function (k) {       // 다른 친구들 목록에서 나를 빼요
          if (k.indexOf('U_') !== 0 || k === 'U_' + u.id) return;
          var t = JSON.parse(all[k]), changed = false;
          var fr = (t.fr || []).filter(function (f) { return f.id !== u.id; });
          var rq = (t.rq || []).filter(function (x) { return x !== u.id; });
          if (fr.length !== (t.fr || []).length || rq.length !== (t.rq || []).length) { t.fr = fr; t.rq = rq; putUser_(t); }
        });
        if (u.h) props_().deleteProperty(handleKey_(u.h));
        props_().deleteProperty('U_' + u.id);
        cache_().removeAll(['U_' + u.id, 'S_' + u.id, 'CI_' + u.id, 'CO_' + u.id]);
        return { ok: true };
      });
    case 'putimg': {
      var hsh = String(p.hash || ''), data = String(p.data || '');
      if (!/^u[0-9a-f]{12}$/.test(hsh) || data.indexOf('data:image/') !== 0 || data.length > 95000) throw new Error('사진을 올릴 수 없어요');
      cache_().put('IMG_' + hsh, data, TTL_);
      return { ok: true };
    }
    case 'getimg': {
      var g = String(p.hash || '');
      if (!/^u[0-9a-f]{12}$/.test(g)) return { data: null };
      return { data: cache_().get('IMG_' + g) };
    }
  }
  return null;
}
