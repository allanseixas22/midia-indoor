// Painel de mídia indoor — SPA simples sem framework.
const $ = (s, el = document) => el.querySelector(s);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const app = $('#app');
let TOKEN = localStorage.getItem('token') || '';

// ---------- API ----------
async function api(path, { method = 'GET', body, raw, headers = {} } = {}) {
  const h = { ...headers };
  if (TOKEN) h['Authorization'] = 'Bearer ' + TOKEN;
  let payload = body;
  if (body && !raw) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch('/api' + path, { method, headers: h, body: payload });
  if (res.status === 401) { logout(); throw new Error('sessão expirada'); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'erro');
  return data;
}
function toast(msg) {
  const t = el(`<div class="toast">${msg}</div>`);
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}
function logout() { TOKEN = ''; localStorage.removeItem('token'); renderAuth(); }

// ---------- AUTH ----------
async function renderAuth() {
  const { setupNeeded } = await api('/setup-needed').catch(() => ({ setupNeeded: false }));
  const title = setupNeeded ? 'Criar conta do administrador' : 'Entrar no painel';
  const btn = setupNeeded ? 'Criar conta' : 'Entrar';
  app.innerHTML = '';
  const card = el(`
    <div class="login"><div class="card">
      <div class="brand"><span class="dot"></span> Mídia Indoor</div>
      <h1 style="font-size:18px">${title}</h1>
      <p class="sub">${setupNeeded ? 'Esta é a primeira vez. Defina o usuário e a senha do dono do sistema.' : 'Use seu usuário e senha.'}</p>
      <div style="margin-bottom:12px"><label>Usuário</label><input id="u" autocomplete="username"></div>
      <div style="margin-bottom:16px"><label>Senha</label><input id="p" type="password" autocomplete="current-password"></div>
      <button id="go" style="width:100%">${btn}</button>
      <p id="err" class="sub" style="color:var(--danger);margin-top:12px"></p>
    </div></div>`);
  app.appendChild(card);
  $('#go').onclick = async () => {
    try {
      const username = $('#u').value.trim(), password = $('#p').value;
      const ep = setupNeeded ? '/register' : '/login';
      const { token } = await api(ep, { method: 'POST', body: { username, password } });
      TOKEN = token; localStorage.setItem('token', token); renderApp();
    } catch (e) { $('#err').textContent = e.message; }
  };
  $('#p').onkeydown = (e) => { if (e.key === 'Enter') $('#go').click(); };
}

// ---------- SHELL ----------
const PAGES = ['Telas', 'Mídias', 'Playlists'];
let current = 'Telas';
function renderApp() {
  app.innerHTML = '';
  const shell = el(`
    <div class="shell">
      <aside class="side">
        <div class="brand"><span class="dot"></span> Mídia Indoor</div>
        <nav class="nav" id="nav"></nav>
        <div style="position:absolute;bottom:18px"><button class="ghost" id="logout">Sair</button></div>
      </aside>
      <main class="main" id="main"></main>
    </div>`);
  app.appendChild(shell);
  const nav = $('#nav');
  PAGES.forEach(p => {
    const a = el(`<a href="#" ${p === current ? 'class="active"' : ''}>${p}</a>`);
    a.onclick = (e) => { e.preventDefault(); current = p; renderApp(); };
    nav.appendChild(a);
  });
  $('#logout').onclick = logout;
  ({ Telas: pageDevices, 'Mídias': pageMedia, Playlists: pagePlaylists })[current]();
}

// ---------- TELAS ----------
async function pageDevices() {
  const main = $('#main');
  main.innerHTML = `<h1>Telas</h1><p class="sub">Cada TV é uma tela. Crie uma, pareie o app pelo código e escolha a playlist que ela exibe.</p>
    <div class="toolbar"><button id="add">+ Nova tela</button><div class="spacer"></div></div>
    <div class="card"><table><thead><tr><th>Nome</th><th>Status</th><th>Código / Token</th><th>Playlist</th><th></th></tr></thead><tbody id="tb"></tbody></table></div>`;
  const [devices, playlists] = await Promise.all([api('/devices'), api('/playlists')]);
  const tb = $('#tb');
  if (!devices.length) tb.appendChild(el(`<tr><td colspan="5" class="muted">Nenhuma tela ainda. Clique em "Nova tela".</td></tr>`));
  devices.forEach(d => {
    const opts = ['<option value="">— sem playlist —</option>']
      .concat(playlists.map(p => `<option value="${p.id}" ${p.id === d.playlist_id ? 'selected' : ''}>${p.name}</option>`)).join('');
    const status = d.paired ? `<span class="pill ok">pareada</span>` : `<span class="pill wait">aguardando</span>`;
    const codeCell = d.paired ? `<span class="muted">conectada</span>` : `<span class="code">${d.pair_code}</span>`;
    const tr = el(`<tr>
      <td>${d.name}</td><td>${status}</td><td>${codeCell}</td>
      <td><select data-pl="${d.id}" style="min-width:160px">${opts}</select></td>
      <td><button class="danger" data-del="${d.id}">Remover</button></td></tr>`);
    tb.appendChild(tr);
  });
  $('#add').onclick = async () => {
    const name = prompt('Nome da tela (ex: Recepção, Vitrine 1):', 'Nova tela');
    if (name === null) return;
    await api('/devices', { method: 'POST', body: { name } }); pageDevices();
  };
  main.querySelectorAll('[data-pl]').forEach(s => s.onchange = async () => {
    await api(`/devices/${s.dataset.pl}/playlist`, { method: 'PUT', body: { playlist_id: s.value || null } });
    toast('Playlist atualizada');
  });
  main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (confirm('Remover esta tela?')) { await api(`/devices/${b.dataset.del}`, { method: 'DELETE' }); pageDevices(); }
  });
}

// ---------- MÍDIAS ----------
async function pageMedia() {
  const main = $('#main');
  main.innerHTML = `<h1>Mídias</h1><p class="sub">Suas imagens e vídeos. Eles entram nas playlists.</p>
    <div class="toolbar"><button id="up">+ Enviar mídia</button>
      <input id="file" type="file" accept="image/*,video/*" class="hidden" multiple>
      <div class="spacer"></div></div>
    <div class="grid media" id="grid"></div>`;
  const list = await api('/media');
  const grid = $('#grid');
  if (!list.length) grid.appendChild(el(`<p class="muted">Nenhuma mídia. Envie imagens ou vídeos.</p>`));
  list.forEach(m => {
    const prev = m.type === 'video'
      ? `<video class="thumb" src="/media/${m.filename}" muted></video>`
      : `<img class="thumb" src="/media/${m.filename}">`;
    const kb = m.bytes > 1e6 ? (m.bytes / 1e6).toFixed(1) + ' MB' : Math.round(m.bytes / 1e3) + ' KB';
    const c = el(`<div class="card" style="padding:10px">${prev}
      <div class="row" style="margin-top:8px"><div class="nm" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.name}</div></div>
      <div class="row" style="margin-top:6px"><span class="pill">${m.type === 'video' ? 'vídeo' : 'imagem'}</span><span class="muted" style="font-size:12px">${kb}</span>
      <div class="spacer"></div><button class="danger" data-del="${m.id}" style="padding:5px 9px">×</button></div></div>`);
    grid.appendChild(c);
  });
  $('#up').onclick = () => $('#file').click();
  $('#file').onchange = async (e) => {
    for (const f of e.target.files) {
      toast('Enviando ' + f.name + '…');
      await api('/media', { method: 'POST', raw: true, body: f, headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(f.name) } });
    }
    pageMedia();
  };
  main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (confirm('Remover esta mídia?')) { await api(`/media/${b.dataset.del}`, { method: 'DELETE' }); pageMedia(); }
  });
}

// ---------- PLAYLISTS ----------
async function pagePlaylists() {
  const main = $('#main');
  main.innerHTML = `<h1>Playlists</h1><p class="sub">Uma sequência de mídias. Defina a ordem e quanto tempo cada imagem fica na tela.</p>
    <div class="toolbar"><button id="add">+ Nova playlist</button><div class="spacer"></div></div>
    <div class="grid" id="list" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))"></div>`;
  const pls = await api('/playlists');
  const list = $('#list');
  if (!pls.length) list.appendChild(el(`<p class="muted">Nenhuma playlist ainda.</p>`));
  pls.forEach(p => {
    const c = el(`<div class="card"><div class="row"><strong style="flex:1">${p.name}</strong>
      <button class="danger" data-del="${p.id}" style="padding:5px 9px">×</button></div>
      <p class="muted" style="margin:8px 0 14px">${p.itemCount} item(ns)</p>
      <button class="ghost" data-edit="${p.id}" style="width:100%">Editar</button></div>`);
    list.appendChild(c);
  });
  $('#add').onclick = async () => {
    const name = prompt('Nome da playlist:', 'Nova playlist'); if (name === null) return;
    await api('/playlists', { method: 'POST', body: { name } }); pagePlaylists();
  };
  main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (confirm('Remover esta playlist?')) { await api(`/playlists/${b.dataset.del}`, { method: 'DELETE' }); pagePlaylists(); }
  });
  main.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editPlaylist(b.dataset.edit));
}

async function editPlaylist(id) {
  const main = $('#main');
  const [pl, media] = await Promise.all([api('/playlists/' + id), api('/media')]);
  main.innerHTML = `<div class="row"><button class="ghost" id="back">← Voltar</button><h1 style="margin:0 0 0 12px">${pl.name}</h1></div>
    <p class="sub">Adicione mídias e ordene. Duração em segundos vale para imagens (vídeos tocam até o fim).</p>
    <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
      <div class="card"><h3 style="margin-top:0">Itens da playlist</h3><div id="items"></div>
        <button id="save" style="width:100%;margin-top:10px">Salvar playlist</button></div>
      <div class="card"><h3 style="margin-top:0">Mídias disponíveis</h3><div class="grid media" id="bank"></div></div>
    </div>`;
  let items = pl.items.map(i => ({ media_id: i.media_id, name: i.name, type: i.type, duration: i.duration }));
  const draw = () => {
    const box = $('#items'); box.innerHTML = '';
    if (!items.length) box.appendChild(el(`<p class="muted">Vazia. Clique numa mídia à direita.</p>`));
    items.forEach((it, idx) => {
      const r = el(`<div class="item-row">
        <span class="muted">${idx + 1}</span><span class="nm">${it.name}</span>
        ${it.type === 'video' ? '<span class="pill">vídeo</span>' : `<input type="number" min="1" value="${it.duration}" data-dur="${idx}">`}
        <button class="ghost" data-up="${idx}" style="padding:4px 8px">↑</button>
        <button class="ghost" data-down="${idx}" style="padding:4px 8px">↓</button>
        <button class="danger" data-rm="${idx}" style="padding:4px 8px">×</button></div>`);
      box.appendChild(r);
    });
    box.querySelectorAll('[data-dur]').forEach(i => i.onchange = () => items[i.dataset.dur].duration = Math.max(1, +i.value || 10));
    box.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { const i = +b.dataset.up; if (i > 0) { [items[i - 1], items[i]] = [items[i], items[i - 1]]; draw(); } });
    box.querySelectorAll('[data-down]').forEach(b => b.onclick = () => { const i = +b.dataset.down; if (i < items.length - 1) { [items[i + 1], items[i]] = [items[i], items[i + 1]]; draw(); } });
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { items.splice(+b.dataset.rm, 1); draw(); });
  };
  const bank = $('#bank');
  if (!media.length) bank.appendChild(el(`<p class="muted">Envie mídias na aba Mídias primeiro.</p>`));
  media.forEach(m => {
    const prev = m.type === 'video' ? `<video class="thumb" src="/media/${m.filename}" muted></video>` : `<img class="thumb" src="/media/${m.filename}">`;
    const c = el(`<div class="card" style="padding:8px;cursor:pointer">${prev}<div class="nm" style="margin-top:6px;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.name}</div></div>`);
    c.onclick = () => { items.push({ media_id: m.id, name: m.name, type: m.type, duration: 10 }); draw(); };
    bank.appendChild(c);
  });
  draw();
  $('#back').onclick = pagePlaylists;
  $('#save').onclick = async () => {
    await api(`/playlists/${id}/items`, { method: 'PUT', body: { items: items.map(i => ({ media_id: i.media_id, duration: i.duration })) } });
    toast('Playlist salva'); pagePlaylists();
  };
}

// ---------- BOOT ----------
(async () => { if (TOKEN) renderApp(); else renderAuth(); })();
