// Servidor HTTP do sistema de mídia indoor. Sem dependências externas.
// Rotas do painel (protegidas por token de usuário) e rotas do player
// (protegidas por token de dispositivo). Serve também o painel estático.
import http from 'node:http';
import { createReadStream, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Users, Media, Playlists, Devices, MEDIA_DIR } from './db.js';
import { hashPassword, verifyPassword, issueToken, verifyToken, deviceToken } from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PANEL_DIR = join(__dirname, '..', '..', 'panel');
const PORT = Number(process.env.PORT || 4000);

const EXT_MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
};

// ---- helpers de resposta ----
const json = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
};
const readBody = (req, limit = 512 * 1024 * 1024) => new Promise((resolve, reject) => {
  const chunks = []; let size = 0;
  req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});
const readJson = async (req) => { const b = await readBody(req); return b.length ? JSON.parse(b.toString()) : {}; };

// ---- autenticação de requisição ----
const bearer = (req) => (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
const requireUser = (req) => verifyToken(bearer(req));
const requireDevice = (req) => Devices.byToken(bearer(req) || req.headers['x-device-token']);

// ---- servir arquivo estático / mídia com suporte a Range (vídeo) ----
function serveFile(req, res, filePath, mime) {
  if (!existsSync(filePath)) return json(res, 404, { error: 'not found' });
  const { size } = statSync(filePath);
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m[1] ? parseInt(m[1]) : 0;
    const end = m[2] ? parseInt(m[2]) : size - 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1, 'Content-Type': mime,
    });
    createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length': size, 'Content-Type': mime, 'Accept-Ranges': 'bytes' });
    createReadStream(filePath).pipe(res);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method;

  // CORS (para o player Android e dev)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Device-Token, X-File-Name, X-File-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  try {
    // ===================== AUTH =====================
    if (path === '/api/setup-needed' && method === 'GET') {
      return json(res, 200, { setupNeeded: Users.count() === 0 });
    }
    if (path === '/api/register' && method === 'POST') {
      // Só permite criar o primeiro usuário (dono). Depois fica bloqueado.
      if (Users.count() > 0) return json(res, 403, { error: 'registro fechado' });
      const { username, password } = await readJson(req);
      if (!username || !password) return json(res, 400, { error: 'usuário e senha obrigatórios' });
      Users.create(username, hashPassword(password));
      return json(res, 201, { token: issueToken({ username }) });
    }
    if (path === '/api/login' && method === 'POST') {
      const { username, password } = await readJson(req);
      const u = Users.byUsername(username);
      if (!u || !verifyPassword(password, u.pass_hash)) return json(res, 401, { error: 'credenciais inválidas' });
      return json(res, 200, { token: issueToken({ username }) });
    }

    // ===================== PLAYER (token de dispositivo) =====================
    // Pareamento: o player manda seu pair_code e recebe o token definitivo.
    if (path === '/api/player/pair' && method === 'POST') {
      const { code } = await readJson(req);
      const dev = Devices.byPairCode(String(code || '').trim());
      if (!dev) return json(res, 404, { error: 'código inválido ou já usado' });
      const token = deviceToken();
      Devices.pair(dev.id, token);
      return json(res, 200, { token, deviceId: dev.id, name: dev.name });
    }
    // Programação atual do player (o que ele deve exibir).
    if (path === '/api/player/schedule' && method === 'GET') {
      const dev = requireDevice(req);
      if (!dev) return json(res, 401, { error: 'dispositivo não autorizado' });
      Devices.touch(dev.id);
      const pl = dev.playlist_id ? Playlists.byId(dev.playlist_id) : null;
      return json(res, 200, {
        device: { id: dev.id, name: dev.name },
        playlist: pl ? {
          id: pl.id, name: pl.name,
          items: pl.items.map(i => ({
            id: i.id, type: i.type, duration: i.duration,
            url: `/media/${i.filename}`, name: i.name,
          })),
        } : null,
      });
    }

    // ===================== MÍDIA (arquivos) =====================
    if (path.startsWith('/media/') && method === 'GET') {
      const file = join(MEDIA_DIR, path.slice('/media/'.length));
      if (!file.startsWith(MEDIA_DIR)) return json(res, 403, { error: 'proibido' });
      return serveFile(req, res, file, EXT_MIME[extname(file).toLowerCase()] || 'application/octet-stream');
    }

    // ===================== PAINEL (token de usuário) =====================
    const user = requireUser(req);
    const needUser = () => { if (!user) { json(res, 401, { error: 'não autenticado' }); return true; } return false; };

    // ---- Mídias ----
    if (path === '/api/media' && method === 'GET') { if (needUser()) return; return json(res, 200, Media.list()); }
    if (path === '/api/media' && method === 'POST') {
      if (needUser()) return;
      // Upload cru: corpo = bytes do arquivo; metadados nos headers.
      const name = decodeURIComponent(req.headers['x-file-name'] || 'arquivo');
      const mime = req.headers['content-type'] || 'application/octet-stream';
      const type = mime.startsWith('video') ? 'video' : 'image';
      const buf = await readBody(req);
      if (!buf.length) return json(res, 400, { error: 'arquivo vazio' });
      const filename = `${randomUUID()}${extname(name) || (type === 'video' ? '.mp4' : '.jpg')}`;
      writeFileSync(join(MEDIA_DIR, filename), buf);
      return json(res, 201, Media.create({ name, type, mime, filename, bytes: buf.length }));
    }
    if (path.startsWith('/api/media/') && method === 'DELETE') {
      if (needUser()) return;
      Media.remove(path.split('/').pop());
      return json(res, 204, {});
    }

    // ---- Playlists ----
    if (path === '/api/playlists' && method === 'GET') { if (needUser()) return; return json(res, 200, Playlists.list()); }
    if (path === '/api/playlists' && method === 'POST') {
      if (needUser()) return;
      const { name } = await readJson(req);
      return json(res, 201, Playlists.create(name || 'Nova playlist'));
    }
    if (path.match(/^\/api\/playlists\/[^/]+$/) && method === 'GET') {
      if (needUser()) return;
      const pl = Playlists.byId(path.split('/').pop());
      return pl ? json(res, 200, pl) : json(res, 404, { error: 'não encontrada' });
    }
    if (path.match(/^\/api\/playlists\/[^/]+\/items$/) && method === 'PUT') {
      if (needUser()) return;
      const id = path.split('/')[3];
      const { items } = await readJson(req);
      return json(res, 200, Playlists.setItems(id, items || []));
    }
    if (path.match(/^\/api\/playlists\/[^/]+$/) && method === 'DELETE') {
      if (needUser()) return;
      Playlists.remove(path.split('/').pop());
      return json(res, 204, {});
    }

    // ---- Dispositivos (telas) ----
    if (path === '/api/devices' && method === 'GET') { if (needUser()) return; return json(res, 200, Devices.list()); }
    if (path === '/api/devices' && method === 'POST') {
      if (needUser()) return;
      const { name } = await readJson(req);
      return json(res, 201, Devices.create(name || 'Nova tela'));
    }
    if (path.match(/^\/api\/devices\/[^/]+\/playlist$/) && method === 'PUT') {
      if (needUser()) return;
      const id = path.split('/')[3];
      const { playlist_id } = await readJson(req);
      return json(res, 200, Devices.assignPlaylist(id, playlist_id));
    }
    if (path.match(/^\/api\/devices\/[^/]+$/) && method === 'DELETE') {
      if (needUser()) return;
      Devices.remove(path.split('/').pop());
      return json(res, 204, {});
    }

    // ===================== PAINEL ESTÁTICO =====================
    if (method === 'GET' && !path.startsWith('/api/')) {
      let file = join(PANEL_DIR, path === '/' ? 'index.html' : path.slice(1));
      if (!file.startsWith(PANEL_DIR) || !existsSync(file) || statSync(file).isDirectory()) {
        file = join(PANEL_DIR, 'index.html'); // SPA fallback
      }
      return serveFile(req, res, file, EXT_MIME[extname(file).toLowerCase()] || 'text/html; charset=utf-8');
    }

    json(res, 404, { error: 'rota não encontrada' });
  } catch (err) {
    console.error('erro:', err.message);
    json(res, 500, { error: 'erro interno' });
  }
});

server.listen(PORT, () => {
  console.log(`Backend de mídia indoor rodando em http://localhost:${PORT}`);
  console.log(`Painel: http://localhost:${PORT}/`);
});
