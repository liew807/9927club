import 'dotenv/config';
import express from 'express';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mkdj_secret_change_me';
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

const { Pool } = pg;
const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      }
);
pool.on('error', e => console.error('DB错误:', e));
const q = (t, p) => pool.query(t, p);

/* ==================== 建表（自愈） ==================== */
async function initDB() {
  // 1. 建表（若不存在）
  await q(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE,
      password VARCHAR(255),
      nick VARCHAR(100),
      avatar TEXT DEFAULT '',
      avatar_type VARCHAR(20) DEFAULT 'text',
      role VARCHAR(20) DEFAULT 'user',
      bio TEXT DEFAULT '',
      dj_name VARCHAR(100) DEFAULT '',
      dj_style VARCHAR(100) DEFAULT '',
      verified BOOLEAN DEFAULT FALSE,
      apply_status VARCHAR(20) DEFAULT '',
      vip_level INTEGER DEFAULT 0,
      vip_expire VARCHAR(50) DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS musics (
      id SERIAL PRIMARY KEY,
      uid INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      cover TEXT DEFAULT '',
      cover_type VARCHAR(20) DEFAULT 'text',
      cover_emoji VARCHAR(20) DEFAULT '🎵',
      dj VARCHAR(100) DEFAULT '',
      tags VARCHAR(255) DEFAULT '',
      description TEXT DEFAULT '',
      audio_url TEXT DEFAULT '',
      plays INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      favs INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      mid INTEGER REFERENCES musics(id) ON DELETE CASCADE,
      uid INTEGER REFERENCES users(id) ON DELETE CASCADE,
      nick VARCHAR(100) DEFAULT '',
      text TEXT NOT NULL,
      time VARCHAR(50) DEFAULT '刚刚',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS likes (
      id SERIAL PRIMARY KEY,
      uid INTEGER REFERENCES users(id) ON DELETE CASCADE,
      mid INTEGER REFERENCES musics(id) ON DELETE CASCADE,
      UNIQUE(uid, mid)
    );
    CREATE TABLE IF NOT EXISTS favs (
      id SERIAL PRIMARY KEY,
      uid INTEGER REFERENCES users(id) ON DELETE CASCADE,
      mid INTEGER REFERENCES musics(id) ON DELETE CASCADE,
      UNIQUE(uid, mid)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      from_uid INTEGER REFERENCES users(id) ON DELETE CASCADE,
      to_uid INTEGER REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      time VARCHAR(50) DEFAULT '',
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY,
      uid INTEGER REFERENCES users(id) ON DELETE CASCADE,
      nick VARCHAR(100) DEFAULT '',
      email VARCHAR(255) DEFAULT '',
      style VARCHAR(100) DEFAULT '',
      work VARCHAR(255) DEFAULT '',
      social VARCHAR(255) DEFAULT '',
      bio TEXT DEFAULT '',
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // 2. 自愈：给 users 表补齐所有字段（缺哪个补哪个，不影响现有数据）
  const userCols = [
    ['email', 'VARCHAR(255)'],
    ['password', 'VARCHAR(255)'],
    ['nick', 'VARCHAR(100)'],
    ['avatar', "TEXT DEFAULT ''"],
    ['avatar_type', "VARCHAR(20) DEFAULT 'text'"],
    ['role', "VARCHAR(20) DEFAULT 'user'"],
    ['bio', "TEXT DEFAULT ''"],
    ['dj_name', "VARCHAR(100) DEFAULT ''"],
    ['dj_style', "VARCHAR(100) DEFAULT ''"],
    ['verified', 'BOOLEAN DEFAULT FALSE'],
    ['apply_status', "VARCHAR(20) DEFAULT ''"],
    ['vip_level', 'INTEGER DEFAULT 0'],
    ['vip_expire', "VARCHAR(50) DEFAULT ''"],
    ['created_at', 'TIMESTAMP DEFAULT NOW()'],
  ];
  for (const [name, type] of userCols) {
    await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${name} ${type}`);
  }

  // 3. 自愈：给 musics 表补齐字段
  const musicCols = [
    ['uid', 'INTEGER'],
    ['title', 'VARCHAR(255)'],
    ['cover', "TEXT DEFAULT ''"],
    ['cover_type', "VARCHAR(20) DEFAULT 'text'"],
    ['cover_emoji', "VARCHAR(20) DEFAULT '🎵'"],
    ['dj', "VARCHAR(100) DEFAULT ''"],
    ['tags', "VARCHAR(255) DEFAULT ''"],
    ['description', "TEXT DEFAULT ''"],
    ['audio_url', "TEXT DEFAULT ''"],
    ['plays', 'INTEGER DEFAULT 0'],
    ['likes', 'INTEGER DEFAULT 0'],
    ['favs', 'INTEGER DEFAULT 0'],
    ['created_at', 'TIMESTAMP DEFAULT NOW()'],
  ];
  for (const [name, type] of musicCols) {
    await q(`ALTER TABLE musics ADD COLUMN IF NOT EXISTS ${name} ${type}`);
  }

  // 4. 播种默认账号
  const admin = await q('SELECT id FROM users WHERE email=$1', ['admin@dj.com']);
  if (!admin.rows.length) {
    const h = await bcrypt.hash('admin123', 10);
    await q(`INSERT INTO users (email,password,nick,role,bio) VALUES ($1,$2,'管理员','admin','平台管理员')`, ['admin@dj.com', h]);
  }
  const user = await q('SELECT id FROM users WHERE email=$1', ['user@dj.com']);
  if (!user.rows.length) {
    const h = await bcrypt.hash('123456', 10);
    await q(`INSERT INTO users (email,password,nick,role,bio) VALUES ($1,$2,'音乐爱好者','user','热爱电音')`, ['user@dj.com', h]);
  }
  const dj = await q('SELECT id FROM users WHERE email=$1', ['dj1@dj.com']);
  if (!dj.rows.length) {
    const h = await bcrypt.hash('123456', 10);
    await q(`INSERT INTO users (email,password,nick,role,bio,dj_name,dj_style,verified,apply_status)
             VALUES ($1,$2,'DJ Mike','user','专业DJ','DJ Mike','House',true,'approved')`, ['dj1@dj.com', h]);
  }
  console.log('✅ 数据库初始化完成（含自愈）');
}

/* ==================== 上传 ==================== */
const uploadDir = path.join(__dirname, UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 50 * 1024 * 1024 }
});

/* ==================== 中间件 ==================== */
const auth = (req, res, next) => {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  if (!t) return res.status(401).json({ error: '未登录' });
  try { req.user = jwt.verify(t, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: '登录已过期' }); }
};
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: '无权限' });
  next();
};
const sign = u => jwt.sign({ id: u.id, email: u.email, role: u.role }, JWT_SECRET, { expiresIn: '30d' });

/* ==================== 应用 ==================== */
const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, 'public')));

/* ==================== 认证 ==================== */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, nick, password } = req.body;
    if (!email || !nick || !password) return res.status(400).json({ error: '请填写完整信息' });
    if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });
    if ((await q('SELECT id FROM users WHERE email=$1', [email])).rows.length)
      return res.status(400).json({ error: '该邮箱已注册' });
    const h = await bcrypt.hash(password, 10);
    const r = await q(
      `INSERT INTO users (email,password,nick,avatar,avatar_type,role,bio)
       VALUES ($1,$2,$3,$4,'text','user','')
       RETURNING id,email,nick,avatar,avatar_type,role,bio,dj_name,dj_style,verified,apply_status,vip_level,vip_expire`,
      [email, h, nick, nick[0]]
    );
    res.json({ token: sign(r.rows[0]), user: r.rows[0] });
  } catch (e) { console.error(e); res.status(500).json({ error: '服务器错误' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: '请输入邮箱和密码' });
    const r = await q('SELECT * FROM users WHERE email=$1', [email]);
    if (!r.rows.length) return res.status(400).json({ error: '邮箱或密码错误' });
    const u = r.rows[0];
    if (!await bcrypt.compare(password, u.password))
      return res.status(400).json({ error: '邮箱或密码错误' });
    delete u.password;
    res.json({ token: sign(u), user: u });
  } catch (e) { console.error(e); res.status(500).json({ error: '服务器错误' }); }
});

app.get('/api/auth/me', auth, async (req, res) => {
  const r = await q(
    `SELECT id,email,nick,avatar,avatar_type,role,bio,dj_name,dj_style,verified,apply_status,vip_level,vip_expire
     FROM users WHERE id=$1`, [req.user.id]
  );
  if (!r.rows.length) return res.status(401).json({ error: '用户不存在' });
  res.json({ user: r.rows[0] });
});

/* ==================== 会员 ==================== */
app.get('/api/users/vip', auth, async (req, res) => {
  const r = await q('SELECT vip_level, vip_expire FROM users WHERE id=$1', [req.user.id]);
  res.json({ vip_level: r.rows[0].vip_level || 0, vip_expire: r.rows[0].vip_expire || '' });
});

app.post('/api/users/vip', auth, async (req, res) => {
  const level = Number(req.body.level);
  if (![1,2,3].includes(level)) return res.status(400).json({ error: '等级无效' });
  const cur = await q('SELECT vip_level FROM users WHERE id=$1', [req.user.id]);
  if (level <= (cur.rows[0].vip_level || 0))
    return res.status(400).json({ error: '不能降级或选择同级' });
  const d = new Date(); d.setMonth(d.getMonth() + 1);
  const expire = d.getFullYear() + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + String(d.getDate()).padStart(2,'0');
  const r = await q(
    'UPDATE users SET vip_level=$1, vip_expire=$2 WHERE id=$3 RETURNING vip_level, vip_expire',
    [level, expire, req.user.id]
  );
  res.json({ vip_level: r.rows[0].vip_level, vip_expire: r.rows[0].vip_expire });
});

/* ==================== 用户 ==================== */
app.get('/api/users', async (req, res) => {
  const r = await q(`SELECT id,nick,avatar,avatar_type,bio,dj_name,dj_style,verified
                     FROM users WHERE verified=true ORDER BY id DESC`);
  res.json({ users: r.rows });
});

app.get('/api/users/:id', async (req, res) => {
  const r = await q(
    `SELECT id,nick,avatar,avatar_type,bio,dj_name,dj_style,verified,role
     FROM users WHERE id=$1`, [req.params.id]
  );
  if (!r.rows.length) return res.status(404).json({ error: '用户不存在' });
  res.json({ user: r.rows[0] });
});

app.put('/api/users/profile', auth, async (req, res) => {
  const { nick, bio, avatar, avatar_type } = req.body;
  const sets = [], vals = [];
  let i = 1;
  if (nick !== undefined) { sets.push(`nick=$${i++}`); vals.push(nick); }
  if (bio !== undefined) { sets.push(`bio=$${i++}`); vals.push(bio); }
  if (avatar !== undefined) { sets.push(`avatar=$${i++}`); vals.push(avatar); }
  if (avatar_type !== undefined) { sets.push(`avatar_type=$${i++}`); vals.push(avatar_type); }
  if (!sets.length) return res.status(400).json({ error: '没有修改' });
  vals.push(req.user.id);
  const r = await q(
    `UPDATE users SET ${sets.join(',')} WHERE id=$${i}
     RETURNING id,email,nick,avatar,avatar_type,role,bio,dj_name,dj_style,verified,apply_status,vip_level,vip_expire`,
    vals
  );
  res.json({ user: r.rows[0] });
});

app.post('/api/users/avatar', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未选择文件' });
  const url = `/uploads/${req.file.filename}`;
  await q('UPDATE users SET avatar=$1, avatar_type=$2 WHERE id=$3', [url, 'image', req.user.id]);
  res.json({ url });
});

app.post('/api/users/apply', auth, async (req, res) => {
  const { dj_name, dj_style, work, social, bio } = req.body;
  if (!dj_name || !dj_style || !work) return res.status(400).json({ error: '请填写必填项' });
  const u = await q('SELECT verified, apply_status, email FROM users WHERE id=$1', [req.user.id]);
  if (u.rows[0].verified) return res.status(400).json({ error: '你已是认证 DJ' });
  if (u.rows[0].apply_status === 'pending') return res.status(400).json({ error: '申请审核中' });
  await q(`UPDATE users SET dj_name=$1, dj_style=$2, apply_status='pending' WHERE id=$3`,
    [dj_name, dj_style, req.user.id]);
  await q(`INSERT INTO applications (uid,nick,email,style,work,social,bio,status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')`,
    [req.user.id, dj_name, u.rows[0].email, dj_style, work, social || '', bio || '']);
  res.json({ ok: true });
});

/* ==================== 音乐 ==================== */
app.get('/api/musics', async (req, res) => {
  const r = await q('SELECT * FROM musics ORDER BY plays DESC');
  res.json({ musics: r.rows });
});

app.get('/api/musics/:id', async (req, res) => {
  const r = await q('SELECT * FROM musics WHERE id=$1', [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: '音乐不存在' });
  await q('UPDATE musics SET plays=plays+1 WHERE id=$1', [req.params.id]);
  res.json({ music: r.rows[0] });
});

app.post('/api/musics', auth, async (req, res) => {
  const u = await q('SELECT verified, dj_name, nick FROM users WHERE id=$1', [req.user.id]);
  if (!u.rows[0].verified) return res.status(403).json({ error: '仅认证 DJ 可上传' });
  const { title, cover, cover_type, cover_emoji, tags, description, audio_url } = req.body;
  if (!title) return res.status(400).json({ error: '请输入标题' });
  const r = await q(
    `INSERT INTO musics (uid,title,cover,cover_type,cover_emoji,dj,tags,description,audio_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.user.id, title, cover || '', cover_type || 'text', cover_emoji || '🎵',
     u.rows[0].dj_name || u.rows[0].nick, tags || 'Remix', description || '', audio_url || '']
  );
  res.json({ music: r.rows[0] });
});

app.post('/api/musics/upload', auth, upload.fields([
  { name: 'audio', maxCount: 1 }, { name: 'cover', maxCount: 1 }
]), (req, res) => {
  res.json({
    audioUrl: req.files?.audio?.[0] ? `/uploads/${req.files.audio[0].filename}` : '',
    coverUrl: req.files?.cover?.[0] ? `/uploads/${req.files.cover[0].filename}` : ''
  });
});

app.post('/api/musics/:id/like', auth, async (req, res) => {
  const mid = Number(req.params.id);
  const ex = await q('SELECT id FROM likes WHERE uid=$1 AND mid=$2', [req.user.id, mid]);
  if (ex.rows.length) {
    await q('DELETE FROM likes WHERE uid=$1 AND mid=$2', [req.user.id, mid]);
    await q('UPDATE musics SET likes=GREATEST(likes-1,0) WHERE id=$1', [mid]);
    res.json({ liked: false });
  } else {
    await q('INSERT INTO likes (uid,mid) VALUES ($1,$2)', [req.user.id, mid]);
    await q('UPDATE musics SET likes=likes+1 WHERE id=$1', [mid]);
    res.json({ liked: true });
  }
});

app.post('/api/musics/:id/fav', auth, async (req, res) => {
  const mid = Number(req.params.id);
  const ex = await q('SELECT id FROM favs WHERE uid=$1 AND mid=$2', [req.user.id, mid]);
  if (ex.rows.length) {
    await q('DELETE FROM favs WHERE uid=$1 AND mid=$2', [req.user.id, mid]);
    await q('UPDATE musics SET favs=GREATEST(favs-1,0) WHERE id=$1', [mid]);
    res.json({ faved: false });
  } else {
    await q('INSERT INTO favs (uid,mid) VALUES ($1,$2)', [req.user.id, mid]);
    await q('UPDATE musics SET favs=favs+1 WHERE id=$1', [mid]);
    res.json({ faved: true });
  }
});

app.get('/api/musics/:id/comments', async (req, res) => {
  const r = await q('SELECT * FROM comments WHERE mid=$1 ORDER BY created_at DESC', [req.params.id]);
  res.json({ comments: r.rows });
});

app.post('/api/musics/:id/comments', auth, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: '请输入内容' });
  const u = await q('SELECT nick, dj_name FROM users WHERE id=$1', [req.user.id]);
  const nick = u.rows[0].dj_name || u.rows[0].nick;
  const r = await q(
    `INSERT INTO comments (mid,uid,nick,text,time) VALUES ($1,$2,$3,$4,'刚刚') RETURNING *`,
    [req.params.id, req.user.id, nick, text]
  );
  res.json({ comment: r.rows[0] });
});

/* ==================== 私信 ==================== */
app.get('/api/messages', auth, async (req, res) => {
  const r = await q(
    `SELECT m.*, 
      uf.nick AS from_nick, uf.avatar AS from_avatar, uf.avatar_type AS from_avatar_type, uf.dj_name AS from_dj_name,
      ut.nick AS to_nick, ut.avatar AS to_avatar, ut.avatar_type AS to_avatar_type, ut.dj_name AS to_dj_name
     FROM messages m
     JOIN users uf ON uf.id = m.from_uid
     JOIN users ut ON ut.id = m.to_uid
     WHERE m.from_uid=$1 OR m.to_uid=$1
     ORDER BY m.created_at ASC`,
    [req.user.id]
  );
  res.json({ messages: r.rows });
});

app.post('/api/messages', auth, async (req, res) => {
  const { to_uid, text } = req.body;
  if (!to_uid || !text) return res.status(400).json({ error: '缺少参数' });
  if (Number(to_uid) === req.user.id) return res.status(400).json({ error: '不能发给自己' });
  const time = new Date().toLocaleTimeString().slice(0, 5);
  const r = await q(
    `INSERT INTO messages (from_uid,to_uid,text,time) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.user.id, to_uid, text, time]
  );
  res.json({ message: r.rows[0] });
});

app.post('/api/messages/read/:uid', auth, async (req, res) => {
  await q('UPDATE messages SET read=true WHERE from_uid=$1 AND to_uid=$2', [req.params.uid, req.user.id]);
  res.json({ ok: true });
});

/* ==================== 管理员 ==================== */
app.get('/api/admin/stats', auth, adminOnly, async (req, res) => {
  const a = await q(`SELECT COUNT(*) FROM users WHERE role='user'`);
  const b = await q(`SELECT COUNT(*) FROM users WHERE verified=true`);
  const c = await q(`SELECT COUNT(*) FROM musics`);
  const d = await q(`SELECT COALESCE(SUM(plays),0) AS t FROM musics`);
  const e = await q(`SELECT COUNT(*) FROM comments`);
  const f = await q(`SELECT COUNT(*) FROM applications WHERE status='pending'`);
  res.json({
    users: Number(a.rows[0].count), djs: Number(b.rows[0].count),
    musics: Number(c.rows[0].count), plays: Number(d.rows[0].t),
    comments: Number(e.rows[0].count), pending: Number(f.rows[0].count)
  });
});

app.get('/api/admin/users', auth, adminOnly, async (req, res) => {
  const r = await q(`SELECT id,email,nick,avatar,avatar_type,role,bio,dj_name,dj_style,verified,apply_status,vip_level,vip_expire
                     FROM users WHERE role!='admin' ORDER BY id DESC`);
  res.json({ users: r.rows });
});

app.delete('/api/admin/users/:id', auth, adminOnly, async (req, res) => {
  await q('DELETE FROM users WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/admin/applications', auth, adminOnly, async (req, res) => {
  const r = await q('SELECT * FROM applications ORDER BY created_at DESC');
  res.json({ applications: r.rows });
});

app.post('/api/admin/applications/:id/approve', auth, adminOnly, async (req, res) => {
  const a = await q('SELECT * FROM applications WHERE id=$1', [req.params.id]);
  if (!a.rows.length) return res.status(404).json({ error: '申请不存在' });
  const app_ = a.rows[0];
  await q(`UPDATE applications SET status='approved' WHERE id=$1`, [app_.id]);
  await q(`UPDATE users SET verified=true, apply_status='approved', dj_name=$1, dj_style=$2 WHERE id=$3`,
    [app_.nick, app_.style, app_.uid]);
  res.json({ ok: true });
});

app.post('/api/admin/applications/:id/reject', auth, adminOnly, async (req, res) => {
  const a = await q('SELECT * FROM applications WHERE id=$1', [req.params.id]);
  if (!a.rows.length) return res.status(404).json({ error: '申请不存在' });
  await q(`UPDATE applications SET status='rejected' WHERE id=$1`, [req.params.id]);
  await q(`UPDATE users SET apply_status='rejected' WHERE id=$1`, [a.rows[0].uid]);
  res.json({ ok: true });
});

app.delete('/api/admin/musics/:id', auth, adminOnly, async (req, res) => {
  await q('DELETE FROM musics WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

/* ==================== 搜索 ==================== */
app.get('/api/search', async (req, res) => {
  const kw = `%${(req.query.q || '').toLowerCase()}%`;
  const m = await q(
    `SELECT * FROM musics WHERE LOWER(title) LIKE $1 OR LOWER(dj) LIKE $1 OR LOWER(tags) LIKE $1`, [kw]);
  const d = await q(
    `SELECT id,nick,avatar,avatar_type,bio,dj_name,dj_style FROM users
     WHERE verified=true AND (LOWER(dj_name) LIKE $1 OR LOWER(nick) LIKE $1 OR LOWER(dj_style) LIKE $1)`, [kw]);
  res.json({ musics: m.rows, djs: d.rows });
});

/* ==================== 启动 ==================== */
initDB()
  .then(() => app.listen(PORT, () => {
    console.log(`🚀 MK DJ 后端运行: http://localhost:${PORT}`);
    console.log('👤 默认账号:');
    console.log('   管理员 admin@dj.com / admin123');
    console.log('   用户   user@dj.com  / 123456');
    console.log('   DJ     dj1@dj.com   / 123456');
  }))
  .catch(e => { console.error('❌ 启动失败:', e); process.exit(1); });
