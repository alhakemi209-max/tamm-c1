/* تم للتحويلات — ربط منطق النظام بالتخزين المحلي والمزامنة (يُحمَّل بعد code.js) */

/* ===== طبقة البيانات: بديل أوراق جوجل ===== */
function ss_() { return { getUrl: function () { return ''; }, getId: function () { return TAMM.scope; }, getName: function () { return ''; } }; }
function sheet_() { return null; }
const _numSets = {};
function numSet_(e) {
  if (!_numSets[e]) { const o = {}; SCHEMA[e].num.forEach(function (f) { o[f] = 1; }); _numSets[e] = o; }
  return _numSets[e];
}
function rows_(e) {
  const cols = SCHEMA[e].cols, nums = numSet_(e), list = TAMM.list('t_' + e), out = [], first = cols[0][0], nc = cols.length;
  for (let a = 0; a < list.length; a++) {
    const rec = list[a], r = rec.r, s = { _r: rec.id };
    for (let u = 0; u < nc; u++) {
      const f = cols[u][0], l = r[f];
      s[f] = nums[f] ? Number(l) || 0 : l == null ? '' : String(l);
    }
    s[first] !== '' && out.push(s);
  }
  return out;
}
function put_(e, n, t) {
  const cols = SCHEMA[e].cols, nums = numSet_(e), r = {};
  for (let u = 0; u < cols.length; u++) {
    const f = cols[u][0];
    if (nums[f]) { const v = Number(n[f]) || 0; v && (r[f] = v); }
    else { const v = n[f] == null ? '' : String(n[f]); v !== '' && (r[f] = v); }
  }
  const ex = t ? TAMM.get('t_' + e, t) : null, id = t ? String(t) : TAMM.newId();
  TAMM.put('t_' + e, id, ex ? ex.o : TAMM.newOrder(), r);
  n._r = id;
  return n;
}
function write_(e, n, t) { touch_(e); return put_(e, n, t); }
function appendMany_(e, n) {
  if (!n || !n.length) return;
  touch_(e);
  n.forEach(function (s) { put_(e, s, null); });
}
function sameRec_(a, b) {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) if (a[ka[i]] !== b[ka[i]]) return false;
  return true;
}
/* يستبدل محتوى الجدول بالقائمة المعطاة، ولا يكتب إلا ما تغيّر فعلاً */
function replaceAll_(e, n) {
  touch_(e);
  const c = 't_' + e, cols = SCHEMA[e].cols, nums = numSet_(e), first = cols[0][0];
  const cur = TAMM.list(c).slice(), byKey = {}, used = {};
  cur.forEach(function (rec) { const k = rec.r[first]; k != null && byKey[k] === undefined && (byKey[k] = rec.id); });
  const plan = (n || []).map(function (s) {
    let id = s._r && TAMM.get(c, s._r) ? String(s._r) : null;
    if (!id) { const k = String(s[first] == null ? '' : s[first]); byKey[k] !== undefined && !used[byKey[k]] && (id = byKey[k]); }
    if (id && used[id]) id = null;
    id && (used[id] = 1);
    const r = {};
    for (let u = 0; u < cols.length; u++) {
      const f = cols[u][0];
      if (nums[f]) { const v = Number(s[f]) || 0; v && (r[f] = v); }
      else { const v = s[f] == null ? '' : String(s[f]); v !== '' && (r[f] = v); }
    }
    return { s: s, id: id, r: r };
  });
  cur.forEach(function (rec) { used[rec.id] || TAMM.remove(c, rec.id); });
  /* هل ترتيب الصفوف الباقية كما هو؟ */
  let last = -1, reorder = false;
  plan.forEach(function (p) {
    if (!p.id) { last = Infinity; return; }
    const o = TAMM.get(c, p.id).o;
    if (o < last) reorder = true;
    last = Math.max(last, o);
  });
  plan.forEach(function (p) {
    const ex = p.id ? TAMM.get(c, p.id) : null;
    if (ex && !reorder) { sameRec_(ex.r, p.r) || TAMM.put(c, p.id, ex.o, p.r); }
    else { p.id = p.id || TAMM.newId(); TAMM.put(c, p.id, TAMM.newOrder(), p.r); }
    p.s._r = p.id;
  });
}
function compactTo_(e, n) {
  const keep = {};
  (n || []).forEach(function (s) { s._r && (keep[s._r] = 1); });
  TAMM.list('t_' + e).slice().forEach(function (rec) { keep[rec.id] || TAMM.remove('t_' + e, rec.id); });
}

/* ===== الأرقام التسلسلية ===== */
const SEQ_SRC = { SEQ: ['transfers', 'id'], VSEQ: ['vendors', 'key'], MSEQ: ['movements', 'id'], CSEQ: ['messages', 'id'], PSEQ: ['plans', 'id'], KSEQ: ['transfers', 'batchId'], GSEQ: ['transfers', 'groupId'] };
const SEQ_KEYS = Object.keys(SEQ_SRC);
const _seqEm = {};
function seqFloor_(k) {
  let a = Number(TAMM.props[k]) || 0;
  const src = SEQ_SRC[k];
  if (src) TAMM.list('t_' + src[0]).forEach(function (rec) { const m = /(\d+)$/.exec(String(rec.r[src[1]] || '')); m && (a = Math.max(a, Number(m[1]))); });
  return Math.max(a, _seqEm[k] || 0);
}
function seqAlloc_(e, n, t) {
  return {
    next: function () {
      let a = TAMM.seq.take(e);
      if (!a) { a = seqFloor_(e) + 1; _seqEm[e] = a; }
      return n + ('0000000' + a).slice(-t);
    },
    save: function () {}
  };
}

/* ===== الملفات ===== */
async function fileOut_(e) {
  if (!e) throw new Error('لا يوجد ملف مرفق، أو حُذف تلقائياً بعد انتهاء مدة الحفظ.');
  const f = await TAMM.files.get(e);
  return { name: f.name, mime: f.mime, data: f.data };
}
function deleteFile_(e) { e && TAMM.files.del(e); }
function store_() { return null; }

/* ===== ما لا يعمل خارج خوادم جوجل ===== */
function ocrBatch(e, n) { auth_(e, OCR_ROLES); return (Array.isArray(n) ? n : []).map(function () { return ''; }); }
function ocrSelfTest(e) { auth_(e, ['admin', 'officer']); return { ok: false, ms: 0, text: '' }; }
function ensureMaintenance_() {}
function ensureWaTrigger_() {}
function fromTrigger_(e) { return !!e && e.triggerUid === 'app'; }

/* ===== الأرشفة السنوية: تُنقل السجلات القديمة إلى أرشيف السحابة ===== */
function archiveOld_(e) {
  const n = Date.now() - ARCHIVE_DAYS * 864e5, t = e.requireConfirm !== !1;
  const r = {
    transfers: function (o) { return (o.status === ST.DONE || o.status === ST.CANC || o.status === ST.PAID && !t) && ts_(o.updatedAt || o.paidAt || o.createdAt) < n; },
    movements: function (o) { return ts_(o.createdAt) < n; },
    log: function (o) { return ts_(o.time) < n; }
  };
  Object.keys(r).forEach(function (o) {
    const i = rows_(o);
    if (i.length < ARCHIVE_MIN_ROWS) return;
    const a = i.filter(r[o]);
    if (!a.length) return;
    const recs = a.map(function (s) { const x = TAMM.get('t_' + o, s._r); return { id: x.id, o: x.o, r: x.r }; });
    TAMM.backend.archive('t_' + o, recs);
    a.forEach(function (s) { TAMM.remove('t_' + o, s._r); });
    log_({ username: 'النظام' }, '', 'أرشفة سنوية', SCHEMA[o].name + ': نُقل ' + a.length + ' سجل إلى الأرشيف');
  });
}

/* ===== حفظ الإيصالات في Google Drive الخاص بالعميل ===== */
function driveInfo(e) {
  auth_(e, ['admin']);
  return {
    cloud: TAMM.mode === 'cloud', on: TAMM.drive.on(), url: TAMM.props.DRIVE_URL || '',
    keep: TAMM.drive.keep(), folder: TAMM.props.DRIVE_FOLDER || '', linkedAt: TAMM.props.DRIVE_AT || '',
    pending: TAMM.driveQ.size()
  };
}
async function driveLink(e, n, t) {
  const r = auth_(e, ['admin']);
  if (TAMM.mode !== 'cloud') throw new Error('حفظ الإيصالات في Google Drive يعمل بعد ربط النسخة بقاعدة البيانات السحابية.');
  n = String(n || '').trim().split('?')[0].split('#')[0];
  if (!TAMM.drive.validUrl(n)) throw new Error('الصق رابط Web app كما يظهر بعد النشر، وينتهي بـ ‎/exec');
  let k = n === TAMM.props.DRIVE_URL ? TAMM.props.DRIVE_KEY || '' : '';
  if (!k) { const a = new Uint8Array(40); crypto.getRandomValues(a); k = Array.from(a, function (b) { return 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'.charAt(b % 56); }).join(''); }
  const res = await TAMM.drive.call('pair', {}, n, k);
  const first = !TAMM.drive.on();
  TAMM.kvSet('props', 'DRIVE_URL', n);
  TAMM.kvSet('props', 'DRIVE_KEY', k);
  TAMM.kvSet('props', 'DRIVE_KEEP', t === false ? '0' : '1');
  TAMM.kvSet('props', 'DRIVE_FOLDER', String(res.folder || ''));
  TAMM.kvSet('props', 'DRIVE_AT', now_());
  log_(r, '', 'ربط Google Drive', first ? 'بدء حفظ الإيصالات في Google Drive' : 'تحديث ربط Google Drive');
  /* الإيصالات المحفوظة قبل الربط تُنقل تدريجياً */
  setTimeout(function () {
    TAMM.backend.pendingDrive(true).then(function (ids) { ids.forEach(function (id) { TAMM.driveQ.add(id); }); }).catch(function () {});
  }, 1500);
  return driveInfo(e);
}
function driveKeep(e, n) {
  auth_(e, ['admin']);
  TAMM.kvSet('props', 'DRIVE_KEEP', n === false ? '0' : '1');
  return driveInfo(e);
}
API_FNS.driveInfo = 1; API_FNS.driveLink = 1; API_FNS.driveKeep = 1;

/* ===== تشغيل دوال النظام من الواجهة ===== */
(function (G) {
  'use strict';
  const FN_SEQ = {
    submitBatch: ['SEQ', 'VSEQ', 'KSEQ'], submitDistributed: ['SEQ', 'VSEQ', 'GSEQ'], resubmitTransfer: ['VSEQ'], saveVendor: ['VSEQ'],
    importVendors: ['VSEQ'], markPaid: ['MSEQ'], applyReceipts: ['MSEQ'], applyReceipt: ['MSEQ'], chatSend: ['CSEQ'], savePlan: ['PSEQ']
  };
  function maxLen(a, depth) {
    let m = 0;
    if (Array.isArray(a)) { m = a.length; if (depth) a.forEach(function (x) { m = Math.max(m, maxLen(x, depth - 1)); }); }
    else if (a && typeof a === 'object' && depth) Object.keys(a).forEach(function (k) { m = Math.max(m, maxLen(a[k], depth - 1)); });
    return m;
  }
  function clone(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v)); }

  TAMM.run = function (name, args) {
    return TAMM.bootPromise.then(async function () {
      if (!Object.prototype.hasOwnProperty.call(API_FNS, name) || typeof G[name] !== 'function') throw new Error('عملية غير معروفة.');
      args = clone(Array.prototype.slice.call(args || [], 0, 12));
      const keys = FN_SEQ[name];
      if (keys) await TAMM.seq.ensure(keys, 3 + maxLen(args, 2), seqFloor_);
      _lic = void 0; _touched = !1;
      let r;
      try {
        r = G[name].apply(null, args);
        if (r && typeof r.then === 'function') r = await r;
      } finally { TAMM.flush(); }
      TAMM.seq.topUp(SEQ_KEYS, seqFloor_);
      return clone(r);
    });
  };

  /* بديل google.script.run */
  function runner(ok, fail) {
    return new Proxy({}, {
      get: function (_, k) {
        if (k === 'withSuccessHandler') return function (f) { return runner(f, fail); };
        if (k === 'withFailureHandler') return function (f) { return runner(ok, f); };
        if (k === 'withUserObject') return function () { return runner(ok, fail); };
        return function () {
          const args = arguments;
          TAMM.run(String(k), args).then(function (v) { ok && ok(v); }, function (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            fail ? fail(err) : console.error(err);
          });
        };
      }
    });
  }
  G.google = { script: { run: runner(null, null), host: { close: function () {} } } };

  /* ===== الإقلاع ===== */
  function parseCfg(t) {
    t = String(t || '').replace(/^﻿/, '');
    const i = t.indexOf('{'), j = t.lastIndexOf('}');
    if (i < 0 || j < i) return {};
    let body = t.slice(i, j + 1);
    try { return JSON.parse(body); } catch (e) {}
    /* صيغة كائن جافاسكربت كما تُنسخ من لوحة Firebase */
    try {
      body = body.replace(/\/\/[^\n"]*$/gm, '').replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":').replace(/'/g, '"').replace(/,\s*}/g, '}');
      return JSON.parse(body);
    } catch (e) { return { _bad: true }; }
  }
  function loadJs(urls) {
    return new Promise(function (res, rej) {
      let i = 0;
      (function next() {
        if (i >= urls.length) return rej(new Error('تعذّر تحميل مكتبة المزامنة. تحقق من الإنترنت ثم أعد فتح التطبيق.'));
        const s = document.createElement('script');
        s.src = urls[i++]; s.onload = function () { res(); }; s.onerror = function () { s.remove(); next(); };
        document.head.appendChild(s);
      })();
    });
  }
  /* فك تشفير ملف الربط: PBKDF2-SHA256 ثم AES-256-CBC مع HMAC-SHA256 */
  function b64Bytes(t) { const b = atob(String(t || '')), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  TAMM.unlockLink = async function (datText, code) {
    try {
      const d = JSON.parse(String(datText).replace(/^\uFEFF/, '')), C = G.crypto.subtle;
      if (d.v !== 1) return null;
      const pw = new TextEncoder().encode(String(code).toUpperCase().replace(/[^A-Z0-9]/g, ''));
      const salt = b64Bytes(d.s), iv = b64Bytes(d.i), ct = b64Bytes(d.c), mac = b64Bytes(d.m);
      const iter = Math.max(1000, Math.min(2000000, Number(d.n) || 150000));
      const base = await C.importKey('raw', pw, 'PBKDF2', false, ['deriveBits']);
      const bits = new Uint8Array(await C.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iter }, base, 512));
      const kMac = await C.importKey('raw', bits.slice(32), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
      const all = new Uint8Array(salt.length + iv.length + ct.length); all.set(salt); all.set(iv, salt.length); all.set(ct, salt.length + iv.length);
      if (!await C.verify('HMAC', kMac, mac, all)) return null;
      const kEnc = await C.importKey('raw', bits.slice(0, 32), { name: 'AES-CBC' }, false, ['decrypt']);
      const plain = await C.decrypt({ name: 'AES-CBC', iv: iv }, kEnc, ct);
      const cfg = parseCfg(new TextDecoder().decode(plain));
      return cfg && cfg.projectId && cfg.apiKey && !cfg._bad ? cfg : null;
    } catch (e) { return null; }
  };
  const FB_VER = '10.14.1';
  function fbUrls(n) { return ['vendor/firebase-' + n + '-compat.js', 'https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-' + n + '-compat.js']; }

  TAMM.cols = Object.keys(SCHEMA).map(function (k) { return 't_' + k; }).concat(['props', 'live']);
  TAMM.boot = async function (opt) {
    opt = opt || {};
    let cfg = opt.cfg;
    if (!cfg) {
      let txt = '';
      try { const r = await fetch('firebase_config.txt', { cache: 'no-store' }); txt = r.ok ? await r.text() : ''; } catch (e) {}
      cfg = parseCfg(txt);
    }
    if (cfg._bad) throw new Error('ملف firebase_config.txt غير مكتوب بصيغة صحيحة.');
    const onWeb = !opt.cfg && typeof location !== 'undefined' && location.protocol === 'https:';
    if (!cfg.projectId && onWeb) {
      /* نسخة الويب: بيانات الربط مشفّرة، وتُفتح بكود الربط المحفوظ على هذا الجهاز */
      let dat = '';
      try { const r = await fetch('link.dat', { cache: 'no-store' }); dat = r.ok ? await r.text() : ''; } catch (e) {}
      if (!dat) {
        try { dat = TAMM.ls.get('tamm_link_dat', ''); } catch (e) {}
        if (!dat) throw new Error('تعذّر تحميل بيانات الربط. تحقق من الإنترنت ثم أعد المحاولة.');
      } else TAMM.ls.set('tamm_link_dat', dat);
      const code = TAMM.ls.get('tamm_link_code', '');
      if (!code) throw new Error('NEED_CODE');
      cfg = await TAMM.unlockLink(dat, code);
      if (!cfg) throw new Error('BAD_CODE');
    }
    TAMM.cfg = cfg;
    if (cfg.projectId && cfg.apiKey) {
      TAMM.scope = String(cfg.projectId);
      if (!opt.firebase) { await loadJs(fbUrls('app')); await loadJs(fbUrls('auth')); await loadJs(fbUrls('firestore')); }
      TAMM.backend = new TAMM.FirestoreBackend(opt.firebase || G.firebase, cfg, TAMM.cols);
      TAMM.mode = 'cloud';
    } else {
      if (onWeb) throw new Error('هذه النسخة غير مربوطة بقاعدة البيانات.');
      let id = TAMM.ls.get('tamm_local_id', '');
      if (!id) { id = 'local-' + TAMM.newId(); TAMM.ls.set('tamm_local_id', id); }
      TAMM.scope = id;
      TAMM.backend = new TAMM.LocalBackend(TAMM.cols);
      TAMM.mode = 'local';
    }
    await TAMM.backend.init();
    TAMM.ready = true;
    TAMM.seq.topUp(SEQ_KEYS, seqFloor_);
    TAMM.drive.on() && TAMM.driveQ.kick(8000);
    opt.noMaint || setTimeout(TAMM.maintain, 20000 + Math.floor(Math.random() * 20000));
    return TAMM.mode;
  };
  /* الصيانة اليومية: يشغّلها أول جهاز يُفتح في اليوم، بشرط أن تكون ساعته مطابقة لساعة الخادم */
  TAMM.maintain = function () {
    let day;
    try { day = today_(); if (TAMM.props.MAINT_DAY === day || !rows_('users').length) return Promise.resolve(false); } catch (e) { return Promise.resolve(false); }
    return Promise.resolve().then(function () { return TAMM.backend.serverNow(); }).then(function (t) {
      if (!t || Math.abs(t - Date.now()) > 6 * 36e5) return false;
      if (TAMM.props.MAINT_DAY === day || today_() !== day) return false;
      try {
        TAMM.kvSet('props', 'MAINT_DAY', day);
        _lic = void 0; _touched = !1;
        dailyMaintenance({ triggerUid: 'app' });
      } catch (e) { console.warn('maintenance: ' + e); } finally { TAMM.flush(); }
      TAMM.drive.on() && TAMM.backend.pendingDrive(false).then(function (ids) { ids.forEach(function (id) { TAMM.driveQ.add(id); }); }).catch(function () {});
      return true;
    }, function () { return false; });
  };
  let bootRes, bootRej;
  TAMM.bootPromise = new Promise(function (a, b) { bootRes = a; bootRej = b; });
  TAMM.bootPromise.catch(function () {});
  TAMM.start = function (opt) {
    return TAMM.boot(opt).then(function (m) { bootRes(m); return m; }, function (e) { bootRej(e); throw e; });
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* نداء من صفحة الواجهة: المعطيات والنتيجة نصوص JSON */
TAMM.runJson = function (name, json) {
  return TAMM.run(name, JSON.parse(json || '[]')).then(function (v) { return JSON.stringify(v); });
};
