/**
 * تم للتحويلات — حفظ الإيصالات في Google Drive
 *
 * يُنشر مرة واحدة من حساب Google الخاص بالشركة:
 *   Deploy ← New deployment ← Web app
 *   Execute as: Me   ·   Who has access: Anyone
 * ثم يُلصق رابط Web app في التطبيق: الإعدادات ← حفظ الإيصالات في Google Drive.
 *
 * تُحفظ الإيصالات في مجلد «تم للتحويلات - الإيصالات» مرتبة حسب الشهر.
 * لربط السكربت بنسخة أخرى من التطبيق شغّل الدالة resetLink من المحرر.
 */
const FOLDER_NAME = 'تم للتحويلات - الإيصالات';
const MARK = 'tamm-receipt';
const TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;

function doGet() {
  return out_({ ok: true, app: 'tamm-drive', v: 1 });
}

function doPost(e) {
  let q;
  try { q = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (x) { return out_({ ok: false, error: 'REQUEST' }); }
  try { return out_(Object.assign({ ok: true }, handle_(q || {}))); }
  catch (x) { return out_({ ok: false, error: String((x && x.message) || x).slice(0, 200) }); }
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function same_(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function locked_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function handle_(q) {
  const P = PropertiesService.getScriptProperties();
  const k = String(q.k || '');
  if (!/^[A-Za-z0-9]{32,64}$/.test(k)) throw new Error('KEY');

  if (q.a === 'pair') {
    locked_(function () {
      const cur = P.getProperty('KEY') || '';
      if (cur && !same_(cur, k)) throw new Error('PAIRED');
      if (!cur) P.setProperty('KEY', k);
    });
    const f = root_();
    return { folder: f.getUrl() };
  }

  if (!same_(P.getProperty('KEY') || '', k)) throw new Error('KEY');

  if (q.a === 'ping') return { folder: root_().getUrl() };

  if (q.a === 'put') {
    const mime = String(q.mime || '');
    if (TYPES.indexOf(mime) < 0) throw new Error('TYPE');
    const data = String(q.data || '');
    if (!data || data.length > MAX_BYTES * 1.4) throw new Error('SIZE');
    const bytes = Utilities.base64Decode(data);
    if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('SIZE');
    const name = String(q.name || 'إيصال').replace(/[\\\/:*?"<>|\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) || 'إيصال';
    const month = /^\d{4}-\d{2}$/.test(String(q.month || '')) ? String(q.month) : Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM');
    const file = month_(month).createFile(Utilities.newBlob(bytes, mime, name));
    file.setDescription(MARK);
    return { id: file.getId() };
  }

  if (q.a === 'get' || q.a === 'del') {
    let f = null;
    try { f = DriveApp.getFileById(String(q.id || '')); } catch (x) { f = null; }
    if (!f || f.getDescription() !== MARK) throw new Error('NOTFOUND');
    if (q.a === 'del') { f.setTrashed(true); return {}; }
    if (f.isTrashed()) throw new Error('NOTFOUND');
    const b = f.getBlob();
    return { name: f.getName(), mime: b.getContentType(), data: Utilities.base64Encode(b.getBytes()) };
  }

  throw new Error('ACTION');
}

function root_() {
  return locked_(function () {
    const P = PropertiesService.getScriptProperties();
    const id = P.getProperty('FOLDER');
    if (id) {
      try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (x) {}
    }
    const it = DriveApp.getFoldersByName(FOLDER_NAME);
    const f = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
    P.setProperty('FOLDER', f.getId());
    return f;
  });
}

function month_(name) {
  const root = root_();
  return locked_(function () {
    const P = PropertiesService.getScriptProperties();
    const key = 'M_' + name, id = P.getProperty(key);
    if (id) {
      try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (x) {}
    }
    const it = root.getFoldersByName(name);
    const f = it.hasNext() ? it.next() : root.createFolder(name);
    P.setProperty(key, f.getId());
    return f;
  });
}

function resetLink() {
  PropertiesService.getScriptProperties().deleteProperty('KEY');
}
