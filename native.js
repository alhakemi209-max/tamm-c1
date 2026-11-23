/* تم للتحويلات — ربط الواجهة بمحرك التطبيق وبوظائف الجهاز */
(function () {
  'use strict';
  window.PULSE_MS = 2000;

  /* لا تعمل الصفحة داخل إطار صفحة أخرى */
  if (window.top !== window.self) { try { document.documentElement.innerHTML = ''; } catch (e) {} throw new Error('framed'); }

  /* كود الربط القادم في الرابط (#k=...) يُحفظ على الجهاز ويُزال من العنوان */
  var CODE_KEY = 'tamm_link_code';
  function cleanCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function saveCode(c) { try { localStorage.setItem(CODE_KEY, JSON.stringify(cleanCode(c))); } catch (e) {} }
  function takeHashCode() {
    var m = /[#&]k=([A-Za-z0-9-]{6,40})/.exec(location.hash || '');
    if (!m) return false;
    saveCode(m[1]);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    return true;
  }
  takeHashCode();
  window.addEventListener('hashchange', function () { if (takeHashCode()) location.reload(); });

  /* ===== المحرك في إطار مستقل ===== */
  var frame = document.createElement('iframe');
  frame.src = 'engine.html'; frame.title = 'engine'; frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
  var engine = new Promise(function (res, rej) {
    frame.onload = function () {
      var w = frame.contentWindow;
      if (!w || !w.TAMM || !w.TAMM.started) return rej(new Error('تعذّر تشغيل محرك التطبيق.'));
      w.TAMM.started.then(function (r) {
        if (!r.ok) return rej(new Error(r.error));
        w.TAMM.listeners.push(onStatus);
        res(w.TAMM);
      });
    };
    frame.onerror = function () { rej(new Error('تعذّر تشغيل محرك التطبيق.')); };
  });
  (document.body || document.documentElement).appendChild(frame);
  engine.catch(function (e) {
    if (e.message === 'NEED_CODE' || e.message === 'BAD_CODE') askCode(e.message === 'BAD_CODE');
    else bootError(e.message);
  });

  function runner(ok, fail) {
    return new Proxy({}, {
      get: function (_, k) {
        if (k === 'withSuccessHandler') return function (f) { return runner(f, fail); };
        if (k === 'withFailureHandler') return function (f) { return runner(ok, f); };
        if (k === 'withUserObject') return function () { return runner(ok, fail); };
        return function () {
          var args = JSON.stringify(Array.prototype.slice.call(arguments));
          engine.then(function (T) { return T.runJson(String(k), args); }).then(
            function (s) { ok && ok(JSON.parse(s)); },
            function (e) { var err = new Error(String(e && e.message || e)); fail ? fail(err) : console.error(err); });
        };
      }
    });
  }
  window.google = { script: { run: runner(null, null), host: { close: function () {} } } };

  /* ===== رسائل الحالة ===== */
  function el(tag, css, text) { var e = document.createElement(tag); e.style.cssText = css; if (text) e.textContent = text; return e; }
  function bootError(msg) {
    var box = el('div', 'position:fixed;inset:0;z-index:99999;background:#00286C;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:28px;text-align:center;font:500 16px/1.8 "IBM Plex Sans Arabic",Tahoma,sans-serif');
    box.setAttribute('dir', 'rtl');
    box.appendChild(el('div', 'font-size:20px;font-weight:700', 'تعذّر فتح البيانات'));
    box.appendChild(el('div', 'max-width:460px;opacity:.92', msg));
    var b = el('button', 'border:0;border-radius:10px;padding:10px 26px;background:#fff;color:#00286C;font:600 15px inherit;cursor:pointer', 'إعادة المحاولة');
    b.onclick = function () { location.reload(); };
    box.appendChild(b);
    document.body.appendChild(box);
  }
  /* شاشة إدخال كود الربط (نسخة الويب، مرة واحدة لكل جهاز) */
  function askCode(bad) {
    var FONT = '"IBM Plex Sans Arabic",Tahoma,sans-serif';
    var box = el('form', 'position:fixed;inset:0;z-index:99999;background:#00286C;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:28px;text-align:center;font:500 16px/1.8 ' + FONT);
    box.setAttribute('dir', 'rtl');
    box.appendChild(el('div', 'font-size:20px;font-weight:700', 'ربط هذا الجهاز'));
    box.appendChild(el('div', 'max-width:420px;opacity:.92', bad ? 'كود الربط غير صحيح. تأكد منه ثم أعد كتابته.' : 'اكتب كود الربط الذي استلمته من مدير النظام. يُطلب مرة واحدة فقط على هذا الجهاز.'));
    var inp = el('input', 'width:min(320px,86vw);border:0;border-radius:10px;padding:12px 14px;font:600 18px Consolas,monospace;letter-spacing:2px;text-align:center;direction:ltr;color:#00286C;background:#fff');
    inp.setAttribute('autocomplete', 'off'); inp.setAttribute('autocapitalize', 'characters'); inp.setAttribute('aria-label', 'كود الربط'); inp.placeholder = 'XXXX-XXXX-XXXX';
    box.appendChild(inp);
    var b = el('button', 'border:0;border-radius:10px;padding:10px 30px;background:#fff;color:#00286C;font:600 15px ' + FONT + ';cursor:pointer', 'ربط');
    b.type = 'submit'; box.appendChild(b);
    box.onsubmit = function (ev) {
      ev.preventDefault();
      if (cleanCode(inp.value).length < 6) { inp.focus(); return; }
      saveCode(inp.value); location.reload();
    };
    document.body.appendChild(box);
    try { inp.focus(); } catch (e) {}
  }
  var bar = null, lastMsg = '';
  function onStatus(st) {
    var msg = st.error || '';
    if (msg === lastMsg) return;
    lastMsg = msg;
    if (!msg) { if (bar) { bar.remove(); bar = null; } return; }
    if (!bar) {
      bar = el('div', 'position:fixed;left:12px;right:12px;bottom:12px;z-index:99998;background:#D12A2A;color:#fff;border-radius:10px;padding:10px 14px;font:500 13px/1.7 "IBM Plex Sans Arabic",Tahoma,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)');
      bar.setAttribute('dir', 'rtl'); document.body.appendChild(bar);
    }
    bar.textContent = msg;
  }

  /* ===== وظائف الجهاز (داخل تطبيق ويندوز/أندرويد) ===== */
  function isApp() { return !!(window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === 'function'); }
  function native() { return window.flutter_inappwebview.callHandler.apply(window.flutter_inappwebview, arguments); }
  var IS_ANDROID = /Android/i.test(navigator.userAgent);
  function blobB64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).split(',')[1] || ''); };
      fr.onerror = function () { rej(new Error('تعذّرت قراءة الملف.')); };
      fr.readAsDataURL(blob);
    });
  }
  function saveHref(href, name) {
    return fetch(href).then(function (r) { return r.blob(); }).then(function (b) {
      return blobB64(b).then(function (d) { return native('saveFile', name || 'file', b.type || 'application/octet-stream', d); });
    }).catch(function (e) { console.error(e); });
  }
  function external(u) { return /^(https?:|mailto:|tel:|whatsapp:)/i.test(u) && !(/^https?:/i.test(u) && new URL(u, location.href).host === location.host); }
  function handleAnchor(a) {
    if (!isApp() || !a) return false;
    var href = String(a.href || '');
    if (a.hasAttribute('download') && /^(blob:|data:)/i.test(href)) { saveHref(href, a.getAttribute('download')); return true; }
    if (external(href)) { native('openUrl', href); return true; }
    return false;
  }
  var aClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (!handleAnchor(this)) return aClick.call(this); };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (a && handleAnchor(a)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  var wOpen = window.open;
  window.open = function (u) {
    if (isApp() && u) {
      u = String(u);
      var fake = { closed: false, opener: null, close: function () {}, focus: function () {} };
      if (/^(blob:|data:)/i.test(u)) { saveHref(u, 'ملف'); return fake; }
      if (external(u)) { native('openUrl', u); return fake; }
    }
    return wOpen.apply(window, arguments);
  };
  if (IS_ANDROID) {
    var wPrint = window.print;
    window.print = function () { if (isApp()) native('print'); else wPrint.call(window); };
    try {
      var oCan = navigator.canShare ? navigator.canShare.bind(navigator) : null, oShare = navigator.share ? navigator.share.bind(navigator) : null;
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: function (d) { return isApp() ? !!(d && d.files && d.files.length) : !!oCan && oCan(d); } });
      Object.defineProperty(navigator, 'share', {
        configurable: true, value: function (d) {
          if (!isApp()) return oShare ? oShare(d) : Promise.reject(new Error('المشاركة غير متاحة.'));
          var f = d && d.files && d.files[0];
          if (!f) return Promise.reject(new Error('المشاركة غير متاحة.'));
          return blobB64(f).then(function (b) { return native('shareFile', f.name || 'file', f.type || 'application/octet-stream', b, String(d.text || '')); });
        }
      });
    } catch (e) {}
  }
  /* نسخة الويب: حفظ ملفات الواجهة على الجهاز لتفتح دون اتصال */
  if (location.protocol === 'https:' && 'serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  /* زر الرجوع في أندرويد: يغلق النافذة المفتوحة إن وُجدت */
  window.__tammBack = function () {
    var m = document.querySelector('#modal');
    if (m && !m.hidden) { var x = m.querySelector('[data-close]'); if (x) { x.click(); return true; } }
    return false;
  };
})();

/* ===== الإيصالات بكل أنواعها: الصور غير الشائعة تُحوَّل إلى JPEG، ولقطات الشاشة تُلصق مباشرة ===== */
(function () {
  'use strict';
  var OK_TYPES = { 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1, 'application/pdf': 1 };
  var MAX = 8 * 1024 * 1024;
  function isImg(f) { return /^image\//i.test(f.type || '') || /\.(heic|heif|bmp|gif|tiff?|avif|jpe?g|png|webp)$/i.test(f.name || ''); }
  function needs(f) {
    if (/pdf$/i.test(f.type || '') || /\.pdf$/i.test(f.name || '')) return false;
    if (!isImg(f)) return false;
    return !OK_TYPES[String(f.type || '').toLowerCase()] || f.size > MAX;
  }
  function decode(f) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(f).catch(function () { return viaImg(f); });
    }
    return viaImg(f);
  }
  function viaImg(f) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(f), im = new Image();
      im.onload = function () { URL.revokeObjectURL(u); res(im); };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('decode')); };
      im.src = u;
    });
  }
  function toJpeg(f) {
    return decode(f).then(function (im) {
      var w = im.width || im.naturalWidth, h = im.height || im.naturalHeight, k = Math.min(1, 2600 / Math.max(w, h));
      var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
      var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
      im.close && im.close();
      return new Promise(function (res) { c.toBlob(res, 'image/jpeg', 0.9); }).then(function (b) {
        c.width = c.height = 0;
        if (!b) throw new Error('encode');
        var base = String(f.name || 'صورة').replace(/\.[^.]+$/, '');
        return new File([b], base + '.jpg', { type: 'image/jpeg', lastModified: Date.now() });
      });
    });
  }
  window.normImgs = function (files) {
    return Promise.all(Array.prototype.slice.call(files || []).map(function (f) {
      return needs(f) ? toJpeg(f).catch(function () { return f; }) : Promise.resolve(f);
    }));
  };

  function stamp() {
    var d = new Date(), p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + '-' + p(d.getMinutes()) + '-' + p(d.getSeconds());
  }
  document.addEventListener('paste', function (ev) {
    var cd = ev.clipboardData;
    if (!cd) return;
    var files = Array.prototype.slice.call(cd.items || []).filter(function (i) { return i.kind === 'file'; }).map(function (i) { return i.getAsFile(); }).filter(Boolean);
    if (!files.length && cd.files) files = Array.prototype.slice.call(cd.files);
    files = files.filter(function (f) { return isImg(f) || /pdf$/i.test(f.type || ''); });
    if (!files.length) return;
    files = files.map(function (f, i) {
      if (f.name && !/^image\.(png|jpe?g)$/i.test(f.name)) return f;
      var ext = /jpe?g/i.test(f.type) ? '.jpg' : '.png';
      return new File([f], 'لقطة شاشة ' + stamp() + (files.length > 1 ? ' (' + (i + 1) + ')' : '') + ext, { type: f.type || 'image/png', lastModified: Date.now() });
    });
    /* نافذة مفتوحة فيها خانة إرفاق ملف: يوضع الملف فيها */
    var modal = document.querySelector('#modal');
    var input = modal && !modal.hidden ? modal.querySelector('input[type=file]') : null;
    if (input && !input.disabled) {
      ev.preventDefault();
      window.normImgs([files[0]]).then(function (l) {
        try {
          var dt = new DataTransfer(); dt.items.add(l[0]); input.files = dt.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          typeof toast === 'function' && toast('تم إرفاق لقطة الشاشة');
        } catch (e) { typeof toast === 'function' && toast('تعذّر إرفاق الصورة الملصوقة. اختر الملف يدوياً.', true); }
      });
      return;
    }
    /* شاشة مطابقة الإيصالات */
    if (document.querySelector('#rcIn') && typeof addReceipts === 'function') {
      ev.preventDefault();
      addReceipts(files);
    }
  });
})();

/* ===== إعداد حفظ الإيصالات في Google Drive (مدير النظام) ===== */
(function () {
  'use strict';
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function isAdmin() { try { return typeof role === 'function' && role() === 'admin'; } catch (e) { return false; } }
  window.driveCard = function () {
    if (!isAdmin()) return '';
    setTimeout(dvLoad, 0);
    return '<div class="card" id="dvCard"><h3 class="sec-t" style="font-size:14px">حفظ الإيصالات في Google Drive</h3>' +
      '<p class="sec-s">تُحفظ الإيصالات بكل أنواعها (PDF والصور ولقطات الشاشة) في Google Drive الخاص بالشركة، داخل مجلد «تم للتحويلات - الإيصالات» مرتبة حسب الشهر.</p>' +
      '<div id="dvBody"><div class="empty" style="padding:10px 0"><span class="spin"></span></div></div></div>';
  };
  function dvLoad() {
    var body = document.querySelector('#dvBody');
    if (!body) return;
    call('driveInfo', S.token).then(function (i) { dvDraw(i); }, function (e) { body.innerHTML = '<div class="err">' + h(e.message) + '</div>'; });
  }
  function dvDraw(i) {
    var body = document.querySelector('#dvBody');
    if (!body) return;
    if (!i.cloud) { body.innerHTML = '<div class="hint">يعمل بعد ربط النسخة بقاعدة البيانات السحابية.</div>'; return; }
    var st = i.on
      ? '<span class="tag" style="background:#E7F6EE;color:#0A7A43;font-weight:600">مربوط</span>' + (i.folder ? ' <a href="' + h(i.folder) + '" target="_blank" rel="noopener" style="margin-inline-start:8px">فتح المجلد</a>' : '') + (i.pending ? '<span class="hint" style="margin-inline-start:10px">بانتظار النقل من هذا الجهاز: ' + i.pending + '</span>' : '')
      : '<span class="tag">غير مربوط</span>';
    body.innerHTML = '<div style="margin-bottom:12px">' + st + '</div>' +
      '<details' + (i.on ? '' : ' open') + ' style="margin-bottom:12px"><summary style="cursor:pointer;font-weight:600">طريقة الربط (مرة واحدة)</summary>' +
      '<ol style="margin:8px 0 0;padding-inline-start:20px;line-height:2">' +
      '<li>افتح <b dir="ltr">script.google.com</b> بحساب Google الخاص بالشركة، واضغط <b>New project</b>.</li>' +
      '<li>احذف الكود الموجود والصق كود الربط: <button type="button" class="btn ghost sm" id="dvCopy">نسخ كود الربط</button></li>' +
      '<li>اضغط <b>Deploy</b> ثم <b>New deployment</b> واختر النوع <b>Web app</b>. اجعل <b>Execute as: Me</b> و <b>Who has access: Anyone</b>، ثم <b>Deploy</b> ووافق على الصلاحيات.</li>' +
      '<li>انسخ رابط <b>Web app</b> والصقه هنا، ثم اضغط «ربط واختبار».</li></ol></details>' +
      '<label class="lbl" for="dvUrl">رابط Web app</label>' +
      '<input class="field" id="dvUrl" dir="ltr" style="text-align:left" placeholder="https://script.google.com/macros/s/…/exec" value="' + h(i.url) + '">' +
      '<label style="display:flex;gap:8px;align-items:flex-start;margin-top:12px"><input type="checkbox" id="dvKeep"' + (i.keep ? ' checked' : '') + '> الاحتفاظ بالإيصال في Google Drive بعد حذفه من النظام بانتهاء مدة الحفظ</label>' +
      '<div class="err" id="dvErr" hidden></div>' +
      '<div class="acts" style="margin-top:12px"><button type="button" class="btn primary" id="dvGo">' + (i.on ? 'حفظ واختبار' : 'ربط واختبار') + '</button></div>';
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).catch(function () { return fallback(t); });
    return Promise.resolve(fallback(t));
    function fallback(x) { var a = document.createElement('textarea'); a.value = x; a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } finally { a.remove(); } }
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target && ev.target.closest ? ev.target.closest('#dvCopy,#dvGo') : null;
    if (!b) return;
    ev.preventDefault();
    if (b.id === 'dvCopy') {
      fetch('drive_bridge.gs', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.text(); })
        .then(copyText).then(function () { toast('نُسخ كود الربط. الصقه في محرر Apps Script'); }, function () { toast('تعذّر نسخ الكود', true); });
      return;
    }
    var url = document.querySelector('#dvUrl').value.trim(), keep = document.querySelector('#dvKeep').checked, err = document.querySelector('#dvErr');
    err.hidden = true;
    var old = b.textContent; b.disabled = true; b.textContent = 'جارٍ الاختبار…';
    call('driveLink', S.token, url, keep).then(function (i) {
      dvDraw(i); toast('تم ربط Google Drive. الإيصالات تُحفظ في المجلد من الآن');
    }, function (e) {
      b.disabled = false; b.textContent = old; err.textContent = e.message; err.hidden = false;
    });
  });
  document.addEventListener('change', function (ev) {
    if (!ev.target || ev.target.id !== 'dvKeep') return;
    var u = document.querySelector('#dvUrl');
    if (!u || !u.value.trim()) return;
    call('driveKeep', S.token, ev.target.checked).then(function () { toast('تم الحفظ'); }, function (e) { toast(e.message, true); });
  });
})();
