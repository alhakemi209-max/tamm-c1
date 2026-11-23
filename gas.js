/* تم للتحويلات — محرك التشغيل داخل التطبيق: التخزين والمزامنة */
(function (G) {
  'use strict';

  /* ---------- تخزين محلي بسيط ---------- */
  var LS = (function () {
    try { var t = G.localStorage; t.setItem('__t', '1'); t.removeItem('__t'); return t; }
    catch (e) { var m = {}; return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; } }; }
  })();
  function lsGet(k, d) { try { var v = LS.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { LS.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var TAMM = G.TAMM = {
    tables: {}, props: {}, live: {}, ops: [], backend: null, ready: false, cfg: {}, scope: 'local',
    status: { online: true, pending: 0, error: '' }, listeners: []
  };
  TAMM.ls = { get: lsGet, set: lsSet };

  function tbl(c) { return TAMM.tables[c] || (TAMM.tables[c] = { m: new Map(), sorted: null }); }
  TAMM.list = function (c) {
    var t = tbl(c);
    if (!t.sorted) t.sorted = Array.from(t.m.values()).sort(function (a, b) { return a.o - b.o || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
    return t.sorted;
  };
  TAMM.get = function (c, id) { return tbl(c).m.get(String(id)) || null; };
  var lastOrd = 0;
  TAMM.newOrder = function () { lastOrd = Math.max(lastOrd + 1, Date.now() * 1000); return lastOrd; };
  var idc = 0;
  TAMM.newId = function () {
    var r = '';
    for (var i = 0; i < 8; i++) r += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36));
    return Date.now().toString(36) + (idc++ % 1296).toString(36) + r;
  };
  function push(c, id, data) { TAMM.ops.push({ c: c, id: String(id), data: data }); }
  TAMM.put = function (c, id, o, r) {
    id = String(id);
    var t = tbl(c); t.m.set(id, { id: id, o: o, r: r }); t.sorted = null;
    push(c, id, { o: o, r: r });
  };
  TAMM.remove = function (c, id) {
    id = String(id);
    var t = tbl(c); if (!t.m.has(id)) return; t.m.delete(id); t.sorted = null;
    push(c, id, null);
  };
  TAMM.kvSet = function (c, k, v) {
    var m = c === 'props' ? TAMM.props : TAMM.live;
    if (v == null) { if (!(k in m)) return; delete m[k]; push(c, k, null); }
    else { v = String(v); if (m[k] === v) return; m[k] = v; push(c, k, { v: v }); }
  };
  /* تغيير وارد من جهاز آخر — يعيد true إذا تغيّر شيء فعلاً */
  function same(a, b) {
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var i = 0; i < ka.length; i++) if (a[ka[i]] !== b[ka[i]]) return false;
    return true;
  }
  TAMM.applyRemote = function (c, id, data) {
    if (c === 'props' || c === 'live') {
      var m = c === 'props' ? TAMM.props : TAMM.live;
      if (!data || data.d) { if (!(id in m)) return false; delete m[id]; return true; }
      var v = String(data.v == null ? '' : data.v);
      if (m[id] === v) return false;
      m[id] = v; return true;
    }
    var t = tbl(c);
    if (!data || data.d) { if (!t.m.delete(id)) return false; t.sorted = null; return true; }
    var o = Number(data.o) || 0, r = data.r || {}, ex = t.m.get(id);
    if (ex && ex.o === o && same(ex.r, r)) return false;
    t.m.set(id, { id: id, o: o, r: r }); t.sorted = null;
    return true;
  };
  /* عند وصول تغيير من جهاز آخر تُحدَّث علامة التغيير المحلية لتُعيد الواجهة التحميل */
  var revN = 0;
  TAMM.onRemote = function (c) {
    if (c === 'live' || c === 't_log' || c === 't_users') return;
    cacheMem[c === 't_messages' ? 'crev' : 'rev'] = { v: Date.now() + '-r' + (revN++), x: Date.now() + 216e5 };
  };
  TAMM.flush = function () {
    if (!TAMM.ops.length || !TAMM.backend) return;
    var seen = {}, out = [];
    for (var i = TAMM.ops.length - 1; i >= 0; i--) {
      var op = TAMM.ops[i], k = op.c + '/' + op.id;
      if (!seen[k]) { seen[k] = 1; out.push(op); }
    }
    TAMM.ops = [];
    out.reverse();
    try { TAMM.backend.commit(out); } catch (e) { TAMM.setStatus({ error: String(e && e.message || e) }); }
  };
  TAMM.setStatus = function (p) {
    for (var k in p) TAMM.status[k] = p[k];
    TAMM.listeners.forEach(function (f) { try { f(TAMM.status); } catch (e) {} });
  };

  /* ---------- خدمات بديلة عن خدمات جوجل ---------- */
  var SHARED_CACHE = { evts: 1 }, NO_CACHE = { lic_code: 1 };
  var cacheMem = {};
  var cache = {
    get: function (k) {
      k = String(k);
      if (SHARED_CACHE[k]) return k in TAMM.live ? TAMM.live[k] : null;
      var e = cacheMem[k];
      if (!e) return null;
      if (e.x < Date.now()) { delete cacheMem[k]; return null; }
      return e.v;
    },
    put: function (k, v, ttl) {
      k = String(k);
      if (NO_CACHE[k]) return;
      if (SHARED_CACHE[k]) { TAMM.kvSet('live', k, String(v)); return; }
      cacheMem[k] = { v: String(v), x: Date.now() + (Number(ttl) || 600) * 1000 };
    },
    remove: function (k) { k = String(k); if (SHARED_CACHE[k]) TAMM.kvSet('live', k, null); else delete cacheMem[k]; },
    removeAll: function (a) { (a || []).forEach(cache.remove); },
    getAll: function (a) { var o = {}; (a || []).forEach(function (k) { var v = cache.get(k); if (v !== null) o[k] = v; }); return o; }
  };
  G.CacheService = { getScriptCache: function () { return cache; }, getUserCache: function () { return cache; } };

  var scriptProps = {
    getProperty: function (k) { k = String(k); return k in TAMM.props ? TAMM.props[k] : null; },
    setProperty: function (k, v) { TAMM.kvSet('props', String(k), String(v)); return scriptProps; },
    deleteProperty: function (k) { TAMM.kvSet('props', String(k), null); return scriptProps; },
    getProperties: function () { var o = {}; for (var k in TAMM.props) o[k] = TAMM.props[k]; return o; }
  };
  function uKey() { return 'tamm_uprops_' + TAMM.scope; }
  var userProps = {
    getProperty: function (k) { var o = lsGet(uKey(), {}); return k in o ? o[k] : null; },
    setProperty: function (k, v) { var o = lsGet(uKey(), {}); o[k] = String(v); lsSet(uKey(), o); return userProps; },
    deleteProperty: function (k) { var o = lsGet(uKey(), {}); delete o[k]; lsSet(uKey(), o); return userProps; },
    getProperties: function () { return lsGet(uKey(), {}); }
  };
  G.PropertiesService = { getScriptProperties: function () { return scriptProps; }, getUserProperties: function () { return userProps; } };

  var lock = { waitLock: function () {}, tryLock: function () { return true; }, releaseLock: function () {}, hasLock: function () { return true; } };
  G.LockService = { getScriptLock: function () { return lock; }, getUserLock: function () { return lock; } };

  function b64ToBytes(s, signed) {
    var bin = G.atob(String(s).replace(/\s+/g, ''));
    var a = signed ? new Int8Array(bin.length) : new Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = signed ? bin.charCodeAt(i) : bin.charCodeAt(i);
    return a;
  }
  function bytesToB64(a) {
    var s = '', n = a.length, CH = 0x6000;
    for (var i = 0; i < n; i += CH) {
      var part = '';
      for (var j = i, e = Math.min(n, i + CH); j < e; j++) part += String.fromCharCode(a[j] & 255);
      s += part;
    }
    return G.btoa(s);
  }
  function strBytes(s) {
    var u = unescape(encodeURIComponent(String(s))), a = new Array(u.length);
    for (var i = 0; i < u.length; i++) { var c = u.charCodeAt(i); a[i] = c > 127 ? c - 256 : c; }
    return a;
  }
  function Blob_(data, type, name) {
    this._t = type || 'text/plain'; this._n = name || '';
    if (typeof data === 'string') { this._bytes = strBytes(data); this._b64 = null; }
    else { this._bytes = data || []; this._b64 = data && data._b64 || null; }
  }
  Blob_.prototype = {
    getBytes: function () { return this._bytes; },
    getContentType: function () { return this._t; },
    getName: function () { return this._n; },
    setName: function (n) { this._n = n; return this; },
    getDataAsString: function () { return decodeURIComponent(escape(String.fromCharCode.apply(null, Array.prototype.map.call(this._bytes, function (b) { return b & 255; })))); },
    getAs: function () { throw new Error('هذه الميزة غير متاحة في نسخة التطبيق.'); },
    b64: function () { return this._b64 || bytesToB64(this._bytes); }
  };
  var dtf = {};
  function fmtDate(d, tz, f) {
    var key = tz || 'UTC';
    var fm = dtf[key] || (dtf[key] = new Intl.DateTimeFormat('en-GB', { timeZone: key, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }));
    var p = {};
    fm.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    if (p.hour === '24') p.hour = '00';
    return String(f).replace(/yyyy|MM|dd|HH|mm|ss/g, function (t) { return { yyyy: p.year, MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, ss: p.second }[t]; });
  }
  G.Utilities = {
    DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
    computeDigest: function (alg, s) {
      var b = G.sha256Bytes_(G.utf8_(String(s))), a = new Array(b.length);
      for (var i = 0; i < b.length; i++) a[i] = b[i] > 127 ? b[i] - 256 : b[i];
      return a;
    },
    formatDate: fmtDate,
    getUuid: function () {
      if (G.crypto && G.crypto.randomUUID) return G.crypto.randomUUID();
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : r & 3 | 8).toString(16); });
    },
    newBlob: function (d, t, n) { return new Blob_(d, t, n); },
    base64Encode: function (a) { return typeof a === 'string' ? G.btoa(unescape(encodeURIComponent(a))) : a && a._b64 ? a._b64 : bytesToB64(a); },
    base64Decode: function (s) { var a = b64ToBytes(s, true); a._b64 = String(s).replace(/\s+/g, ''); return a; },
    base64DecodeWebSafe: function (s) {
      var a = b64ToBytes(String(s).replace(/-/g, '+').replace(/_/g, '/'), false);
      for (var i = 0; i < a.length; i++) if (a[i] > 127) a[i] -= 256;
      return a;
    },
    base64EncodeWebSafe: function (a) { return G.Utilities.base64Encode(a).replace(/\+/g, '-').replace(/\//g, '_'); },
    sleep: function () {}
  };

  var NA = 'هذه الميزة غير متاحة في نسخة التطبيق.';
  function na() { throw new Error(NA); }
  var trig = { timeBased: function () { return trig; }, everyMinutes: function () { return trig; }, everyDays: function () { return trig; }, everyHours: function () { return trig; }, atHour: function () { return trig; }, inTimezone: function () { return trig; }, create: function () { return trig; } };
  G.ScriptApp = {
    getScriptId: function () { return TAMM.scope; },
    getService: function () { return { getUrl: function () { return ''; } }; },
    getProjectTriggers: function () { return []; },
    newTrigger: function () { return trig; },
    deleteTrigger: function () {},
    getOAuthToken: function () { return ''; }
  };
  G.UrlFetchApp = { fetch: na, fetchAll: na };
  G.LanguageApp = { translate: na };
  G.MailApp = { sendEmail: function () {}, getRemainingDailyQuota: function () { return 0; } };
  G.Session = { getActiveUser: function () { return { getEmail: function () { return ''; } }; }, getScriptTimeZone: function () { return 'Asia/Riyadh'; } };
  G.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: function (s) { return { setMimeType: function () { return this; }, getContent: function () { return s; } }; } };
  G.HtmlService = { XFrameOptionsMode: {}, createHtmlOutput: na, createHtmlOutputFromFile: na, createTemplateFromFile: na };
  G.SpreadsheetApp = { openById: na, create: na, getActiveSpreadsheet: na, flush: function () {} };

  /* ---------- الملفات (الإيصالات والمرفقات) ---------- */
  var fileMem = new Map();
  function memPut(id, f) { fileMem.delete(id); fileMem.set(id, f); if (fileMem.size > 40) fileMem.delete(fileMem.keys().next().value); }
  TAMM.files = {
    put: function (name, mime, b64) {
      var id = 'f' + TAMM.newId();
      memPut(id, { name: name, mime: mime, data: b64 });
      TAMM.backend.putFile(id, name, mime, b64);
      return id;
    },
    get: function (id) {
      id = String(id || '');
      if (fileMem.has(id)) return Promise.resolve(fileMem.get(id));
      return TAMM.backend.getFile(id).then(function (f) {
        if (!f) throw new Error('لا يوجد ملف مرفق، أو حُذف تلقائياً بعد انتهاء مدة الحفظ.');
        memPut(id, f); return f;
      });
    },
    peek: function (id) { return fileMem.get(String(id || '')) || null; },
    del: function (id) { id = String(id || ''); if (!id) return; fileMem.delete(id); try { TAMM.backend.delFile(id); } catch (e) {} }
  };
  var folder = {
    getId: function () { return 'app'; },
    createFile: function (blob) {
      var id = TAMM.files.put(blob.getName(), blob.getContentType(), blob.b64());
      return { getId: function () { return id; }, getName: function () { return blob.getName(); } };
    }
  };
  G.DriveApp = {
    getFolderById: function () { return folder; },
    createFolder: function () { return folder; },
    getFileById: function (id) {
      var f = fileMem.get(String(id));
      if (!f) throw new Error('الملف غير محمّل.');
      return {
        getId: function () { return id; }, getName: function () { return f.name; },
        getBlob: function () { var a = G.Utilities.base64Decode(f.data); return new Blob_(a, f.mime, f.name); },
        setTrashed: function () { TAMM.files.del(id); }, moveTo: function () {}
      };
    }
  };
  G.Drive = { Files: { remove: function (id) { TAMM.files.del(id); } } };

  /* ---------- الأرقام التسلسلية: كل جهاز يحجز مجموعة أرقام خاصة به ---------- */
  /* احتياطي الأرقام لكل جهاز: يسمح بالعمل دون اتصال لفترة */
  var SPARE = { SEQ: 120, VSEQ: 120, MSEQ: 120 };
  function spare(k) { return SPARE[k] || 30; }
  function seqKey() { return 'tamm_seq_' + TAMM.scope; }
  TAMM.seq = {
    left: function (k) { var b = lsGet(seqKey(), {})[k]; return b ? b[1] - b[0] + 1 : 0; },
    take: function (k) {
      var all = lsGet(seqKey(), {}), b = all[k];
      if (!b || b[0] > b[1]) return 0;
      var n = b[0]; b[0]++; lsSet(seqKey(), all); return n;
    },
    reserve: function (k, count, floor) {
      return TAMM.backend.reserveSeq(k, count, floor).then(function (start) {
        var all = lsGet(seqKey(), {}), b = all[k];
        /* الأرقام الباقية من الحجز السابق تُترك إن لم تكن متصلة بالجديد */
        if (b && b[0] <= b[1] && b[1] + 1 === start) all[k] = [b[0], start + count - 1];
        else all[k] = [start, start + count - 1];
        lsSet(seqKey(), all);
      });
    },
    ensure: function (keys, need, floors) {
      var jobs = [];
      keys.forEach(function (k) {
        var left = TAMM.seq.left(k);
        if (left < need) jobs.push(TAMM.seq.reserve(k, need - left + spare(k), floors(k)));
      });
      return Promise.all(jobs);
    },
    topUp: function (keys, floors) {
      keys.forEach(function (k) {
        if (TAMM.seq.left(k) < spare(k) / 2 && !TAMM.seq._busy[k]) {
          TAMM.seq._busy[k] = 1;
          TAMM.seq.reserve(k, spare(k), floors(k)).catch(function () {}).then(function () { delete TAMM.seq._busy[k]; });
        }
      });
    },
    _busy: {}
  };

  /* ---------- Google Drive الخاص بالعميل (عبر سكربت drive_bridge.gs) ---------- */
  var DRIVE_ERR = {
    KEY: 'مفتاح الربط مع Google Drive غير صحيح. أعد الربط من الإعدادات.',
    PAIRED: 'سكربت Google Drive مربوط بنسخة أخرى. شغّل الدالة resetLink في محرر السكربت ثم أعد الربط.',
    NOTFOUND: 'الإيصال غير موجود في Google Drive، ربما حُذف من المجلد.',
    TYPE: 'نوع الملف غير مدعوم في Google Drive.',
    SIZE: 'حجم الملف أكبر من المسموح.',
    ACTION: 'نسخة سكربت Google Drive قديمة. انسخ الكود من جديد وانشره.'
  };
  TAMM.drive = {
    on: function () { return !!(TAMM.props.DRIVE_URL && TAMM.props.DRIVE_KEY); },
    keep: function () { return TAMM.props.DRIVE_KEEP !== '0'; },
    validUrl: function (u) { return /^https:\/\/script\.google\.com\/(?:a\/macros\/[^\/\s]+|macros)\/s\/[\w-]{20,}\/exec$/.test(String(u || '')); },
    call: function (action, payload, url, key) {
      url = url || TAMM.props.DRIVE_URL; key = key || TAMM.props.DRIVE_KEY;
      if (!url || !key) return Promise.reject(new Error('لم يتم ربط Google Drive بعد.'));
      var body = JSON.stringify(Object.assign({ a: action, k: key }, payload || {}));
      var ctl = typeof AbortController === 'function' ? new AbortController() : null;
      var t = setTimeout(function () { ctl && ctl.abort(); }, action === 'put' || action === 'get' ? 120000 : 40000);
      return G.fetch(url, { method: 'POST', body: body, redirect: 'follow', credentials: 'omit', signal: ctl ? ctl.signal : undefined })
        .then(function (r) { return r.text(); }, function () { throw new Error('تعذّر الاتصال بـ Google Drive. تحقق من الإنترنت ومن رابط السكربت.'); })
        .then(function (txt) {
          clearTimeout(t);
          var j = null;
          try { j = JSON.parse(txt); } catch (e) { j = null; }
          if (!j || typeof j !== 'object') throw new Error('رابط سكربت Google Drive لا يسمح بالدخول. عند النشر اختر Who has access: Anyone.');
          if (!j.ok) throw new Error(DRIVE_ERR[j.error] || ('Google Drive: ' + String(j.error || 'خطأ غير معروف').slice(0, 120)));
          return j;
        }, function (e) { clearTimeout(t); throw e; });
    }
  };
  /* قائمة الإيصالات بانتظار النقل إلى Google Drive (محفوظة على الجهاز وتُستأنف عند عودة الاتصال) */
  TAMM.driveQ = {
    key: function () { return 'tamm_driveq_' + TAMM.scope; },
    list: function () { var a = lsGet(TAMM.driveQ.key(), []); return Array.isArray(a) ? a : []; },
    size: function () { return TAMM.driveQ.list().length; },
    add: function (id) {
      var a = TAMM.driveQ.list();
      if (a.indexOf(id) < 0) { a.push(id); lsSet(TAMM.driveQ.key(), a.slice(-5000)); }
      TAMM.driveQ.kick(400);
    },
    drop: function (id) { lsSet(TAMM.driveQ.key(), TAMM.driveQ.list().filter(function (x) { return x !== id; })); },
    _busy: false, _t: null,
    kick: function (ms) {
      clearTimeout(TAMM.driveQ._t);
      TAMM.driveQ._t = setTimeout(TAMM.driveQ.run, ms == null ? 400 : ms);
    },
    run: function () {
      var Q = TAMM.driveQ;
      if (Q._busy || !TAMM.backend || !TAMM.backend.migrateFile || !TAMM.drive.on()) return Promise.resolve(0);
      var ids = Q.list();
      if (!ids.length) return Promise.resolve(0);
      Q._busy = true;
      var done = 0, failed = 0, i = 0;
      function worker() {
        if (i >= ids.length) return Promise.resolve();
        var id = ids[i++];
        return TAMM.backend.migrateFile(id).then(function (r) {
          if (r === 'retry') failed++; else { Q.drop(id); if (r === 'ok') done++; }
        }, function () { failed++; }).then(worker);
      }
      return Promise.all([worker(), worker(), worker()]).then(function () {
        Q._busy = false;
        if (Q.list().length) Q.kick(failed && !done ? 90000 : 1500);
        return done;
      });
    }
  };
  if (G.addEventListener) G.addEventListener('online', function () { TAMM.driveQ.kick(1500); });

  /* ---------- مزامنة Firebase ---------- */
  function timeout(p, ms, msg) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(new Error(msg)); }, ms);
      p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }
  var CHUNK = 700000;
  TAMM.FirestoreBackend = function (fb, cfg, cols) {
    var db, root, self = this, FV, pending = 0;
    function col(c) { return root.collection(c); }
    function track(p) {
      pending++; TAMM.setStatus({ pending: pending });
      var done = function () { pending--; TAMM.setStatus({ pending: pending }); };
      p.then(function () { done(); if (TAMM.status.error) TAMM.setStatus({ error: '' }); }, function (e) {
        done();
        var m = String(e && e.message || e);
        TAMM.setStatus({ error: /permission|insufficient/i.test(m) ? 'لا تملك هذه النسخة صلاحية الكتابة في قاعدة البيانات. راجع قواعد Firestore وحساب المزامنة.' : 'تعذّر حفظ بعض التغييرات في السحابة: ' + m });
      });
      return p;
    }
    /* فتح قاعدة البيانات مع نسختها المحلية. إن كانت نسخة سابقة من التطبيق ما زالت تمسك التخزين المحلي
       (إغلاق التطبيق ثم فتحه بسرعة) نعيد المحاولة حتى يتحرر، بدل العمل بذاكرة فارغة. */
    var app, persistOk = false, noMulti = false, seen = {}, readyBy = {};
    function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
    function openDb(n) {
      app = fb.initializeApp({ apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId, storageBucket: cfg.storageBucket, messagingSenderId: cfg.messagingSenderId, appId: cfg.appId });
      db = fb.firestore(app); FV = fb.firestore.FieldValue;
      try { db.settings({ cacheSizeBytes: fb.firestore.CACHE_SIZE_UNLIMITED, ignoreUndefinedProperties: true, merge: true }); } catch (e) {}
      root = db.collection('tamm').doc('main');
      if (!db.enablePersistence) { persistOk = false; return Promise.resolve(); }
      var multi = !noMulti;
      return db.enablePersistence({ synchronizeTabs: multi }).then(function () { persistOk = true; }, function (e) {
        persistOk = false;
        var code = String(e && (e.code || e.message) || '');
        if (/unimplemented/i.test(code)) { if (!multi) return; noMulti = true; }
        if (n >= (TAMM.persistTries == null ? 6 : TAMM.persistTries) || !app || typeof app.delete !== 'function') return;
        return wait(TAMM.persistWait == null ? (n ? 1500 : 400) : TAMM.persistWait)
          .then(function () { return app.delete(); }).catch(function () {})
          .then(function () { return openDb(n + 1); });
      });
    }
    this.init = function () {
      return openDb(0).then(function () { return self.signIn(app); }).then(function () { return self.load(); });
    };
    /* هل وصلت بيانات هذه المجموعة من السحابة فعلاً في هذا التشغيل؟ */
    this.serverSeen = function (c) { return !!seen[c]; };
    this.waitServer = function (c, ms) {
      var msg = 'تعذّر التأكد من بيانات النظام من السحابة. تحقق من الإنترنت ثم أعد فتح التطبيق.';
      if (seen[c]) return Promise.resolve();
      return timeout((readyBy[c] || Promise.resolve()).then(function () { if (!seen[c]) throw new Error(msg); }), ms, msg);
    };
    this.signIn = function (app) {
      if (!cfg.syncEmail) return Promise.resolve();
      var auth = fb.auth(app);
      return new Promise(function (res) { var off = auth.onAuthStateChanged(function (u) { off(); res(u); }); }).then(function (u) {
        var same = u && String(u.email || '').toLowerCase() === String(cfg.syncEmail).toLowerCase();
        /* الدخول المحفوظ قد يكون أُلغي (تغيير كلمة مرور المزامنة مثلاً): نتحقق منه، وعند رفضه ندخل من جديد */
        var check = same && typeof u.getIdToken === 'function'
          ? timeout(u.getIdToken(true).then(function () { return true; }), 3500, 'slow').catch(function (e) {
              var m = String(e && (e.code || e.message) || e);
              return !/token-expired|user-disabled|user-not-found|invalid-user-token|invalid-credential|requires-recent-login/i.test(m);
            })
          : Promise.resolve(!!same);
        return check.then(function (valid) {
          if (valid) return;
          var out = u && typeof auth.signOut === 'function' ? auth.signOut().catch(function () {}) : Promise.resolve();
          return out.then(function () { return login(); });
        });
      });
      function login() {
        return timeout(auth.signInWithEmailAndPassword(cfg.syncEmail, cfg.syncPassword || ''), 20000, 'تعذّر الاتصال بالسحابة. تحقق من الإنترنت ثم أعد فتح التطبيق.').catch(function (e) {
          var m = String(e && (e.code || e.message) || e);
          if (/wrong-password|user-not-found|invalid-credential|invalid-login|invalid-email/i.test(m)) throw new Error('بيانات حساب المزامنة في ملف الإعداد غير صحيحة (syncEmail / syncPassword).');
          if (/network/i.test(m)) throw new Error('أول تشغيل يحتاج اتصالاً بالإنترنت لربط النسخة بالسحابة.');
          throw e;
        });
      }
    };
    this.load = function () {
      var syncedKey = 'tamm_synced_' + cfg.projectId, synced = lsGet(syncedKey, {}), firsts = [];
      var reads = cols.map(function (c) { return col(c).get({ source: 'cache' }).catch(function () { return { forEach: function () {} }; }); });
      var jobs = Promise.all(reads).then(function (snaps) {
        /* النسخة المحلية غير متاحة أو فارغة تماماً: لا نثق بعلامات «تمت المزامنة» وننتظر السحابة لكل المجموعات */
        var total = 0;
        snaps.forEach(function (sn) { sn.forEach(function () { total++; }); });
        if (!persistOk || !total) synced = {};
        cols.forEach(function (c, ci) {
          var snap = snaps[ci];
          var maxU = 0;
          snap.forEach(function (d) {
            var x = d.data({ serverTimestamps: 'estimate' }) || {};
            TAMM.applyRemote(c, d.id, x);
            if (!d.metadata.hasPendingWrites && x.u && x.u.toMillis) maxU = Math.max(maxU, x.u.toMillis());
          });
          var full = !synced[c] || !maxU || maxU < Date.now() - 45 * 864e5;
          var q = full ? col(c) : col(c).where('u', '>', fb.firestore.Timestamp.fromMillis(maxU - (TAMM.syncMargin == null ? 300000 : TAMM.syncMargin)));
          var first = true, gotServer;
          var ready = new Promise(function (res) { gotServer = res; });
          q.onSnapshot({ includeMetadataChanges: true }, function (s) {
            var changed = false;
            s.docChanges().forEach(function (x) {
              if (x.type === 'removed') { if (full && TAMM.applyRemote(c, x.doc.id, null)) changed = true; return; }
              if (TAMM.applyRemote(c, x.doc.id, x.doc.data({ serverTimestamps: 'estimate' }))) changed = true;
            });
            if (!s.metadata.fromCache) {
              if (first && full) {
                /* مزامنة كاملة: احذف محلياً ما لم يعد موجوداً في السحابة */
                var ids = {}; s.forEach(function (d) { ids[d.id] = 1; });
                if (c === 'props' || c === 'live') { var m = c === 'props' ? TAMM.props : TAMM.live; Object.keys(m).forEach(function (k) { if (!ids[k]) delete m[k]; }); }
                else TAMM.list(c).slice().forEach(function (r) { if (!ids[r.id] && TAMM.applyRemote(c, r.id, null)) changed = true; });
              }
              first = false;
              var sy = lsGet(syncedKey, {}); if (!sy[c]) { sy[c] = 1; lsSet(syncedKey, sy); }
              seen[c] = true;
              gotServer();
              TAMM.setStatus({ online: true });
            } else if (!s.metadata.hasPendingWrites && first) TAMM.setStatus({ online: false });
            if (changed) TAMM.onRemote(c);
          }, function (e) {
            var m = String(e && e.message || e);
            TAMM.setStatus({ error: /permission|insufficient/i.test(m) ? 'لا تملك هذه النسخة صلاحية قراءة قاعدة البيانات. راجع قواعد Firestore وحساب المزامنة.' : 'انقطعت المزامنة: ' + m });
            gotServer();
          });
          readyBy[c] = ready;
          if (!synced[c]) firsts.push(ready);
        });
      });
      return jobs.then(function () {
        if (!firsts.length) return;
        var had = Object.keys(lsGet(syncedKey, {})).length > 0;
        return timeout(Promise.all(firsts), TAMM.bootWait || 45000, had
          ? 'تعذّر فتح النسخة المحلية من البيانات على هذا الجهاز، ويلزم اتصال بالإنترنت لتحميلها من السحابة. تحقق من الاتصال ثم أعد المحاولة.'
          : 'أول تشغيل يحتاج اتصالاً بالإنترنت لتحميل البيانات من السحابة. تحقق من الاتصال ثم أعد فتح التطبيق.');
      });
    };
    this.commit = function (ops) {
      for (var i = 0; i < ops.length; i += 400) {
        var b = db.batch();
        ops.slice(i, i + 400).forEach(function (op) {
          var ref = col(op.c).doc(op.id);
          if (op.data == null) b.set(ref, { d: true, u: FV.serverTimestamp() });
          else if (op.c === 'props' || op.c === 'live') b.set(ref, { v: op.data.v, u: FV.serverTimestamp() });
          else b.set(ref, { o: op.data.o, r: op.data.r, u: FV.serverTimestamp() });
        });
        track(b.commit());
      }
    };
    this.reserveSeq = function (k, count, floor) {
      var ref = col('seq').doc(k);
      return timeout(db.runTransaction(function (tx) {
        return tx.get(ref).then(function (s) {
          var cur = Math.max(s.exists ? Number(s.data().n) || 0 : 0, Number(floor) || 0);
          tx.set(ref, { n: cur + count });
          return cur + 1;
        });
      }), 15000, 'يلزم اتصال بالإنترنت لحجز أرقام جديدة. تحقق من الاتصال ثم أعد المحاولة.');
    };
    /* وقت الخادم الفعلي (يحتاج اتصالاً) */
    this.serverNow = function () {
      var ref = col('meta').doc('clock');
      return timeout(ref.set({ t: FV.serverTimestamp() }).then(function () { return ref.get({ source: 'server' }); }).then(function (s) {
        var t = s.exists ? s.data().t : null;
        return t && t.toMillis ? t.toMillis() : 0;
      }), 15000, 'offline');
    };
    /* الملف يُحفظ أولاً في قاعدة البيانات (يعمل دون اتصال)، ثم يُنقل إلى Google Drive إن كان مربوطاً */
    this.putFile = function (id, name, mime, b64) {
      var n = Math.max(1, Math.ceil(b64.length / CHUNK)), ref = col('files').doc(id);
      for (var i = 0; i < n; i++) track(ref.collection('c').doc(String(i)).set({ b: b64.substr(i * CHUNK, CHUNK) }));
      track(ref.set({ name: name, mime: mime, n: n, size: b64.length, st: 'c', t: Date.now(), u: FV.serverTimestamp() }));
      if (TAMM.drive.on()) TAMM.driveQ.add(id);
    };
    function offlineErr(e) {
      if (/offline|unavailable/i.test(String(e && e.message || e))) return new Error('الملف غير محفوظ على هذا الجهاز ويحتاج اتصالاً بالإنترنت لفتحه.');
      return e;
    }
    function readChunks(ref, m) {
      var jobs = [];
      for (var i = 0; i < (m.n || 0); i++) jobs.push(ref.collection('c').doc(String(i)).get());
      return Promise.all(jobs).then(function (parts) {
        if (!parts.length) return null;
        var data = '';
        for (var j = 0; j < parts.length; j++) { if (!parts[j].exists) return null; data += parts[j].data().b || ''; }
        return { name: m.name, mime: m.mime, data: data };
      });
    }
    function dropChunks(ref, n) {
      for (var i = 0; i < (n || 0); i++) ref.collection('c').doc(String(i)).delete().catch(function () {});
    }
    this.getFile = function (id) {
      var ref = col('files').doc(id);
      return ref.get().then(function (s) {
        if (!s.exists) return null;
        var m = s.data();
        if (m.st === 'd' && m.drive) {
          return TAMM.drive.call('get', { id: m.drive }).then(function (r) {
            return { name: r.name || m.name, mime: r.mime || m.mime, data: r.data };
          }, function (e) {
            if (/غير موجود/.test(e.message)) return null;
            throw e;
          });
        }
        return readChunks(ref, m);
      }).catch(function (e) { throw offlineErr(e); });
    };
    this.delFile = function (id) {
      var ref = col('files').doc(id);
      ref.get().then(function (s) {
        if (!s.exists) return;
        var m = s.data();
        if (m.drive && !TAMM.drive.keep()) TAMM.drive.call('del', { id: m.drive }).catch(function () {});
        dropChunks(ref, m.n);
        ref.delete().catch(function () {});
      }).catch(function () {});
      TAMM.driveQ.drop(id);
    };
    /* نقل ملف واحد إلى Google Drive. جهاز واحد فقط ينقل الملف في نفس الوقت */
    var devId = lsGet('tamm_dev_id', '');
    if (!devId) { devId = TAMM.newId(); lsSet('tamm_dev_id', devId); }
    var inflight = {};
    this.migrateFile = function (id) {
      if (inflight[id]) return inflight[id];
      var p = migrate(id);
      inflight[id] = p;
      var clear = function () { delete inflight[id]; };
      p.then(clear, clear);
      return p;
    };
    function migrate(id) {
      var ref = col('files').doc(id), meta = null;
      var claim = db.runTransaction(function (tx) {
        return tx.get(ref).then(function (s) {
          if (!s.exists) return 'gone';
          var m = s.data();
          if (m.st === 'd' || !m.n) return 'gone';
          if (m.st === 'm' && m.by !== devId && Number(m.at) > Date.now() - 15 * 60000) return 'busy';
          meta = m;
          tx.set(ref, Object.assign({}, m, { st: 'm', by: devId, at: Date.now() }));
          return 'go';
        });
      });
      return timeout(claim, 20000, 'offline').then(function (r) {
        if (r !== 'go') return r === 'busy' ? 'retry' : 'gone';
        var cached = TAMM.files.peek(id);
        return (cached ? Promise.resolve(cached) : readChunks(ref, meta)).then(function (f) {
          if (!f || !f.data) return 'gone';
          var d = new Date(Number(meta.t) || Date.now());
          var month = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
          return TAMM.drive.call('put', { name: f.name || meta.name || id, mime: f.mime || meta.mime, data: f.data, month: month }).then(function (res) {
            var m2 = Object.assign({}, meta, { st: 'd', drive: res.id, n: 0, u: FV.serverTimestamp() });
            delete m2.by; delete m2.at;
            return ref.set(m2).then(function () { dropChunks(ref, meta.n); return 'ok'; });
          });
        }).catch(function () {
          ref.set(Object.assign({}, meta, { st: 'c', u: FV.serverTimestamp() })).catch(function () {});
          return 'retry';
        });
      }, function () { return 'retry'; });
    }
    /* الإيصالات المحفوظة قبل الربط، أو التي لم يكملها جهاز آخر */
    this.pendingDrive = function (all) {
      var q = all ? col('files') : col('files').where('st', '==', 'c').limit(200);
      return q.get().then(function (snap) {
        var out = [], old = Date.now() - 10 * 60000;
        snap.forEach(function (d) {
          var m = d.data() || {};
          if (m.st === 'd' || !m.n) return;
          if (all || Number(m.t || 0) < old) out.push(d.id);
        });
        return out;
      });
    };
    this.archive = function (c, recs) {
      for (var i = 0; i < recs.length; i += 400) {
        var b = db.batch();
        recs.slice(i, i + 400).forEach(function (r) { b.set(col('arch_' + c).doc(r.id), { o: r.o, r: r.r, u: FV.serverTimestamp() }); });
        track(b.commit());
      }
    };
  };

  /* ---------- وضع محلي بدون سحابة (للتجربة قبل ربط Firebase) ---------- */
  TAMM.LocalBackend = function (cols) {
    var idb = null, timer = null, seq = {};
    function open() {
      return new Promise(function (res) {
        if (!G.indexedDB) return res(null);
        var rq = G.indexedDB.open('tamm_local', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); };
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { res(null); };
      });
    }
    function kget(k) {
      return new Promise(function (res) {
        if (!idb) return res(TAMM._mem && TAMM._mem[k]);
        var rq = idb.transaction('kv').objectStore('kv').get(k);
        rq.onsuccess = function () { res(rq.result); }; rq.onerror = function () { res(undefined); };
      });
    }
    function kset(k, v) {
      if (!idb) { (TAMM._mem = TAMM._mem || {})[k] = v; return; }
      try { var s = idb.transaction('kv', 'readwrite').objectStore('kv'); if (v === undefined) s.delete(k); else s.put(v, k); } catch (e) {}
    }
    function save() {
      var out = { t: {}, props: TAMM.props, live: TAMM.live, seq: seq };
      cols.forEach(function (c) { if (c !== 'props' && c !== 'live') out.t[c] = TAMM.list(c); });
      kset('db', JSON.stringify(out));
    }
    this.init = function () {
      return open().then(function (d) { idb = d; return kget('db'); }).then(function (raw) {
        if (!raw) return;
        var o = JSON.parse(raw);
        Object.keys(o.t || {}).forEach(function (c) { o.t[c].forEach(function (r) { TAMM.applyRemote(c, r.id, r); }); });
        Object.keys(o.props || {}).forEach(function (k) { TAMM.props[k] = o.props[k]; });
        Object.keys(o.live || {}).forEach(function (k) { TAMM.live[k] = o.live[k]; });
        seq = o.seq || {};
      });
    };
    this.commit = function () { clearTimeout(timer); timer = setTimeout(save, 60); };
    if (G.addEventListener) G.addEventListener('pagehide', function () { clearTimeout(timer); try { save(); } catch (e) {} });
    this.reserveSeq = function (k, count, floor) {
      var cur = Math.max(Number(seq[k]) || 0, Number(floor) || 0);
      seq[k] = cur + count; clearTimeout(timer); timer = setTimeout(save, 60);
      return Promise.resolve(cur + 1);
    };
    this.serverNow = function () { return Promise.resolve(Date.now()); };
    this.pendingDrive = function () { return Promise.resolve([]); };
    this.putFile = function (id, name, mime, b64) { kset('f:' + id, JSON.stringify({ name: name, mime: mime, data: b64 })); };
    this.getFile = function (id) { return kget('f:' + id).then(function (r) { return r ? JSON.parse(r) : null; }); };
    this.delFile = function (id) { kset('f:' + id, undefined); };
    this.archive = function (c, recs) { kget('arch:' + c).then(function (r) { var a = r ? JSON.parse(r) : []; kset('arch:' + c, JSON.stringify(a.concat(recs))); }); };
  };
})(typeof window !== 'undefined' ? window : globalThis);
