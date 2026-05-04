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

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    maxHttpBufferSize: 1e7 // 10MB
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'qq-chat-secret-key-2024';
const QQ_ID_START = 10000;

// ==================== 中间件 ====================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 确保 uploads 目录存在
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer 配置
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${uuidv4()}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('只允许上传图片'));
    }
});

// ==================== 数据存储（内存 + 文件备份） ====================
const DATA_FILE = path.join(__dirname, 'data.json');

let DB = {
    users: {},        // username -> user
    usersByQQ: {},    // qqId -> user
    messages: {},     // "qqId1_qqId2" -> messages[]
    groupMessages: {},// groupId -> messages[]
    groups: {},       // groupId -> group
    qqIdCounter: QQ_ID_START,
    onlineUsers: {}   // qqId -> socketId
};

// 从文件加载
if (fs.existsSync(DATA_FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        DB = { ...DB, ...data };
    } catch (e) {
        console.log('数据文件损坏，使用新数据库');
    }
}

function saveData() {
    const toSave = {
        users: DB.users,
        usersByQQ: DB.usersByQQ,
        messages: DB.messages,
        groupMessages: DB.groupMessages,
        groups: DB.groups,
        qqIdCounter: DB.qqIdCounter
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(toSave, null, 2));
}

// 定时保存
setInterval(saveData, 10000);

// 生成QQ号
function generateQQId() {
    while (DB.usersByQQ[DB.qqIdCounter.toString()]) {
        DB.qqIdCounter++;
        if (DB.qqIdCounter > 99999) DB.qqIdCounter = QQ_ID_START;
    }
    const qqId = DB.qqIdCounter.toString();
    DB.qqIdCounter++;
    return qqId;
}

// JWT验证中间件
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: '请先登录' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = DB.usersByQQ[decoded.qqId];
        if (!user) return res.status(401).json({ error: '用户不存在' });
        req.user = user;
        next();
    } catch (e) {
        return res.status(401).json({ error: '登录已过期' });
    }
}

// ==================== API 路由 ====================

// 注册
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, nickname } = req.body;
        if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
        if (username.length < 2) return res.status(400).json({ error: '用户名至少2个字符' });
        if (password.length < 3) return res.status(400).json({ error: '密码至少3个字符' });
        if (DB.users[username]) return res.status(400).json({ error: '用户名已存在' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const qqId = generateQQId();
        const user = {
            id: uuidv4(),
            qqId,
            username,
            password: hashedPassword,
            nickname: nickname || username,
            avatar: '',
            signature: '',
            friends: [],
            groups: [],
            createdAt: Date.now()
        };

        DB.users[username] = user;
        DB.usersByQQ[qqId] = user;
        saveData();

        const token = jwt.sign({ qqId, username }, JWT_SECRET, { expiresIn: '30d' });
        res.json({
            token,
            user: sanitizeUser(user)
        });
    } catch (e) {
        res.status(500).json({ error: '服务器错误' });
    }
});

// 登录
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });

        let user = DB.users[username];
        if (!user) user = DB.usersByQQ[username];
        if (!user) return res.status(400).json({ error: '账号不存在' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ error: '密码错误' });

        const token = jwt.sign({ qqId: user.qqId, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
        res.json({
            token,
            user: sanitizeUser(user)
        });
    } catch (e) {
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取当前用户
app.get('/api/user', authMiddleware, (req, res) => {
    const user = DB.usersByQQ[req.user.qqId];
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json({ user: sanitizeUser(user) });
});

// 搜索用户（通过QQ号或用户名）
app.get('/api/users/search', authMiddleware, (req, res) => {
    const { q } = req.query;
    if (!q) return res.json({ users: [] });

    let found = null;
    if (DB.usersByQQ[q]) {
        found = DB.usersByQQ[q];
    } else if (DB.users[q]) {
        found = DB.users[q];
    }

    if (found) {
        res.json({ user: sanitizeUser(found) });
    } else {
        res.json({ user: null });
    }
});

// 获取好友列表
app.get('/api/friends', authMiddleware, (req, res) => {
    const user = DB.usersByQQ[req.user.qqId];
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const friends = (user.friends || []).map(qqId => {
        const friend = DB.usersByQQ[qqId];
        return friend ? sanitizeUser(friend) : null;
    }).filter(Boolean);
    res.json({ friends });
});

// 添加好友
app.post('/api/friends/add', authMiddleware, (req, res) => {
    const { friendQQId } = req.body;
    const user = DB.usersByQQ[req.user.qqId];
    const friend = DB.usersByQQ[friendQQId];
    if (!friend) return res.status(404).json({ error: '用户不存在' });
    if (friendQQId === user.qqId) return res.status(400).json({ error: '不能添加自己' });
    if (user.friends.includes(friendQQId)) return res.status(400).json({ error: '已经是好友' });

    user.friends.push(friendQQId);
    if (!friend.friends.includes(user.qqId)) {
        friend.friends.push(user.qqId);
    }
    saveData();

    // 通知双方更新好友列表
    io.to(user.qqId).emit('friendsUpdated');
    io.to(friendQQId).emit('friendsUpdated');

    res.json({ success: true, friend: sanitizeUser(friend) });
});

// 删除好友
app.post('/api/friends/remove', authMiddleware, (req, res) => {
    const { friendQQId } = req.body;
    const user = DB.usersByQQ[req.user.qqId];
    const friend = DB.usersByQQ[friendQQId];

    user.friends = user.friends.filter(f => f !== friendQQId);
    if (friend) {
        friend.friends = friend.friends.filter(f => f !== user.qqId);
    }
    saveData();

    io.to(user.qqId).emit('friendsUpdated');
    io.to(friendQQId).emit('friendsUpdated');

    res.json({ success: true });
});

// 更新个人资料
app.put('/api/user/profile', authMiddleware, async (req, res) => {
    const { nickname, signature } = req.body;
    const user = DB.usersByQQ[req.user.qqId];
    if (nickname !== undefined) user.nickname = nickname;
    if (signature !== undefined) user.signature = signature;
    saveData();

    // 通知好友更新
    user.friends.forEach(fQQ => {
        io.to(fQQ).emit('friendProfileUpdated', { qqId: user.qqId, nickname: user.nickname, signature: user.signature, avatar: user.avatar });
    });

    res.json({ user: sanitizeUser(user) });
});

// 上传头像
app.post('/api/user/avatar', authMiddleware, upload.single('avatar'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请选择图片' });
    const user = DB.usersByQQ[req.user.qqId];
    user.avatar = '/uploads/' + req.file.filename;
    saveData();

    user.friends.forEach(fQQ => {
        io.to(fQQ).emit('friendProfileUpdated', { qqId: user.qqId, nickname: user.nickname, signature: user.signature, avatar: user.avatar });
    });

    res.json({ avatar: user.avatar });
});

// 获取聊天记录
app.get('/api/messages/:targetId', authMiddleware, (req, res) => {
    const { targetId } = req.params;
    const { type } = req.query; // 'friend' or 'group'
    const user = DB.usersByQQ[req.user.qqId];

    let messages = [];
    if (type === 'group') {
        messages = DB.groupMessages[targetId] || [];
        // 检查是否群成员
        const group = DB.groups[targetId];
        if (!group || !group.members.includes(user.qqId)) {
            return res.status(403).json({ error: '你不是该群成员' });
        }
    } else {
        const convKey = [user.qqId, targetId].sort().join('_');
        messages = DB.messages[convKey] || [];
    }

    // 标记已读
    messages.forEach(m => {
        if (m.to === user.qqId && !m.read) m.read = true;
    });
    saveData();

    // 通知对方已读
    if (type !== 'group') {
        io.to(targetId).emit('messagesRead', { from: user.qqId });
    }

    res.json({ messages });
});

// 获取群列表
app.get('/api/groups', authMiddleware, (req, res) => {
    const user = DB.usersByQQ[req.user.qqId];
    const groups = (user.groups || []).map(gId => DB.groups[gId]).filter(Boolean);
    res.json({ groups: groups.map(sanitizeGroup) });
});

// 创建群聊
app.post('/api/groups/create', authMiddleware, (req, res) => {
    const { name, memberQQIds } = req.body;
    const user = DB.usersByQQ[req.user.qqId];
    if (!name) return res.status(400).json({ error: '请输入群名称' });
    if (!memberQQIds || memberQQIds.length === 0) return res.status(400).json({ error: '请选择好友' });

    const groupId = uuidv4();
    const members = [user.qqId, ...memberQQIds];

    const group = {
        id: groupId,
        name,
        creator: user.qqId,
        members,
        createdAt: Date.now()
    };

    DB.groups[groupId] = group;

    // 把群加到所有成员
    members.forEach(mQQ => {
        const mUser = DB.usersByQQ[mQQ];
        if (mUser) {
            if (!mUser.groups) mUser.groups = [];
            mUser.groups.push(groupId);
        }
    });

    if (!user.groups) user.groups = [];
    user.groups.push(groupId);
    saveData();

    // 通知所有成员
    members.forEach(mQQ => {
        io.to(mQQ).emit('groupCreated', sanitizeGroup(group));
    });

    res.json({ group: sanitizeGroup(group) });
});

// 邀请入群
app.post('/api/groups/:groupId/invite', authMiddleware, (req, res) => {
    const { groupId } = req.params;
    const { memberQQIds } = req.body;
    const user = DB.usersByQQ[req.user.qqId];
    const group = DB.groups[groupId];

    if (!group) return res.status(404).json({ error: '群不存在' });
    if (!group.members.includes(user.qqId)) return res.status(403).json({ error: '你不是群成员' });

    const newMembers = memberQQIds.filter(mQQ => !group.members.includes(mQQ));
    newMembers.forEach(mQQ => {
        group.members.push(mQQ);
        const mUser = DB.usersByQQ[mQQ];
        if (mUser) {
            if (!mUser.groups) mUser.groups = [];
            if (!mUser.groups.includes(groupId)) mUser.groups.push(groupId);
        }
    });

    saveData();

    // 通知所有群成员
    group.members.forEach(mQQ => {
        io.to(mQQ).emit('groupUpdated', sanitizeGroup(group));
    });

    res.json({ group: sanitizeGroup(group) });
});

// 获取群详情
app.get('/api/groups/:groupId', authMiddleware, (req, res) => {
    const group = DB.groups[req.params.groupId];
    if (!group) return res.status(404).json({ error: '群不存在' });
    res.json({ group: sanitizeGroup(group) });
});

// 获取会话列表
app.get('/api/conversations', authMiddleware, (req, res) => {
    const user = DB.usersByQQ[req.user.qqId];
    const conversations = [];

    // 好友会话
    (user.friends || []).forEach(fQQ => {
        const friend = DB.usersByQQ[fQQ];
        if (!friend) return;
        const convKey = [user.qqId, fQQ].sort().join('_');
        const msgs = DB.messages[convKey] || [];
        const lastMsg = msgs[msgs.length - 1];
        const unread = msgs.filter(m => m.to === user.qqId && !m.read).length;
        conversations.push({
            type: 'friend',
            id: fQQ,
            name: friend.nickname || friend.username,
            avatar: friend.avatar,
            lastMsg: lastMsg ? (lastMsg.type === 'image' ? '[图片]' : lastMsg.text) : '',
            timestamp: lastMsg ? lastMsg.timestamp : 0,
            unread
        });
    });

    // 群会话
    (user.groups || []).forEach(gId => {
        const group = DB.groups[gId];
        if (!group) return;
        const msgs = DB.groupMessages[gId] || [];
        const lastMsg = msgs[msgs.length - 1];
        conversations.push({
            type: 'group',
            id: gId,
            name: group.name,
            avatar: '',
            members: group.members,
            lastMsg: lastMsg ? (lastMsg.type === 'image' ? '[图片]' : (lastMsg.senderName || '') + ': ' + lastMsg.text) : '',
            timestamp: lastMsg ? lastMsg.timestamp : group.createdAt,
            unread: 0
        });
    });

    conversations.sort((a, b) => b.timestamp - a.timestamp);
    res.json({ conversations });
});

// ==================== Socket.io ====================
io.on('connection', (socket) => {
    console.log('新连接:', socket.id);
    let currentQQId = null;

    // 用户上线
    socket.on('online', (data) => {
        const { qqId, token } = data;
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            if (decoded.qqId !== qqId) return;
            const user = DB.usersByQQ[qqId];
            if (!user) return;

            currentQQId = qqId;
            socket.join(qqId);
            DB.onlineUsers[qqId] = socket.id;

            // 通知好友上线
            (user.friends || []).forEach(fQQ => {
                io.to(fQQ).emit('friendOnline', { qqId, online: true });
            });
            // 发送在线好友列表
            const onlineFriends = (user.friends || []).filter(fQQ => DB.onlineUsers[fQQ]);
            socket.emit('onlineFriends', onlineFriends);

            console.log(`${user.nickname}(${qqId}) 上线`);
        } catch (e) {
            console.log('认证失败');
        }
    });

    // 发送消息
    socket.on('sendMessage', (data) => {
        const { token, targetId, text, type, targetType } = data;
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = DB.usersByQQ[decoded.qqId];
            if (!user) return;

            const msg = {
                id: uuidv4(),
                from: user.qqId,
                text,
                type: type || 'text',
                timestamp: Date.now(),
                read: false,
                senderName: user.nickname,
                senderAvatar: user.avatar
            };

            if (targetType === 'group') {
                // 群聊消息
                const group = DB.groups[targetId];
                if (!group || !group.members.includes(user.qqId)) return;
                msg.groupId = targetId;
                if (!DB.groupMessages[targetId]) DB.groupMessages[targetId] = [];
                DB.groupMessages[targetId].push(msg);

                // 广播给所有群成员
                group.members.forEach(mQQ => {
                    io.to(mQQ).emit('newMessage', {
                        conversationId: targetId,
                        conversationType: 'group',
                        message: msg
                    });
                });
            } else {
                // 私聊消息
                const friend = DB.usersByQQ[targetId];
                if (!friend) return;
                msg.to = targetId;
                const convKey = [user.qqId, targetId].sort().join('_');
                if (!DB.messages[convKey]) DB.messages[convKey] = [];
                DB.messages[convKey].push(msg);

                // 发给对方
                io.to(targetId).emit('newMessage', {
                    conversationId: user.qqId,
                    conversationType: 'friend',
                    message: msg
                });
                // 发给自己（多设备同步）
                socket.emit('newMessage', {
                    conversationId: targetId,
                    conversationType: 'friend',
                    message: msg
                });
            }

            saveData();
        } catch (e) {
            console.log('发送消息失败:', e);
        }
    });

    // 发送图片消息
    socket.on('sendImageMessage', (data) => {
        const { token, targetId, imageData, targetType } = data;
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = DB.usersByQQ[decoded.qqId];
            if (!user) return;

            // 保存图片
            const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
            const filename = `${uuidv4()}.jpg`;
            const filepath = path.join(uploadsDir, filename);
            fs.writeFileSync(filepath, base64Data, 'base64');
            const imageUrl = '/uploads/' + filename;

            const msg = {
                id: uuidv4(),
                from: user.qqId,
                text: imageUrl,
                type: 'image',
                timestamp: Date.now(),
                read: false,
                senderName: user.nickname,
                senderAvatar: user.avatar
            };

            if (targetType === 'group') {
                const group = DB.groups[targetId];
                if (!group || !group.members.includes(user.qqId)) return;
                msg.groupId = targetId;
                if (!DB.groupMessages[targetId]) DB.groupMessages[targetId] = [];
                DB.groupMessages[targetId].push(msg);

                group.members.forEach(mQQ => {
                    io.to(mQQ).emit('newMessage', {
                        conversationId: targetId,
                        conversationType: 'group',
                        message: msg
                    });
                });
            } else {
                msg.to = targetId;
                const convKey = [user.qqId, targetId].sort().join('_');
                if (!DB.messages[convKey]) DB.messages[convKey] = [];
                DB.messages[convKey].push(msg);

                io.to(targetId).emit('newMessage', {
                    conversationId: user.qqId,
                    conversationType: 'friend',
                    message: msg
                });
                socket.emit('newMessage', {
                    conversationId: targetId,
                    conversationType: 'friend',
                    message: msg
                });
            }

            saveData();
        } catch (e) {
            console.log('发送图片失败:', e);
        }
    });

    // 正在输入
    socket.on('typing', (data) => {
        const { token, targetId, targetType } = data;
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = DB.usersByQQ[decoded.qqId];
            if (!user) return;

            if (targetType === 'group') {
                const group = DB.groups[targetId];
                if (!group) return;
                group.members.forEach(mQQ => {
                    if (mQQ !== user.qqId) {
                        io.to(mQQ).emit('userTyping', {
                            conversationId: targetId,
                            conversationType: 'group',
                            qqId: user.qqId,
                            nickname: user.nickname
                        });
                    }
                });
            } else {
                io.to(targetId).emit('userTyping', {
                    conversationId: user.qqId,
                    conversationType: 'friend',
                    qqId: user.qqId,
                    nickname: user.nickname
                });
            }
        } catch (e) {}
    });

    // 断开连接
    socket.on('disconnect', () => {
        if (currentQQId) {
            delete DB.onlineUsers[currentQQId];
            const user = DB.usersByQQ[currentQQId];
            if (user) {
                (user.friends || []).forEach(fQQ => {
                    io.to(fQQ).emit('friendOnline', { qqId: currentQQId, online: false });
                });
                console.log(`${user.nickname}(${currentQQId}) 下线`);
            }
        }
    });
});

// ==================== 辅助函数 ====================
function sanitizeUser(user) {
    return {
        id: user.id,
        qqId: user.qqId,
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar,
        signature: user.signature,
        friends: user.friends,
        groups: user.groups,
        createdAt: user.createdAt
    };
}

function sanitizeGroup(group) {
    return {
        id: group.id,
        name: group.name,
        creator: group.creator,
        members: group.members.map(mQQ => {
            const u = DB.usersByQQ[mQQ];
            return u ? sanitizeUser(u) : { qqId: mQQ, nickname: mQQ };
        }),
        createdAt: group.createdAt
    };
}

// ==================== 启动服务器 ====================
server.listen(PORT, () => {
    console.log(`✅ QQ聊天服务器已启动！`);
    console.log(`📍 地址: http://localhost:${PORT}`);
    console.log(`💡 按 Ctrl+C 停止服务器`);
});
