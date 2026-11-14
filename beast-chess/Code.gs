/**
 * 비스트 챌린지 체스 - Google Apps Script 웹앱
 * - index (HTML) : 게임 화면
 * - api()        : 온라인 대결용 방 관리 (CacheService에 저장, 최대 6시간 유지)
 */
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
    o[k] = (typeof v === 'string' && /^c\d{1,3}$/.test(v)) ? v : null;
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
  return out;
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
          rooms.push({ code: r.code, name: r.players.w.name, king: (r.players.w.skin || {}).K || null });
      });
      return { rooms: rooms.reverse() };
    }
    case 'create':
      return withLock_(function () {
        var code;
        do { code = String(1000 + Math.floor(Math.random() * 9000)); } while (getRoom_(code));
        var r = { code: code, gid: 1, ver: 0, status: 'waiting',
                  players: { w: { pid: String(p.pid), name: cleanName_(p.name), skin: cleanSkin_(p.skin) }, b: null },
                  moves: [], result: null, rematch: {} };
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
        r.moves.push({ from: from, to: to, promo: promo });
        r.rematch = {};
        putRoom_(r);
        touch_(r.code, p.pid);
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
  throw new Error('알 수 없는 요청: ' + a);
}
