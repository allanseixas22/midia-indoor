// Camada de banco de dados (SQLite embutido do Node).
// Dono do esquema e de todas as consultas. Mantém o resto da aplicação
// livre de SQL espalhado.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.SIGNAGE_DATA_DIR || join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });
export const MEDIA_DIR = join(DATA_DIR, 'media');
mkdirSync(MEDIA_DIR, { recursive: true });

const db = new DatabaseSync(join(DATA_DIR, 'signage.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  username   TEXT UNIQUE NOT NULL,
  pass_hash  TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL,          -- 'image' | 'video'
  mime       TEXT NOT NULL,
  filename   TEXT NOT NULL,          -- nome do arquivo em disco
  bytes      INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playlists (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_items (
  id          TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  media_id    TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  duration    INTEGER NOT NULL        -- segundos (imagens); vídeos tocam até o fim
);

CREATE TABLE IF NOT EXISTS devices (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  pair_code    TEXT,                  -- código de 6 dígitos enquanto não pareado
  token        TEXT UNIQUE,           -- token do player depois de pareado
  playlist_id  TEXT REFERENCES playlists(id) ON DELETE SET NULL,
  paired       INTEGER NOT NULL DEFAULT 0,
  last_seen    TEXT,
  created_at   TEXT NOT NULL
);
`);

const now = () => new Date().toISOString();

export const Users = {
  create(username, passHash) {
    const id = randomUUID();
    db.prepare('INSERT INTO users(id,username,pass_hash,created_at) VALUES(?,?,?,?)')
      .run(id, username, passHash, now());
    return { id, username };
  },
  byUsername(username) {
    return db.prepare('SELECT * FROM users WHERE username=?').get(username);
  },
  count() {
    return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  },
};

export const Media = {
  create({ name, type, mime, filename, bytes }) {
    const id = randomUUID();
    db.prepare('INSERT INTO media(id,name,type,mime,filename,bytes,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(id, name, type, mime, filename, bytes, now());
    return this.byId(id);
  },
  byId(id) { return db.prepare('SELECT * FROM media WHERE id=?').get(id); },
  list() { return db.prepare('SELECT * FROM media ORDER BY created_at DESC').all(); },
  remove(id) { db.prepare('DELETE FROM media WHERE id=?').run(id); },
};

export const Playlists = {
  create(name) {
    const id = randomUUID();
    db.prepare('INSERT INTO playlists(id,name,created_at) VALUES(?,?,?)').run(id, name, now());
    return this.byId(id);
  },
  byId(id) {
    const pl = db.prepare('SELECT * FROM playlists WHERE id=?').get(id);
    if (!pl) return null;
    pl.items = db.prepare(`
      SELECT pi.id, pi.media_id, pi.position, pi.duration,
             m.name, m.type, m.mime, m.filename, m.bytes
      FROM playlist_items pi JOIN media m ON m.id = pi.media_id
      WHERE pi.playlist_id=? ORDER BY pi.position ASC`).all(id);
    return pl;
  },
  list() {
    return db.prepare('SELECT * FROM playlists ORDER BY created_at DESC').all()
      .map(p => ({ ...p, itemCount: db.prepare('SELECT COUNT(*) n FROM playlist_items WHERE playlist_id=?').get(p.id).n }));
  },
  remove(id) { db.prepare('DELETE FROM playlists WHERE id=?').run(id); },
  setItems(id, items) {
    const tx = db.prepare('DELETE FROM playlist_items WHERE playlist_id=?');
    tx.run(id);
    const ins = db.prepare('INSERT INTO playlist_items(id,playlist_id,media_id,position,duration) VALUES(?,?,?,?,?)');
    items.forEach((it, i) => ins.run(randomUUID(), id, it.media_id, i, Math.max(1, Number(it.duration) || 10)));
    return this.byId(id);
  },
};

export const Devices = {
  create(name) {
    const id = randomUUID();
    const pair_code = String(Math.floor(100000 + Math.random() * 900000));
    db.prepare('INSERT INTO devices(id,name,pair_code,paired,created_at) VALUES(?,?,?,0,?)')
      .run(id, name, pair_code, now());
    return this.byId(id);
  },
  byId(id) { return db.prepare('SELECT * FROM devices WHERE id=?').get(id); },
  byToken(token) { return db.prepare('SELECT * FROM devices WHERE token=?').get(token); },
  byPairCode(code) { return db.prepare('SELECT * FROM devices WHERE pair_code=? AND paired=0').get(code); },
  list() { return db.prepare('SELECT * FROM devices ORDER BY created_at DESC').all(); },
  remove(id) { db.prepare('DELETE FROM devices WHERE id=?').run(id); },
  pair(id, token) {
    db.prepare('UPDATE devices SET paired=1, token=?, pair_code=NULL WHERE id=?').run(token, id);
    return this.byId(id);
  },
  assignPlaylist(id, playlistId) {
    db.prepare('UPDATE devices SET playlist_id=? WHERE id=?').run(playlistId || null, id);
    return this.byId(id);
  },
  touch(id) { db.prepare('UPDATE devices SET last_seen=? WHERE id=?').run(now(), id); },
};

export default db;
