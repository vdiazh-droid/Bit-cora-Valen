/* Bitácora · capa de datos
   Reemplaza el almacenamiento de Claude por Supabase (base de datos + fotos + inicio de sesión).
   Ofrece la misma forma de uso que tenía la página: db.collection(..).onSnapshot/add, db.doc('a/b').set/update/delete/onSnapshot,
   y assets.upload/delete. Además agrega el inicio de sesión, respaldo, importación y la llave para conectar otras apps. */
(function () {
  'use strict';
  const C = window.BITACORA_CONFIG || {};
  const configured = C.SUPABASE_URL && C.SUPABASE_ANON_KEY && !/TU-PROYECTO|TU_LLAVE/.test(C.SUPABASE_URL + C.SUPABASE_ANON_KEY);
  const BUCKET = 'fotos';
  const sb = configured ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;

  let user = null;
  const docs = new Map();      // 'col/id' -> data
  const localTs = new Map();   // 'col/id' -> marca de tiempo de la última escritura local
  const listeners = new Set();
  const assetCb = new Set();

  /* ---------- utilidades ---------- */
  const rid = (n = 20) => { const a = crypto.getRandomValues(new Uint8Array(n)); const c = 'abcdefghijklmnopqrstuvwxyz0123456789'; return [...a].map(x => c[x % 36]).join(''); };
  const hex = (n = 16) => [...crypto.getRandomValues(new Uint8Array(n))].map(x => x.toString(16).padStart(2, '0')).join('');
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const key = (col, id) => col + '/' + id;
  const split = path => { const i = path.indexOf('/'); return [path.slice(0, i), path.slice(i + 1)]; };
  const err = (e) => { const x = new Error(e && e.message || 'error'); if (e && /quota|exceed/i.test(e.message || '')) x.code = 'quota_exceeded'; return x; };

  function snapCol(col) {
    const ds = [];
    for (const [k, v] of docs) { const [c, id] = split(k); if (c === col) ds.push({ id, exists: true, data: () => clone(v) }); }
    return { docs: ds, size: ds.length, empty: !ds.length, metadata: { fromCache: false } };
  }
  function snapDoc(col, id) { const v = docs.get(key(col, id)); return { id, exists: v !== undefined, data: () => clone(v), metadata: { fromCache: false } }; }
  function emit(col, id) {
    for (const l of listeners) {
      if (l.col !== col) continue;
      try { if (l.id == null) l.cb(snapCol(col)); else if (l.id === id) l.cb(snapDoc(col, id)); } catch (e) { console.error(e); }
    }
  }

  /* ---------- escrituras ---------- */
  async function put(col, id, data) {
    const ts = new Date().toISOString(); const k = key(col, id);
    localTs.set(k, ts); docs.set(k, clone(data)); emit(col, id);
    const { error } = await sb.from('docs').upsert({ user_id: user.id, col, id, data, updated_at: ts });
    if (error) throw err(error);
  }
  async function remove(col, id) {
    const k = key(col, id); localTs.set(k, new Date().toISOString()); docs.delete(k); emit(col, id);
    const { error } = await sb.from('docs').delete().match({ user_id: user.id, col, id });
    if (error) throw err(error);
  }
  function docRef(col, id) {
    return {
      id,
      set: d => put(col, id, d),
      update: d => put(col, id, Object.assign(clone(docs.get(key(col, id))) || {}, d)),
      delete: () => remove(col, id),
      get: async () => snapDoc(col, id),
      onSnapshot(cb, onErr) { const l = { col, id, cb, onErr }; listeners.add(l); setTimeout(() => cb(snapDoc(col, id))); return () => listeners.delete(l); }
    };
  }
  const db = {
    collection: col => ({
      doc: id => docRef(col, id || rid()),
      add: async d => { const id = rid(); await put(col, id, d); return { id }; },
      get: async () => snapCol(col),
      onSnapshot(cb, onErr) { const l = { col, id: null, cb, onErr }; listeners.add(l); setTimeout(() => cb(snapCol(col))); return () => listeners.delete(l); }
    }),
    doc: path => { const [c, id] = split(path); return docRef(c, id); }
  };

  /* ---------- carga inicial y tiempo real ---------- */
  async function loadAll() {
    docs.clear();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('docs').select('col,id,data').range(from, from + 999);
      if (error) throw err(error);
      data.forEach(r => docs.set(key(r.col, r.id), r.data));
      if (data.length < 1000) break;
    }
    sb.channel('docs-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: 'user_id=eq.' + user.id }, p => {
        const row = p.eventType === 'DELETE' ? p.old : p.new; if (!row || !row.col) return;
        const k = key(row.col, row.id); const lt = localTs.get(k);
        if (lt && row.updated_at && row.updated_at < lt) return; // eco viejo de una escritura propia
        if (p.eventType === 'DELETE') docs.delete(k); else docs.set(k, row.data);
        emit(row.col, row.id);
      })
      .subscribe();
  }

  /* ---------- fotos ---------- */
  const urls = new Map(); const pend = new Set(); let tmr = null;
  function url(id) {
    if (!sb || !user) return '';
    if (urls.has(id)) return urls.get(id);
    pend.add(id); clearTimeout(tmr); tmr = setTimeout(fetchUrls, 30);
    return '';
  }
  async function fetchUrls() {
    const ids = [...pend]; pend.clear(); if (!ids.length) return;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(ids.map(i => user.id + '/' + i), 60 * 60 * 24 * 7);
    if (error || !data) return;
    data.forEach((r, i) => { if (r.signedUrl) urls.set(ids[i], r.signedUrl); });
    assetCb.forEach(f => f());
  }
  const assets = {
    async upload(blob, opt) {
      const type = (opt && opt.type) || blob.type || 'image/jpeg';
      if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) { const e = new Error('tipo'); e.code = 'unsupported_type'; throw e; }
      if (blob.size > 20e6) { const e = new Error('grande'); e.code = 'too_large'; throw e; }
      const id = hex();
      const { error } = await sb.storage.from(BUCKET).upload(user.id + '/' + id, blob, { contentType: type, upsert: false });
      if (error) { const e = new Error(error.message); e.code = /quota|exceed/i.test(error.message) ? 'quota_or_state' : 'upload'; throw e; }
      return { id };
    },
    async delete(id) { urls.delete(id); await sb.storage.from(BUCKET).remove([user.id + '/' + id]); }
  };

  /* ---------- respaldo ---------- */
  async function exportar(withImages) {
    const colecciones = {};
    for (const [k, v] of docs) { const [c, id] = split(k); (colecciones[c] = colecciones[c] || {})[id] = v; }
    const out = { version: 1, exportado: new Date().toISOString(), colecciones };
    if (withImages) {
      out.imagenes = {};
      const { data } = await sb.storage.from(BUCKET).list(user.id, { limit: 1000 });
      for (const f of data || []) {
        const { data: b } = await sb.storage.from(BUCKET).download(user.id + '/' + f.name);
        if (b) out.imagenes[f.name] = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }));
    a.download = 'respaldo-bitacora-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
  }
  async function importar(file, msg) {
    const b = JSON.parse(await file.text());
    if (!b || !b.colecciones) throw new Error('Ese archivo no parece un respaldo de la bitácora.');
    const imgs = Object.entries(b.imagenes || {});
    let n = 0;
    for (const [id, dataUrl] of imgs) {
      msg(`Subiendo imágenes ${++n} de ${imgs.length}…`);
      const blob = await (await fetch(dataUrl)).blob();
      const { error } = await sb.storage.from(BUCKET).upload(user.id + '/' + id, blob, { contentType: blob.type, upsert: true });
      if (error) throw err(error);
    }
    const rows = []; const ts = new Date().toISOString();
    for (const [col, m] of Object.entries(b.colecciones)) for (const [id, data] of Object.entries(m)) rows.push({ user_id: user.id, col, id, data, updated_at: ts });
    for (let i = 0; i < rows.length; i += 200) {
      msg(`Guardando datos ${Math.min(i + 200, rows.length)} de ${rows.length}…`);
      const { error } = await sb.from('docs').upsert(rows.slice(i, i + 200)); if (error) throw err(error);
    }
    rows.forEach(r => { docs.set(key(r.col, r.id), r.data); localTs.set(key(r.col, r.id), ts); });
    new Set(rows.map(r => r.col)).forEach(c => { emit(c, null); rows.filter(r => r.col === c).forEach(r => emit(c, r.id)); });
    urls.clear(); assetCb.forEach(f => f());
    return rows.length;
  }

  /* ---------- interfaz: inicio de sesión y ajustes ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .bk-over{position:fixed;inset:0;z-index:30;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto}
  .bk-card{width:100%;max-width:440px;background:var(--paper);border:1px solid var(--line);border-left:4px solid var(--red);padding:24px}
  .bk-card h2{font-size:34px;margin:0 0 6px}.bk-card p{color:var(--soft);margin:0 0 16px}
  .bk-card form{display:grid;gap:12px}.bk-msg{font-size:14px;margin-top:12px;color:var(--ink)}
  .bk-gear{background:none;border:0;cursor:pointer;color:var(--soft);font-weight:600;font-size:14px;min-height:42px;padding:0 10px}
  .bk-dlg{position:fixed;inset:0;z-index:25;background:rgba(15,15,15,.45);display:flex;justify-content:flex-end}
  .bk-panel{width:min(520px,100%);height:100%;overflow:auto;background:var(--bg);padding:20px max(4vw,16px) 40px;border-left:2px solid var(--ink)}
  .bk-panel h3{margin:28px 0 8px}.bk-panel p{color:var(--soft);font-size:15px;margin:0 0 10px}
  .bk-panel code{font-size:13px;background:var(--paper);border:1px solid var(--line);padding:2px 6px;word-break:break-all}
  .bk-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .bk-tok{display:flex;justify-content:space-between;gap:8px;border-top:1px solid var(--line);padding:8px 0;align-items:center}
  .bk-tok code{flex:1}`;
  document.head.appendChild(css);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function loginScreen() {
    return new Promise(resolve => {
      const o = document.createElement('div'); o.className = 'bk-over';
      o.innerHTML = `<div class="bk-card"><h2>Mi bitácora</h2><p>Entra con tu correo y tu contraseña.</p>
        <form><div><label for="bk-mail">Correo</label><input id="bk-mail" type="email" required autocomplete="email"></div>
        <div><label for="bk-pass">Contraseña</label><input id="bk-pass" type="password" required minlength="8" autocomplete="current-password"></div>
        <button class="btn red" data-b="in">Entrar</button>
        <div class="bk-row"><button type="button" class="link" data-b="up">Es mi primera vez: crear mi cuenta</button><button type="button" class="link" data-b="forgot">Olvidé mi contraseña</button></div></form>
        <div class="bk-msg" role="status"></div></div>`;
      document.body.appendChild(o);
      const m = o.querySelector('.bk-msg'), f = o.querySelector('form');
      const mail = () => o.querySelector('#bk-mail').value.trim(), pass = () => o.querySelector('#bk-pass').value;
      const tr = e => /invalid login/i.test(e.message) ? 'Correo o contraseña incorrectos.' : /not confirmed/i.test(e.message) ? 'Tu correo aún no está confirmado: abre el enlace que te llegó, o desactiva «Confirm email» en Supabase.' : /signups? not allowed|disabled/i.test(e.message) ? 'La creación de cuentas está cerrada.' : /already registered/i.test(e.message) ? 'Ese correo ya tiene cuenta: usa «Entrar».' : e.message;
      f.addEventListener('submit', async e => {
        e.preventDefault(); m.textContent = 'Entrando…';
        const { error } = await sb.auth.signInWithPassword({ email: mail(), password: pass() });
        if (error) m.textContent = tr(error);
      });
      o.querySelector('[data-b=up]').onclick = async () => {
        if (!f.reportValidity()) return; m.textContent = 'Creando tu cuenta…';
        const { data, error } = await sb.auth.signUp({ email: mail(), password: pass(), options: { emailRedirectTo: location.origin + location.pathname } });
        if (error) m.textContent = tr(error);
        else if (!data.session) m.textContent = 'Cuenta creada. Revisa tu correo y abre el enlace para confirmarla; después vuelve y toca «Entrar».';
      };
      o.querySelector('[data-b=forgot]').onclick = async () => {
        if (!mail()) { m.textContent = 'Escribe tu correo primero.'; return; }
        const { error } = await sb.auth.resetPasswordForEmail(mail(), { redirectTo: location.origin + location.pathname });
        m.textContent = error ? error.message : 'Te enviamos un enlace. Ábrelo y la página te pedirá una contraseña nueva.';
      };
      const { data: sub } = sb.auth.onAuthStateChange((_ev, s) => { if (s && s.user) { sub.subscription.unsubscribe(); o.remove(); resolve(s.user); } });
    });
  }

  function gear() {
    const nav = document.querySelector('header nav'); if (!nav || document.querySelector('.bk-gear')) return;
    const b = document.createElement('button'); b.className = 'bk-gear'; b.textContent = 'Ajustes'; b.type = 'button';
    b.addEventListener('click', openPanel); nav.after(b);
  }

  async function openPanel() {
    const d = document.createElement('div'); d.className = 'bk-dlg';
    d.innerHTML = `<div class="bk-panel" role="dialog" aria-label="Ajustes">
      <div class="bk-row" style="justify-content:space-between"><strong style="font-size:22px">Ajustes</strong><button class="btn ghost small" data-x="close">Cerrar</button></div>
      <p style="margin-top:8px">Sesión iniciada como <strong>${esc(user.email)}</strong></p>
      <h3>Respaldo</h3><p>Descarga todo en un archivo, o carga un respaldo (por ejemplo, el que trae los datos que tenías en Claude).</p>
      <div class="bk-row"><button class="btn small" data-x="exp">Descargar datos</button><button class="btn ghost small" data-x="expi">Descargar con imágenes</button>
      <label class="btn ghost small" style="display:inline-flex;align-items:center;margin:0;text-transform:none;letter-spacing:0;color:var(--ink);font-size:14px">Cargar respaldo<input type="file" accept="application/json,.json" data-x="imp" hidden></label></div>
      <h3>Conectar otras apps</h3><p>Crea una llave para cada app que quieras conectar (Zapier, Make, n8n, Atajos de iPhone, Google Sheets…). Con ella esa app puede leer tu bitácora y anotar cosas. Si una llave se filtra, bórrala.</p>
      <div class="bk-row"><input data-x="tname" placeholder="Nombre, ej: Atajos iPhone" style="flex:1;min-width:180px"><button class="btn red small" data-x="tnew">Crear llave</button></div>
      <div data-x="toks" style="margin-top:10px"></div>
      <p style="margin-top:14px">Dirección para las apps: <code>${esc(C.SUPABASE_URL)}/rest/v1/rpc/</code><br>Encabezado <code>apikey</code>: tu llave pública (la de <code>config.js</code>). Las instrucciones completas están en el archivo LEEME.</p>
      <h3>Sesión</h3><div class="bk-row"><button class="btn ghost small" data-x="pw">Cambiar contraseña</button><button class="btn ghost small" data-x="out">Cerrar sesión</button></div>
      <div class="bk-msg" role="status" data-x="msg"></div></div>`;
    document.body.appendChild(d);
    const $ = x => d.querySelector(`[data-x="${x}"]`); const msg = t => { $('msg').textContent = t; };
    const close = () => d.remove();
    d.addEventListener('click', e => { if (e.target === d) close(); });
    $('close').onclick = close;
    $('exp').onclick = () => exportar(false).catch(e => msg(e.message));
    $('expi').onclick = () => { msg('Preparando…'); exportar(true).then(() => msg('')).catch(e => msg(e.message)); };
    $('imp').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const n = await importar(f, msg); msg(`Listo: se cargaron ${n} registros.`); } catch (er) { msg('No se pudo cargar: ' + er.message); } };
    $('pw').onclick = nuevaClave;
    $('out').onclick = async () => { await sb.auth.signOut(); location.reload(); };
    async function toks() {
      const { data, error } = await sb.from('api_tokens').select('token,name,created_at').order('created_at');
      if (error) { $('toks').innerHTML = `<p>${esc(error.message)}</p>`; return; }
      $('toks').innerHTML = data.length ? data.map(t => `<div class="bk-tok"><span><strong>${esc(t.name || 'Sin nombre')}</strong><br><code>${esc(t.token)}</code></span><button class="link" data-del="${esc(t.token)}">Borrar</button></div>`).join('') : '<p>Aún no tienes llaves.</p>';
      $('toks').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { await sb.from('api_tokens').delete().eq('token', b.dataset.del); toks(); });
    }
    $('tnew').onclick = async () => { const { error } = await sb.from('api_tokens').insert({ name: $('tname').value.trim() || null }); if (error) msg(error.message); $('tname').value = ''; toks(); };
    toks();
  }

  async function nuevaClave() {
    const p = prompt('Escribe tu contraseña nueva (mínimo 8 caracteres):');
    if (!p) return;
    const { error } = await sb.auth.updateUser({ password: p });
    alert(error ? 'No se pudo cambiar: ' + error.message : 'Listo, tu contraseña quedó cambiada.');
  }

  /* ---------- API pública para la página ---------- */
  let ready = null;
  async function start() {
    if (!configured) throw new Error('Falta configurar la conexión: abre config.js y pega la dirección y la llave pública de tu proyecto de Supabase.');
    sb.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') setTimeout(nuevaClave, 300); });
    const { data } = await sb.auth.getSession();
    user = data.session ? data.session.user : await loginScreen();
    await loadAll();
    gear();
    sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') location.reload(); });
  }
  window.Bitacora = {
    use(what) { ready = ready || start(); return ready.then(() => what === 'db' ? db : what === 'assets' ? assets : null); },
    url, onAssets(f) { assetCb.add(f); }
  };
})();
