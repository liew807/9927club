const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    maxHttpBufferSize: 1e7
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'qq-chat-secret-key-2024';
const QQ_ID_START = 10000;

// ==================== PostgreSQL 数据库 ====================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 初始化数据库表
async function initDB() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                qq_id TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                nickname TEXT,
                avatar TEXT DEFAULT '',
                signature TEXT DEFAULT '',
                friends TEXT DEFAULT '[]',
                groups TEXT DEFAULT '[]',
                created_at BIGINT DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conv_key TEXT,
                msg_from TEXT,
                msg_to TEXT,
                text TEXT,
                type TEXT DEFAULT 'text',
                timestamp BIGINT DEFAULT 0,
                read_msg BOOLEAN DEFAULT false,
                sender_name TEXT,
                sender_avatar TEXT,
                group_id TEXT
            );
            CREATE TABLE IF NOT EXISTS groups_table (
                id TEXT PRIMARY KEY,
                name TEXT,
                creator TEXT,
                members TEXT DEFAULT '[]',
                created_at BIGINT DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS qq_counter (
                id INTEGER PRIMARY KEY DEFAULT 1,
                counter BIGINT DEFAULT 10000
            );
            INSERT INTO qq_counter (id, counter) VALUES (1, 10000) ON CONFLICT (id) DO NOTHING;
            CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conv_key);
            CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id);
            CREATE INDEX IF NOT EXISTS idx_users_qqid ON users(qq_id);
            CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        `);
        console.log('✅ 数据库表已就绪');
    } catch (e) {
        console.error('数据库初始化失败:', e.message);
    } finally {
        client.release();
    }
}

// ==================== 中间件 ====================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (req, file, cb) => file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('只允许上传图片')) });

// JWT验证
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: '请先登录' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userQQId = decoded.qqId;
        next();
    } catch (e) {
        return res.status(401).json({ error: '登录已过期' });
    }
}

// 生成QQ号
async function generateQQId() {
    const result = await pool.query('UPDATE qq_counter SET counter = counter + 1 WHERE id = 1 RETURNING counter');
    return result.rows[0].counter.toString();
}

// ==================== API 路由 ====================

// 注册
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, nickname } = req.body;
        if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
        if (username.length < 2) return res.status(400).json({ error: '用户名至少2个字符' });
        if (password.length < 3) return res.status(400).json({ error: '密码至少3个字符' });

        const exist = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (exist.rows.length > 0) return res.status(400).json({ error: '用户名已存在' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const qqId = await generateQQId();
        const user = {
            id: uuidv4(),
            qqId,
            username,
            password: hashedPassword,
            nickname: nickname || username,
            avatar: '',
            signature: '',
            friends: '[]',
            groups: '[]',
            createdAt: Date.now()
        };

        await pool.query(
            'INSERT INTO users (id, qq_id, username, password, nickname, avatar, signature, friends, groups, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
            [user.id, user.qqId, user.username, user.password, user.nickname, user.avatar, user.signature, user.friends, user.groups, user.createdAt]
        );

        const token = jwt.sign({ qqId: user.qqId, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, user: sanitizeUser(user) });
    } catch (e) {
        console.error('注册错误:', e);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 登录
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });

        let result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) result = await pool.query('SELECT * FROM users WHERE qq_id = $1', [username]);
        if (result.rows.length === 0) return res.status(400).json({ error: '账号不存在' });

        const user = rowToUser(result.rows[0]);
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ error: '密码错误' });

        const token = jwt.sign({ qqId: user.qqId, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, user: sanitizeUser(user) });
    } catch (e) {
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取当前用户
app.get('/api/user', authMiddleware, async (req, res) => {
    const result = await pool.query('SELECT * FROM users WHERE qq_id = $1', [req.userQQId]);
    if (result.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
    res.json({ user: sanitizeUser(rowToUser(result.rows[0])) });
});

// 搜索用户
app.get('/api/users/search', authMiddleware, async (req, res) => {
    const { q } = req.query;
    if (!q) return res.json({ user: null });
    let result = await pool.query('SELECT * FROM users WHERE qq_id = $1', [q]);
    if (result.rows.length === 0) result = await pool.query('SELECT * FROM users WHERE username = $1', [q]);
    res.json({ user: result.rows.length > 0 ? sanitizeUser(rowToUser(result.rows[0])) : null });
});

// 获取好友列表
app.get('/api/friends', authMiddleware, async (req, res) => {
    const result = await pool.query('SELECT * FROM users WHERE qq_id = $1', [req.userQQId]);
    if (result.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
    const user = rowToUser(result.rows[0]);
    const friendQQIds = JSON.parse(user.friends || '[]');
    const friends = [];
    for (const qqId of friendQQIds) {
        const fr = await pool.query('SELECT * FROM users WHERE qq_id = $1', [qqId]);
        if (fr.rows.length > 0) friends.push(sanitizeUser(rowToUser(fr.rows[0])));
    }
    res.json({ friends });
});

// 添加好友
app.post('/api/friends/add', authMiddleware, async (req, res) => {
    const { friendQQId } = req.body;
    if (friendQQId === req.userQQId) return res.status(400).json({ error: '不能添加自己' });

    const userResult = await pool.query('SELECT * FROM users WHERE qq_id = $1', [req.userQQId]);
    const friendResult = await pool.query('SELECT * FROM users WHERE qq_id = $1', [friendQQId]);
    if (friendResult.rows.length === 0) return res.status(404).json({ error: '用户不存在' });

    const user = rowToUser(userResult.rows[0]);
    const friend = rowToUser(friendResult.rows[0]);
    const userFriends = JSON.parse(user.friends || '[]');
    if (userFriends.includes(friendQQId)) return res.status(400).json({ error: '已经是好友' });

    userFriends.push(friendQQId);
    const friendFriends = JSON.parse(friend.friends || '[]');
    friendFriends.push(req.userQQId);

    await pool.query('UPDATE users SET friends = $1 WHERE qq_id = $2', [JSON.stringify(userFriends), req.userQQId]);
    await pool.query('UPDATE users SET friends = $1 WHERE qq_id = $2', [JSON.stringify(friendFriends), friendQQId]);

    io.to(req.userQQId).emit('friendsUpdated');
    io.to(friendQQId).emit('friendsUpdated');
    res.json({ success: true, friend: sanitizeUser(friend) });
});

// 删除好友
app.post('/api/friends/remove', authMiddleware, async (req, res) => {
    const { friendQQId } = req.body;
    const userResult = await pool.query('SELECT * FROM users WHERE qq_id = $1', [req.userQQId]);
    const user = rowToUser(userResult.rows[0]);
    let userFriends = JSON.parse(user.friends || '[]');
    userFriends = userFriends.filter(f => f !== friendQQId);
    await pool.query('UPDATE users SET friends = $1 WHERE qq_id = $2', [JSON.stringify(userFriends), req.userQQId]);

    const friendResult = await pool.query('SELECT * FROM users WHERE qq_id = $1', [friendQQId]);
    if (friendResult.rows.length > 0) {
        const friend = rowToUser(friendResult.rows[0]);
        let friendFriends = JSON.parse(friend.friends || '[]');
        friendFriends = friendFriends.filter(f => f !== req.userQQId);
        await pool.query('UPDATE users SET friends = $1 WHERE qq_id = $2', [JSON.stringify(friendFriends), friendQQId]);
    }

    io.to(req.userQQId).emit('friendsUpdated');
    io.to(friendQQId).emit('friendsUpdated');
    res.json({ success: true });
});

// 更新个人资料
app.put('/api/user/profile', authMiddleware, async (req, res) => {
    const { nickname, signature } = req.body;
    if (nickname !== undefined) await pool.query('UPDATE users SET nickname = $1 WHERE qq_id = $2', [nickname, req.userQQId]);
    if (signature !== undefined) await pool.query('UPDATE users SET signature = $1 WHERE qq_id = $2', [signature, req.userQQId]);

    const result = await pool.query('SELECT * FROM users WHERE qq_id = $1', [req.userQQId]);
    const user = rowToUser(result.rows[0]);
    const friendQQIds = JSON.parse(user.friends || '[]');
    friendQQIds.forEach(fQQ => {
        io.to(fQQ).emit('friendProfileUpdated', { qqId: user.qqId, nickname: user.nickname, signature: user.signature, avatar: user.avatar });
    });
    res.json({ user: sanitizeUser(user) });
});

// 上传头像
app.post('/api/user/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请选择图片' });
    const avatar = '/uploads/' + req.file.filename;
    await pool.query('UPDATE users SET avatar = $1 WHERE qq_id = $2', [avatar, req.userQQId]);

    const result = await pool.query('SELECT * FROM users WHERE qq_id = $1', [req.userQQId]);
    const user = rowToUser(result.rows[0]);
    const friendQQIds = JSON.parse(user.friends || '[]');
    friendQQIds.forEach(fQQ => {
        io.to(fQQ).emit('friendProfileUpdated', { qqId: user.qqId, nickname: user.nickname, signature: user.signature, avatar: user.avatar });
    });
    res.json({ avatar: user.avatar });
});

// 获取聊天记录
app.get('/api/messages/:targetId', authMiddleware, async (req, res) => {
    const { targetId } = req.params;
    const { type } = req.query;

    let result;
    if (type === 'group') {
        const groupCheck = await pool.query('SELECT * FROM groups_table WHERE id = $1', [targetId]);
        if (groupCheck.rows.length === 0) return res.status(404).json({ error: '群不存在' });
        const members = JSON.parse(groupCheck.rows[0].members || '[]');
        if (!members.includes(req.userQQId)) return res.status(403).json({ error: '你不是群成员' });
        result = await pool.query('SELECT * FROM messages WHERE group_id = $1 ORDER BY timestamp ASC', [targetId]);
    } else {
        const convKey = [req.userQQId, targetId].sort().join('_');
        result = await pool.query('SELECT * FROM messages WHERE conv_key = $1 ORDER BY timestamp ASC', [convKey]);
    }

    const messages = result.rows.map(rowToMessage);
    // 标记已读
    for (const msg of messages) {
        if (msg.to === req.userQQId && !msg.read) {
            await pool.query('UPDATE messages SET read_msg = true WHERE id = $1', [msg.id]);
        }
    }
    if (type !== 'group') io.to(targetId).emit('messagesRead', { from: req.userQQId });
    res.json({ messages });
});

// 创建群聊
app.post('/api/groups/create', authMiddleware, async (req, res) => {
    const { name, memberQQIds } = req.body;
    if (!name || !memberQQIds || memberQQIds.length === 0) return res.status(400).json({ error: '参数错误' });

    const groupId = uuidv4();
    const members = [req.userQQId, ...memberQQIds];
    await pool.query('INSERT INTO groups_table (id, name, creator, members, created_at) VALUES ($1,$2,$3,$4,$5)',
        [groupId, name, req.userQQId, JSON.stringify(members), Date.now()]);

    for (const mQQ of members) {
        const ur = await pool.query('SELECT * FROM users WHERE qq_id = $1', [mQQ]);
        if (ur.rows.length > 0) {
            const u = rowToUser(ur.rows[0]);
            const gs = JSON.parse(u.groups || '[]');
            if (!gs.includes(groupId)) {
                gs.push(groupId);
                await pool.query('UPDATE users SET groups = $1 WHERE qq_id = $2', [JSON.stringify(gs), mQQ]);
            }
        }
    }

    const group = { id: groupId, name, creator: req.userQQId, members, createdAt: Date.now() };
    members.forEach(mQQ => io.to(mQQ).emit('groupCreated', sanitizeGroup(group)));
    res.json({ group: sanitizeGroup(group) });
});

// 邀请入群
app.post('/api/groups/:groupId/invite', authMiddleware, async (req, res) => {
    const { groupId } = req.params;
    const { memberQQIds } = req.body;
    const gr = await pool.query('SELECT * FROM groups_table WHERE id = $1', [groupId]);
    if (gr.rows.length === 0) return res.status(404).json({ error: '群不存在' });

    const group = gr.rows[0];
    let members = JSON.parse(group.members || '[]');
    if (!members.includes(req.userQQId)) return res.status(403).json({ error: '你不是群成员' });

    for (const mQQ of memberQQIds) {
        if (!members.includes(mQQ)) {
            members.push(mQQ);
            const ur = await pool.query('SELECT * FROM users WHERE qq_id = $1', [mQQ]);
            if (ur.rows.length > 0) {
                const u = rowToUser(ur.rows[0]);
                const gs = JSON.parse(u.groups || '[]');
                if (!gs.includes(groupId)) {
                    gs.push(groupId);
                    await pool.query('UPDATE users SET groups = $1 WHERE qq_id = $2', [JSON.stringify(gs), mQQ]);
                }
            }
        }
    }
    await pool.query('UPDATE groups_table SET members = $1 WHERE id = $2', [JSON.stringify(members), groupId]);

    const updatedGroup = { id: group.id, name: group.name, creator: group.creator, members, created_at: group.created_at };
    members.forEach(mQQ => io.to(mQQ).emit('groupUpdated', sanitizeGroup(updatedGroup)));
    res.json({ group: sanitizeGroup(updatedGroup) });
});

// 获取群详情
app.get('/api/groups/:groupId', authMiddleware, async (req, res) => {
    const gr = await pool.query('SELECT * FROM groups_table WHERE id = $1', [req.params.groupId]);
    if (gr.rows.length === 0) return res.status(404).json({ error: '群不存在' });
    res.json({ group: sanitizeGroup(gr.rows[0]) });
});

// 获取会话列表
app.get('/api/conversations', authMiddleware, async (req, res) => {
    const ur = await pool.query('SELECT * FROM users WHERE qq_id = $1', [req.userQQId]);
    if (ur.rows.length === 0) return res.json({ conversations: [] });
    const user = rowToUser(ur.rows[0]);
    const conversations = [];
    const friendQQIds = JSON.parse(user.friends || '[]');

    for (const fQQ of friendQQIds) {
        const fr = await pool.query('SELECT * FROM users WHERE qq_id = $1', [fQQ]);
        if (fr.rows.length === 0) continue;
        const friend = rowToUser(fr.rows[0]);
        const convKey = [req.userQQId, fQQ].sort().join('_');
        const msgs = await pool.query('SELECT * FROM messages WHERE conv_key = $1 ORDER BY timestamp DESC LIMIT 1', [convKey]);
        const lastMsg = msgs.rows.length > 0 ? rowToMessage(msgs.rows[0]) : null;
        const unreadResult = await pool.query('SELECT COUNT(*) FROM messages WHERE conv_key = $1 AND msg_to = $2 AND read_msg = false', [convKey, req.userQQId]);
        conversations.push({
            type: 'friend', id: fQQ, name: friend.nickname || friend.username, avatar: friend.avatar,
            lastMsg: lastMsg ? (lastMsg.type === 'image' ? '[图片]' : lastMsg.text) : '',
            timestamp: lastMsg ? lastMsg.timestamp : 0,
            unread: parseInt(unreadResult.rows[0].count)
        });
    }

    const groupIds = JSON.parse(user.groups || '[]');
    for (const gId of groupIds) {
        const gr = await pool.query('SELECT * FROM groups_table WHERE id = $1', [gId]);
        if (gr.rows.length === 0) continue;
        const group = gr.rows[0];
        const msgs = await pool.query('SELECT * FROM messages WHERE group_id = $1 ORDER BY timestamp DESC LIMIT 1', [gId]);
        const lastMsg = msgs.rows.length > 0 ? rowToMessage(msgs.rows[0]) : null;
        const members = JSON.parse(group.members || '[]');
        const memberList = [];
        for (const mQQ of members) {
            const mr = await pool.query('SELECT * FROM users WHERE qq_id = $1', [mQQ]);
            memberList.push(mr.rows.length > 0 ? sanitizeUser(rowToUser(mr.rows[0])) : { qqId: mQQ, nickname: mQQ });
        }
        conversations.push({
            type: 'group', id: gId, name: group.name, avatar: '', members: memberList,
            lastMsg: lastMsg ? (lastMsg.type === 'image' ? '[图片]' : (lastMsg.senderName || '') + ': ' + lastMsg.text) : '',
            timestamp: lastMsg ? lastMsg.timestamp : parseInt(group.created_at),
            unread: 0
        });
    }

    conversations.sort((a, b) => b.timestamp - a.timestamp);
    res.json({ conversations });
});

// ==================== Socket.io ====================
const onlineUsers = {};

io.on('connection', (socket) => {
    console.log('新连接:', socket.id);
    let currentQQId = null;

    socket.on('online', (data) => {
        const { qqId, token: userToken } = data;
        try {
            const decoded = jwt.verify(userToken, JWT_SECRET);
            if (decoded.qqId !== qqId) return;
            currentQQId = qqId;
            socket.join(qqId);
            onlineUsers[qqId] = socket.id;

            pool.query('SELECT * FROM users WHERE qq_id = $1', [qqId]).then(ur => {
                if (ur.rows.length > 0) {
                    const user = rowToUser(ur.rows[0]);
                    const friendQQIds = JSON.parse(user.friends || '[]');
                    friendQQIds.forEach(fQQ => io.to(fQQ).emit('friendOnline', { qqId, online: true }));
                    const onlineFriends = friendQQIds.filter(f => onlineUsers[f]);
                    socket.emit('onlineFriends', onlineFriends);
                }
            });
        } catch (e) {}
    });

    socket.on('sendMessage', async (data) => {
        const { token: userToken, targetId, text, type, targetType } = data;
        try {
            const decoded = jwt.verify(userToken, JWT_SECRET);
            const userResult = await pool.query('SELECT * FROM users WHERE qq_id = $1', [decoded.qqId]);
            if (userResult.rows.length === 0) return;
            const user = rowToUser(userResult.rows[0]);

            const msg = {
                id: uuidv4(), from: user.qqId, text, type: type || 'text',
                timestamp: Date.now(), read: false, senderName: user.nickname, senderAvatar: user.avatar
            };

            if (targetType === 'group') {
                const gr = await pool.query('SELECT * FROM groups_table WHERE id = $1', [targetId]);
                if (gr.rows.length === 0) return;
                const members = JSON.parse(gr.rows[0].members || '[]');
                if (!members.includes(user.qqId)) return;

                await pool.query('INSERT INTO messages (id, group_id, msg_from, text, type, timestamp, read_msg, sender_name, sender_avatar) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
                    [msg.id, targetId, msg.from, msg.text, msg.type, msg.timestamp, true, msg.senderName, msg.senderAvatar]);

                members.forEach(mQQ => {
                    io.to(mQQ).emit('newMessage', { conversationId: targetId, conversationType: 'group', message: msg });
                });
            } else {
                const convKey = [user.qqId, targetId].sort().join('_');
                await pool.query('INSERT INTO messages (id, conv_key, msg_from, msg_to, text, type, timestamp, read_msg, sender_name, sender_avatar) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
                    [msg.id, convKey, msg.from, targetId, msg.text, msg.type, msg.timestamp, false, msg.senderName, msg.senderAvatar]);

                io.to(targetId).emit('newMessage', { conversationId: user.qqId, conversationType: 'friend', message: msg });
                socket.emit('newMessage', { conversationId: targetId, conversationType: 'friend', message: msg });
            }
        } catch (e) {}
    });

    socket.on('sendImageMessage', async (data) => {
        const { token: userToken, targetId, imageData, targetType } = data;
        try {
            const decoded = jwt.verify(userToken, JWT_SECRET);
            const userResult = await pool.query('SELECT * FROM users WHERE qq_id = $1', [decoded.qqId]);
            if (userResult.rows.length === 0) return;
            const user = rowToUser(userResult.rows[0]);

            const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
            const filename = `${uuidv4()}.jpg`;
            fs.writeFileSync(path.join(uploadsDir, filename), base64Data, 'base64');
            const imageUrl = '/uploads/' + filename;

            const msg = {
                id: uuidv4(), from: user.qqId, text: imageUrl, type: 'image',
                timestamp: Date.now(), read: false, senderName: user.nickname, senderAvatar: user.avatar
            };

            if (targetType === 'group') {
                const gr = await pool.query('SELECT * FROM groups_table WHERE id = $1', [targetId]);
                if (gr.rows.length === 0) return;
                const members = JSON.parse(gr.rows[0].members || '[]');
                await pool.query('INSERT INTO messages (id, group_id, msg_from, text, type, timestamp, read_msg, sender_name, sender_avatar) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
                    [msg.id, targetId, msg.from, msg.text, msg.type, msg.timestamp, true, msg.senderName, msg.senderAvatar]);
                members.forEach(mQQ => io.to(mQQ).emit('newMessage', { conversationId: targetId, conversationType: 'group', message: msg }));
            } else {
                const convKey = [user.qqId, targetId].sort().join('_');
                await pool.query('INSERT INTO messages (id, conv_key, msg_from, msg_to, text, type, timestamp, read_msg, sender_name, sender_avatar) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
                    [msg.id, convKey, msg.from, targetId, msg.text, msg.type, msg.timestamp, false, msg.senderName, msg.senderAvatar]);
                io.to(targetId).emit('newMessage', { conversationId: user.qqId, conversationType: 'friend', message: msg });
                socket.emit('newMessage', { conversationId: targetId, conversationType: 'friend', message: msg });
            }
        } catch (e) {}
    });

    socket.on('typing', async (data) => {
        const { token: userToken, targetId, targetType } = data;
        try {
            const decoded = jwt.verify(userToken, JWT_SECRET);
            if (targetType === 'group') {
                const gr = await pool.query('SELECT * FROM groups_table WHERE id = $1', [targetId]);
                if (gr.rows.length > 0) {
                    JSON.parse(gr.rows[0].members || '[]').forEach(mQQ => {
                        if (mQQ !== decoded.qqId) io.to(mQQ).emit('userTyping', { conversationId: targetId, conversationType: 'group', qqId: decoded.qqId, nickname: '' });
                    });
                }
            } else {
                io.to(targetId).emit('userTyping', { conversationId: decoded.qqId, conversationType: 'friend', qqId: decoded.qqId, nickname: '' });
            }
        } catch (e) {}
    });

    socket.on('disconnect', () => {
        if (currentQQId) {
            delete onlineUsers[currentQQId];
            pool.query('SELECT * FROM users WHERE qq_id = $1', [currentQQId]).then(ur => {
                if (ur.rows.length > 0) {
                    const user = rowToUser(ur.rows[0]);
                    JSON.parse(user.friends || '[]').forEach(fQQ => io.to(fQQ).emit('friendOnline', { qqId: currentQQId, online: false }));
                }
            });
        }
    });
});

// ==================== 辅助函数 ====================
function rowToUser(row) {
    return {
        id: row.id, qqId: row.qq_id, username: row.username, password: row.password,
        nickname: row.nickname, avatar: row.avatar, signature: row.signature || '',
        friends: row.friends || '[]', groups: row.groups || '[]', createdAt: parseInt(row.created_at) || 0
    };
}

function rowToMessage(row) {
    return {
        id: row.id, from: row.msg_from, to: row.msg_to, text: row.text, type: row.type,
        timestamp: parseInt(row.timestamp) || 0, read: row.read_msg || false,
        senderName: row.sender_name, senderAvatar: row.sender_avatar, groupId: row.group_id
    };
}

function sanitizeUser(user) {
    return {
        id: user.id, qqId: user.qqId, username: user.username,
        nickname: user.nickname, avatar: user.avatar, signature: user.signature || '',
        friends: typeof user.friends === 'string' ? JSON.parse(user.friends) : user.friends,
        groups: typeof user.groups === 'string' ? JSON.parse(user.groups) : user.groups,
        createdAt: user.createdAt
    };
}

function sanitizeGroup(group) {
    return {
        id: group.id, name: group.name, creator: group.creator,
        members: typeof group.members === 'string' ? JSON.parse(group.members) : group.members,
        createdAt: group.created_at || group.createdAt
    };
}

// ==================== 启动服务器 ====================
async function start() {
    await initDB();
    server.listen(PORT, () => {
        console.log(`✅ QQ聊天服务器已启动！`);
        console.log(`📍 端口: ${PORT}`);
    });
}

start();
