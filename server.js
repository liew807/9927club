// server.js - 完整版（包含会员管理 + Bark 订单推送通知，兼容旧版 Node.js）
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const https = require('https');  // 兼容旧版 Node.js，用于 Bark 推送

const app = express();
const PORT = process.env.PORT || 3000;

// ========== Bark 推送配置 ==========
const BARK_KEY = '59pBLHbHpstiPf9D7xdV9C';
const BARK_ICON = 'https://i.ibb.co/gMK2SgqM/6-EE88981-6342-485-B-B321-45843-C794358.jpg';

// Bark 推送函数（使用 https.get 兼容旧版 Node.js）
async function sendBarkNotification(order) {
    try {
        const isVipOrder = order.type === 'vip';
        const orderTypeName = isVipOrder ? '会员开通' : 'MK工作室商品订单提醒📲';
        const orderNumberShort = order.orderNumber.slice(-8);
        const title = `MK工作室订单提醒📲 ${orderTypeName} #${orderNumberShort}`;
        const itemName = isVipOrder ? `${order.vipType}会员` : order.productName;
        const content = `💰 金额: RM${order.totalAmount} | 📦 ${itemName}`;
        
        const encodedTitle = encodeURIComponent(title);
        const encodedContent = encodeURIComponent(content);
        const encodedIcon = encodeURIComponent(BARK_ICON);
        
        const barkUrl = `https://api.day.app/${BARK_KEY}/${encodedTitle}/${encodedContent}?icon=${encodedIcon}&sound=alert&level=timeSensitive`;
        
        console.log('📱 发送 Bark 推送:', title);
        
        // 使用 https.get 替代 fetch（兼容旧版 Node.js）
        https.get(barkUrl, (res) => {
            if (res.statusCode === 200) {
                console.log('✅ Bark 推送成功');
            } else {
                console.log('⚠️ Bark 推送返回状态:', res.statusCode);
            }
        }).on('error', (err) => {
            console.error('❌ Bark 推送失败:', err.message);
        });
        
    } catch (error) {
        console.error('Bark推送错误:', error);
    }
}

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ========== 数据文件配置 ==========
const DATA_FILE = path.join(__dirname, 'data.json');

// 确保数据文件存在
async function ensureDataFile() {
    try {
        await fs.access(DATA_FILE);
        console.log('✅ 数据文件已存在');
    } catch {
        const initialData = {
            users: [
                { 
                    id: 1,
                    username: 'liew', 
                    password: 'liew123', 
                    isAdmin: true,
                    createdAt: new Date().toISOString()
                }
            ],
            products: [],
            orders: [],
            members: [],
            services: [
                {
                    id: 1,
                    type: 'whatsapp',
                    name: '官方客服',
                    link: 'https://wa.me/60123456789',
                    enabled: true,
                    createdAt: new Date().toISOString()
                },
                {
                    id: 2,
                    type: 'wechat',
                    name: '微信客服',
                    link: 'https://weixin.qq.com/',
                    enabled: true,
                    createdAt: new Date().toISOString()
                }
            ],
            settings: {
                storeName: 'YP俱乐部',
                kuaishouLink: 'https://v.kuaishou.com/JGv00n48',
                contactInfo: 'FB账号GH Tree',
                welcomeMessage: '欢迎选购！点击购买扫码完成付款',
                enableService: true,
                updatedAt: new Date().toISOString()
            },
            lastUpdated: new Date().toISOString()
        };
        
        await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
        console.log('✅ 创建初始数据文件 data.json');
    }
}

// 读取数据
async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const parsed = JSON.parse(data);
        
        if (!parsed.users) parsed.users = [];
        if (!parsed.products) parsed.products = [];
        if (!parsed.orders) parsed.orders = [];
        if (!parsed.members) parsed.members = [];
        if (!parsed.services) parsed.services = [];
        if (!parsed.settings) parsed.settings = {};
        
        if (parsed.orders) {
            parsed.orders = parsed.orders.map(order => ({
                gameName: '',
                gameRegion: '',
                specifiedPlayer: '',
                orderRemark: '',
                ...order
            }));
        }
        
        if (parsed.members) {
            parsed.members = parsed.members.map(member => ({
                status: 'active',
                ...member
            }));
        }
        
        return parsed;
    } catch (error) {
        console.error('❌ 读取数据失败:', error.message);
        await ensureDataFile();
        return await readData();
    }
}

// 保存数据
async function saveData(data) {
    try {
        data.lastUpdated = new Date().toISOString();
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
        console.log('💾 数据已保存到 data.json');
        return true;
    } catch (error) {
        console.error('❌ 保存数据失败:', error);
        return false;
    }
}

// ========== API路由 ==========

// 1. 获取商品列表
app.get('/api/products', async (req, res) => {
    try {
        const data = await readData();
        res.json({
            success: true,
            data: data.products || [],
            total: data.products.length,
            lastUpdated: data.lastUpdated
        });
    } catch (error) {
        console.error('获取商品失败:', error);
        res.status(500).json({ success: false, error: '获取商品失败' });
    }
});

// 2. 添加商品
app.post('/api/products/add', async (req, res) => {
    try {
        const { name, price, description, image, category } = req.body;
        console.log('📦 添加商品:', { name, price });
        
        if (!name || !price) {
            return res.status(400).json({ 
                success: false, 
                error: '商品名称和价格是必填项' 
            });
        }
        
        const data = await readData();
        
        const product = {
            id: Date.now(),
            name,
            price: parseFloat(price),
            description: description || '',
            image: image || 'https://via.placeholder.com/300x250.png?text=商品',
            category: category || '热门',
            createdAt: new Date().toISOString()
        };
        
        data.products.push(product);
        await saveData(data);
        
        console.log(`✅ 商品添加成功: ${product.name} (ID: ${product.id})`);
        
        res.json({
            success: true,
            data: product,
            message: '商品添加成功'
        });
    } catch (error) {
        console.error('添加商品失败:', error);
        res.status(500).json({ success: false, error: '添加商品失败' });
    }
});

// 3. 删除商品
app.post('/api/products/delete', async (req, res) => {
    try {
        const { id } = req.body;
        console.log('🗑️ 删除商品:', id);
        
        if (!id) {
            return res.status(400).json({ 
                success: false, 
                error: '商品ID是必填项' 
            });
        }
        
        const data = await readData();
        const productId = Number(id);
        const initialLength = data.products.length;
        
        data.products = data.products.filter(p => p.id !== productId);
        
        if (data.products.length < initialLength) {
            await saveData(data);
            console.log(`✅ 商品删除成功: ID ${id}`);
            res.json({ 
                success: true, 
                message: '商品删除成功',
                deletedId: productId
            });
        } else {
            console.log(`❌ 商品不存在: ID ${id}`);
            res.status(404).json({ 
                success: false, 
                error: '商品不存在' 
            });
        }
    } catch (error) {
        console.error('删除商品失败:', error);
        res.status(500).json({ success: false, error: '删除商品失败' });
    }
});

// 4. 批量同步商品
app.post('/api/products/sync', async (req, res) => {
    try {
        const { products } = req.body;
        console.log('🔄 同步商品数据');
        
        const data = await readData();
        
        if (products && Array.isArray(products)) {
            data.products = products;
            await saveData(data);
            console.log(`✅ 同步完成: ${products.length}个商品`);
        }
        
        res.json({
            success: true,
            data: data.products,
            message: '同步成功'
        });
    } catch (error) {
        console.error('同步商品失败:', error);
        res.status(500).json({ success: false, error: '同步商品失败' });
    }
});

// 5. 获取订单列表
app.get('/api/orders', async (req, res) => {
    try {
        const data = await readData();
        
        const sortedOrders = (data.orders || []).sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateB - dateA;
        });
        
        res.json({
            success: true,
            data: sortedOrders,
            total: sortedOrders.length
        });
    } catch (error) {
        console.error('获取订单失败:', error);
        res.status(500).json({ success: false, error: '获取订单失败' });
    }
});

// 6. 添加订单（包含Bark推送）
app.post('/api/orders/add', async (req, res) => {
    try {
        const { 
            orderNumber, 
            userId, 
            productId, 
            productName, 
            productPrice, 
            totalAmount, 
            paymentMethod, 
            status,
            type = 'product',
            vipType,
            gameName,
            gameRegion,
            specifiedPlayer,
            orderRemark
        } = req.body;
        
        console.log('📋 添加订单:', orderNumber);
        
        const data = await readData();
        
        const order = {
            id: Date.now(),
            orderNumber: orderNumber || `DD${Date.now().toString().slice(-8)}`,
            userId,
            productId: productId ? Number(productId) : null,
            productName: productName || (type === 'vip' ? `${vipType}会员` : '未知商品'),
            productPrice: productPrice ? parseFloat(productPrice) : 0,
            totalAmount: totalAmount ? parseFloat(totalAmount) : 0,
            paymentMethod: paymentMethod || 'tng',
            status: status || 'pending',
            type: type,
            vipType: vipType || null,
            gameName: gameName || '',
            gameRegion: gameRegion || '',
            specifiedPlayer: specifiedPlayer || '',
            orderRemark: orderRemark || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        data.orders.push(order);
        await saveData(data);
        
        // 🎯 发送 Bark 推送通知
        await sendBarkNotification(order);
        
        console.log(`✅ 订单添加成功: ${order.orderNumber} (类型: ${type})`);
        
        res.json({
            success: true,
            data: order,
            message: type === 'vip' ? '会员申请提交成功' : '订单创建成功'
        });
    } catch (error) {
        console.error('添加订单失败:', error);
        res.status(500).json({ success: false, error: '添加订单失败' });
    }
});

// 7. 删除订单API
app.delete('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('🗑️ 删除订单:', id);
        
        const data = await readData();
        const orderId = Number(id);
        const initialLength = data.orders.length;
        
        data.orders = data.orders.filter(o => o.id !== orderId);
        
        if (data.orders.length < initialLength) {
            await saveData(data);
            console.log(`✅ 订单删除成功: ID ${id}`);
            res.json({ 
                success: true, 
                message: '订单删除成功',
                deletedId: orderId
            });
        } else {
            console.log(`❌ 订单不存在: ID ${id}`);
            res.status(404).json({ 
                success: false, 
                error: '订单不存在' 
            });
        }
    } catch (error) {
        console.error('删除订单失败:', error);
        res.status(500).json({ success: false, error: '删除订单失败' });
    }
});

// 8. 更新订单状态API
app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        console.log(`🔄 更新订单状态: ID ${id}, 状态: ${status}`);
        
        if (!status) {
            return res.status(400).json({ 
                success: false, 
                error: '状态是必填项' 
            });
        }
        
        const validStatuses = ['pending', 'paid', 'completed', 'rejected'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                error: '无效的状态值' 
            });
        }
        
        const data = await readData();
        const orderId = Number(id);
        const order = data.orders.find(o => o.id === orderId);
        
        if (order) {
            const oldStatus = order.status;
            order.status = status;
            order.updatedAt = new Date().toISOString();
            await saveData(data);
            
            console.log(`✅ 订单状态更新成功: ID ${id} ${oldStatus} -> ${status}`);
            
            res.json({
                success: true,
                data: order,
                message: '订单状态更新成功'
            });
        } else {
            console.log(`❌ 订单不存在: ID ${id}`);
            res.status(404).json({ success: false, error: '订单不存在' });
        }
    } catch (error) {
        console.error('更新订单状态失败:', error);
        res.status(500).json({ success: false, error: '更新订单状态失败' });
    }
});

// ========== 会员管理API ==========

// 9. 获取所有会员记录
app.get('/api/members', async (req, res) => {
    try {
        const data = await readData();
        const members = data.members || [];
        
        res.json({
            success: true,
            data: members,
            total: members.length
        });
    } catch (error) {
        console.error('获取会员记录失败:', error);
        res.status(500).json({ success: false, error: '获取会员记录失败' });
    }
});

// 10. 获取指定用户的会员信息
app.get('/api/members/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const data = await readData();
        
        const userMembers = (data.members || []).filter(m => m.userId === userId);
        const activeMember = userMembers
            .filter(m => m.status === 'active')
            .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
        
        res.json({
            success: true,
            data: {
                all: userMembers,
                active: activeMember || null
            }
        });
    } catch (error) {
        console.error('获取用户会员信息失败:', error);
        res.status(500).json({ success: false, error: '获取用户会员信息失败' });
    }
});

// 11. 添加/更新会员记录
app.post('/api/members/add', async (req, res) => {
    try {
        const { userId, vipType, endDate, status = 'active' } = req.body;
        console.log('👑 添加会员记录:', { userId, vipType, endDate });
        
        if (!userId || !vipType) {
            return res.status(400).json({ 
                success: false, 
                error: '用户ID和会员类型是必填项' 
            });
        }
        
        const data = await readData();
        
        const userExists = data.users.some(u => u.username === userId);
        if (!userExists) {
            return res.status(404).json({ 
                success: false, 
                error: '用户不存在' 
            });
        }
        
        const memberRecord = {
            id: Date.now(),
            userId,
            vipType,
            startDate: new Date().toISOString(),
            endDate: endDate || (vipType === '永久会员' ? '永久' : new Date(Date.now() + 30*24*60*60*1000).toISOString()),
            status,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        data.members.push(memberRecord);
        await saveData(data);
        
        console.log(`✅ 会员记录添加成功: ${userId} - ${vipType}`);
        
        res.json({
            success: true,
            data: memberRecord,
            message: '会员添加成功'
        });
    } catch (error) {
        console.error('添加会员记录失败:', error);
        res.status(500).json({ success: false, error: '添加会员记录失败' });
    }
});

// 12. 更新会员记录
app.put('/api/members/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { vipType, endDate, status } = req.body;
        console.log('✏️ 更新会员记录:', id);
        
        const data = await readData();
        const memberId = Number(id);
        const member = data.members.find(m => m.id === memberId);
        
        if (!member) {
            return res.status(404).json({ 
                success: false, 
                error: '会员记录不存在' 
            });
        }
        
        if (vipType !== undefined) member.vipType = vipType;
        if (endDate !== undefined) member.endDate = endDate;
        if (status !== undefined) member.status = status;
        
        member.updatedAt = new Date().toISOString();
        await saveData(data);
        
        console.log(`✅ 会员记录更新成功: ID ${id}`);
        
        res.json({
            success: true,
            data: member,
            message: '会员信息已更新'
        });
    } catch (error) {
        console.error('更新会员记录失败:', error);
        res.status(500).json({ success: false, error: '更新会员记录失败' });
    }
});

// 13. 删除会员记录
app.delete('/api/members/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('🗑️ 删除会员记录:', id);
        
        const data = await readData();
        const memberId = Number(id);
        const initialLength = data.members.length;
        
        data.members = data.members.filter(m => m.id !== memberId);
        
        if (data.members.length < initialLength) {
            await saveData(data);
            console.log(`✅ 会员记录删除成功: ID ${id}`);
            res.json({ 
                success: true, 
                message: '会员记录删除成功',
                deletedId: memberId
            });
        } else {
            console.log(`❌ 会员记录不存在: ID ${id}`);
            res.status(404).json({ 
                success: false, 
                error: '会员记录不存在' 
            });
        }
    } catch (error) {
        console.error('删除会员记录失败:', error);
        res.status(500).json({ success: false, error: '删除会员记录失败' });
    }
});

// 14. 获取待处理的会员申请
app.get('/api/members/pending-requests', async (req, res) => {
    try {
        const data = await readData();
        
        const pendingRequests = (data.orders || [])
            .filter(o => o.type === 'vip' && o.status === 'pending')
            .map(order => ({
                ...order,
                memberRequest: true
            }))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json({
            success: true,
            data: pendingRequests,
            total: pendingRequests.length
        });
    } catch (error) {
        console.error('获取会员申请失败:', error);
        res.status(500).json({ success: false, error: '获取会员申请失败' });
    }
});

// 15. 批准会员申请
app.post('/api/members/approve/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        console.log('✅ 批准会员申请, 订单ID:', orderId);
        
        const data = await readData();
        const order = data.orders.find(o => o.id === Number(orderId));
        
        if (!order) {
            return res.status(404).json({ 
                success: false, 
                error: '订单不存在' 
            });
        }
        
        if (order.type !== 'vip') {
            return res.status(400).json({ 
                success: false, 
                error: '不是会员订单' 
            });
        }
        
        order.status = 'completed';
        order.updatedAt = new Date().toISOString();
        
        const memberRecord = {
            id: Date.now(),
            userId: order.userId,
            vipType: order.vipType,
            startDate: new Date().toISOString(),
            endDate: order.vipType === '永久会员' ? '永久' : new Date(Date.now() + 30*24*60*60*1000).toISOString(),
            status: 'active',
            sourceOrderId: order.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        data.members.push(memberRecord);
        await saveData(data);
        
        console.log(`✅ 会员申请已批准: ${order.userId} - ${order.vipType}`);
        
        res.json({
            success: true,
            data: {
                order,
                member: memberRecord
            },
            message: '会员申请已批准，会员记录已创建'
        });
    } catch (error) {
        console.error('批准会员申请失败:', error);
        res.status(500).json({ success: false, error: '批准会员申请失败' });
    }
});

// 16. 拒绝会员申请
app.post('/api/members/reject/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        console.log('❌ 拒绝会员申请, 订单ID:', orderId);
        
        const data = await readData();
        const order = data.orders.find(o => o.id === Number(orderId));
        
        if (!order) {
            return res.status(404).json({ 
                success: false, 
                error: '订单不存在' 
            });
        }
        
        order.status = 'rejected';
        order.updatedAt = new Date().toISOString();
        await saveData(data);
        
        console.log(`✅ 会员申请已拒绝: ${order.userId}`);
        
        res.json({
            success: true,
            data: order,
            message: '会员申请已拒绝'
        });
    } catch (error) {
        console.error('拒绝会员申请失败:', error);
        res.status(500).json({ success: false, error: '拒绝会员申请失败' });
    }
});

// 17. 用户登录
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log(`🔐 登录尝试: ${username}`);
        
        const data = await readData();
        
        const user = data.users.find(u => 
            u.username === username && u.password === password
        );
        
        if (user) {
            console.log('✅ 登录成功:', username);
            
            const userMembers = (data.members || [])
                .filter(m => m.userId === username && m.status === 'active');
            
            const activeMember = userMembers
                .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
            
            const safeUser = {
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin || false,
                member: activeMember || null,
                createdAt: user.createdAt
            };
            
            res.json({
                success: true,
                data: safeUser,
                message: '登录成功'
            });
        } else {
            console.log('❌ 登录失败:', username);
            res.status(401).json({ 
                success: false, 
                error: '用户名或密码错误',
                hint: '默认管理员: admin / admin123'
            });
        }
    } catch (error) {
        console.error('登录错误:', error);
        res.status(500).json({ success: false, error: '登录失败' });
    }
});

// 18. 用户注册
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log('👤 注册用户:', username);
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                error: '用户名和密码是必填项' 
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                error: '密码长度至少6位' 
            });
        }
        
        const data = await readData();
        
        if (data.users.some(u => u.username === username)) {
            return res.status(400).json({ 
                success: false, 
                error: '用户名已存在' 
            });
        }
        
        const newUser = {
            id: Date.now(),
            username,
            password,
            isAdmin: false,
            createdAt: new Date().toISOString()
        };
        
        data.users.push(newUser);
        await saveData(data);
        
        console.log('✅ 注册成功:', username);
        
        const safeUser = {
            id: newUser.id,
            username: newUser.username,
            isAdmin: newUser.isAdmin,
            member: null,
            createdAt: newUser.createdAt
        };
        
        res.json({
            success: true,
            data: safeUser,
            message: '注册成功'
        });
    } catch (error) {
        console.error('注册失败:', error);
        res.status(500).json({ success: false, error: '注册失败' });
    }
});

// 19. 获取用户列表
app.get('/api/users', async (req, res) => {
    try {
        const data = await readData();
        
        const safeUsers = data.users.map(user => {
            const userMembers = (data.members || [])
                .filter(m => m.userId === user.username && m.status === 'active');
            const activeMember = userMembers
                .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
            
            return {
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin,
                member: activeMember || null,
                createdAt: user.createdAt
            };
        });
        
        res.json({
            success: true,
            data: safeUsers,
            total: safeUsers.length
        });
    } catch (error) {
        console.error('获取用户失败:', error);
        res.status(500).json({ success: false, error: '获取用户失败' });
    }
});

// 20. 获取系统设置
app.get('/api/settings', async (req, res) => {
    try {
        const data = await readData();
        res.json({
            success: true,
            data: data.settings || {}
        });
    } catch (error) {
        console.error('获取设置失败:', error);
        res.status(500).json({ success: false, error: '获取设置失败' });
    }
});

// 21. 更新系统设置
app.post('/api/settings/update', async (req, res) => {
    try {
        const settings = req.body;
        console.log('⚙️ 更新系统设置');
        
        const data = await readData();
        
        data.settings = {
            ...data.settings,
            ...settings,
            updatedAt: new Date().toISOString()
        };
        
        await saveData(data);
        
        console.log('✅ 设置更新成功');
        
        res.json({
            success: true,
            data: data.settings,
            message: '设置更新成功'
        });
    } catch (error) {
        console.error('更新设置失败:', error);
        res.status(500).json({ success: false, error: '更新设置失败' });
    }
});

// 22. 获取客服列表
app.get('/api/services', async (req, res) => {
    try {
        const data = await readData();
        const enabledServices = data.services.filter(service => service.enabled !== false);
        
        res.json({
            success: true,
            data: enabledServices,
            total: enabledServices.length
        });
    } catch (error) {
        console.error('获取客服失败:', error);
        res.status(500).json({ success: false, error: '获取客服失败' });
    }
});

// 23. 获取所有客服
app.get('/api/services/all', async (req, res) => {
    try {
        const data = await readData();
        res.json({
            success: true,
            data: data.services || [],
            total: data.services.length
        });
    } catch (error) {
        console.error('获取所有客服失败:', error);
        res.status(500).json({ success: false, error: '获取客服失败' });
    }
});

// 24. 添加客服
app.post('/api/services/add', async (req, res) => {
    try {
        const { type, name, link, enabled } = req.body;
        console.log('💁 添加客服:', { type, name });
        
        if (!type || !name || !link) {
            return res.status(400).json({ 
                success: false, 
                error: '客服类型、名称和链接是必填项' 
            });
        }
        
        if (!link.startsWith('http://') && !link.startsWith('https://')) {
            return res.status(400).json({ 
                success: false, 
                error: '链接格式不正确，请以http://或https://开头' 
            });
        }
        
        const data = await readData();
        
        const service = {
            id: Date.now(),
            type,
            name,
            link,
            enabled: enabled !== undefined ? enabled : true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        data.services.push(service);
        await saveData(data);
        
        console.log(`✅ 客服添加成功: ${service.name}`);
        
        res.json({
            success: true,
            data: service,
            message: '客服添加成功'
        });
    } catch (error) {
        console.error('添加客服失败:', error);
        res.status(500).json({ success: false, error: '添加客服失败' });
    }
});

// 25. 删除客服
app.delete('/api/services/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('🗑️ 删除客服:', id);
        
        const data = await readData();
        const serviceId = Number(id);
        const initialLength = data.services.length;
        
        data.services = data.services.filter(s => s.id !== serviceId);
        
        if (data.services.length < initialLength) {
            await saveData(data);
            console.log(`✅ 客服删除成功: ID ${id}`);
            res.json({ 
                success: true, 
                message: '客服删除成功',
                deletedId: serviceId
            });
        } else {
            console.log(`❌ 客服不存在: ID ${id}`);
            res.status(404).json({ 
                success: false, 
                error: '客服不存在' 
            });
        }
    } catch (error) {
        console.error('删除客服失败:', error);
        res.status(500).json({ success: false, error: '删除客服失败' });
    }
});

// 26. 更新客服状态
app.put('/api/services/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;
        const { enabled } = req.body;
        console.log(`🔄 更新客服状态: ID ${id}, 启用: ${enabled}`);
        
        if (enabled === undefined) {
            return res.status(400).json({ 
                success: false, 
                error: '启用状态是必填项' 
            });
        }
        
        const data = await readData();
        const serviceId = Number(id);
        const service = data.services.find(s => s.id === serviceId);
        
        if (service) {
            service.enabled = enabled;
            service.updatedAt = new Date().toISOString();
            await saveData(data);
            
            console.log(`✅ 客服状态更新成功: ID ${id} -> ${enabled ? '启用' : '禁用'}`);
            
            res.json({
                success: true,
                data: service,
                message: `客服已${enabled ? '启用' : '禁用'}`
            });
        } else {
            console.log(`❌ 客服不存在: ID ${id}`);
            res.status(404).json({ success: false, error: '客服不存在' });
        }
    } catch (error) {
        console.error('更新客服状态失败:', error);
        res.status(500).json({ success: false, error: '更新客服状态失败' });
    }
});

// 27. 更新客服信息
app.post('/api/services/update', async (req, res) => {
    try {
        const { id, name, link, enabled } = req.body;
        console.log('✏️ 更新客服信息:', { id, name });
        
        if (!id) {
            return res.status(400).json({ 
                success: false, 
                error: '客服ID是必填项' 
            });
        }
        
        const data = await readData();
        const serviceId = Number(id);
        const service = data.services.find(s => s.id === serviceId);
        
        if (service) {
            if (name !== undefined) service.name = name;
            if (link !== undefined) {
                if (!link.startsWith('http://') && !link.startsWith('https://')) {
                    return res.status(400).json({ 
                        success: false, 
                        error: '链接格式不正确，请以http://或https://开头' 
                    });
                }
                service.link = link;
            }
            if (enabled !== undefined) service.enabled = enabled;
            
            service.updatedAt = new Date().toISOString();
            await saveData(data);
            
            console.log(`✅ 客服信息更新成功: ID ${id}`);
            
            res.json({
                success: true,
                data: service,
                message: '客服信息已更新'
            });
        } else {
            console.log(`❌ 客服不存在: ID ${id}`);
            res.status(404).json({ success: false, error: '客服不存在' });
        }
    } catch (error) {
        console.error('更新客服信息失败:', error);
        res.status(500).json({ success: false, error: '更新客服信息失败' });
    }
});

// 28. 系统状态
app.get('/api/status', async (req, res) => {
    try {
        const data = await readData();
        
        const totalMembers = data.members?.length || 0;
        const activeMembers = data.members?.filter(m => m.status === 'active').length || 0;
        const pendingRequests = data.orders?.filter(o => o.type === 'vip' && o.status === 'pending').length || 0;
        
        res.json({
            success: true,
            data: {
                status: 'running',
                productsCount: data.products.length,
                ordersCount: data.orders.length,
                usersCount: data.users.length,
                servicesCount: data.services.length,
                membersCount: totalMembers,
                activeMembers: activeMembers,
                pendingVipRequests: pendingRequests,
                lastUpdated: data.lastUpdated,
                uptime: process.uptime(),
                storeName: data.settings.storeName || '未设置',
                version: '3.0 (包含会员管理功能 + Bark推送)'
            },
            message: '系统运行正常'
        });
    } catch (error) {
        console.error('获取状态失败:', error);
        res.status(500).json({ success: false, error: '获取状态失败' });
    }
});

// 29. 获取完整数据
app.get('/api/data', async (req, res) => {
    try {
        const data = await readData();
        
        const safeData = {
            ...data,
            users: data.users.map(user => ({
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin,
                createdAt: user.createdAt
            }))
        };
        
        res.json({
            success: true,
            data: safeData
        });
    } catch (error) {
        console.error('获取完整数据失败:', error);
        res.status(500).json({ success: false, error: '获取数据失败' });
    }
});

// 30. 直接访问 data.json
app.get('/data.json', async (req, res) => {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        res.setHeader('Content-Type', 'application/json');
        res.send(data);
    } catch (error) {
        res.status(500).json({ error: '无法读取数据文件' });
    }
});

// 31. 测试连接
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'API测试成功',
        timestamp: new Date().toISOString(),
        server: 'YP俱乐部后端服务器',
        version: '3.0',
        features: ['会员管理', '游戏信息字段', '订单管理', 'Bark推送通知']
    });
});

// 32. 首页
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>YP俱乐部后台系统 - 会员版</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
                .container { max-width: 900px; margin: 0 auto; background: rgba(255,255,255,0.95); padding: 30px; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); color: #333; }
                h1 { color: #333; text-align: center; margin-bottom: 30px; font-size: 2.5em; }
                .status { background: #4CAF50; color: white; padding: 15px; border-radius: 8px; text-align: center; margin-bottom: 30px; font-size: 1.2em; }
                .section { margin-bottom: 25px; }
                .section h2 { color: #444; border-bottom: 2px solid #4CAF50; padding-bottom: 10px; margin-bottom: 15px; }
                .api-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; }
                .api-item { background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #4CAF50; }
                .method { display: inline-block; padding: 5px 10px; border-radius: 4px; margin-right: 10px; font-weight: bold; font-size: 12px; color: white; }
                .get { background: #61affe; }
                .post { background: #49cc90; }
                .put { background: #fca130; }
                .delete { background: #f93e3e; }
                .url { font-family: monospace; color: #555; }
                .note { background: #fff3cd; padding: 15px; border-radius: 8px; margin-top: 20px; color: #856404; }
                a { color: #4CAF50; text-decoration: none; font-weight: bold; }
                a:hover { text-decoration: underline; }
                .new-feature { background: #d4edda; border-left: 4px solid #155724; padding: 15px; border-radius: 8px; margin: 15px 0; }
                .feature-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 20px 0; }
                .feature-card { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                .feature-card h4 { margin: 0 0 10px 0; color: #333; }
                .badge { background: gold; color: black; padding: 3px 8px; border-radius: 20px; font-size: 12px; font-weight: bold; margin-left: 10px; }
                .bark-badge { background: #34a853; color: white; padding: 3px 8px; border-radius: 20px; font-size: 12px; margin-left: 10px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>👑 YP俱乐部后台系统 · 会员版</h1>
                
                <div class="status">
                    ✅ 服务器运行中 | 端口: ${PORT} | 版本: 3.0 | 会员管理 + Bark推送
                </div>
                
                <div class="new-feature">
                    <h3>📱 Bark 订单推送已启用 <span class="bark-badge">实时通知</span></h3>
                    <p>新订单产生时，会自动推送通知到您的手机：</p>
                    <ul>
                        <li>🔔 通知标题：新订单 #订单号后8位</li>
                        <li>💰 通知内容：金额 + 商品名称</li>
                        <li>🖼️ 自定义图标已配置</li>
                    </ul>
                    <p><strong>测试方法：</strong>创建一个测试订单，手机应该会在3秒内收到推送</p>
                </div>
                
                <div class="section">
                    <h2>📊 实时状态</h2>
                    <div class="api-list">
                        <div class="api-item">
                            <span class="method get">GET</span>
                            <a href="/api/status" target="_blank" class="url">/api/status</a>
                            <div style="font-size: 12px; color: #666; margin-top: 5px;">系统状态（含会员统计）</div>
                        </div>
                        <div class="api-item">
                            <span class="method get">GET</span>
                            <a href="/api/members" target="_blank" class="url">/api/members</a>
                            <div style="font-size: 12px; color: #666; margin-top: 5px;">所有会员记录</div>
                        </div>
                        <div class="api-item">
                            <span class="method get">GET</span>
                            <a href="/api/members/pending-requests" target="_blank" class="url">/api/members/pending-requests</a>
                            <div style="font-size: 12px; color: #666; margin-top: 5px;">待处理的会员申请</div>
                        </div>
                    </div>
                </div>
                
                <div class="section">
                    <h2>🔑 管理员账户</h2>
                    <div style="background: #e8f5e9; padding: 15px; border-radius: 8px;">
                        <strong>用户名:</strong> admin<br>
                        <strong>密码:</strong> admin123<br>
                        <span style="font-size: 12px; color: #666;">（使用此账户登录后台管理会员）</span>
                    </div>
                </div>
                
                <div class="note">
                    <strong>💡 功能说明：</strong><br>
                    1. 用户下单后，Bark 会自动推送通知到您的手机<br>
                    2. 会员订单和商品订单都会触发推送<br>
                    3. 推送包含订单号、金额、商品名称<br>
                    4. 所有数据实时保存到 data.json<br>
                    5. 确保手机已安装 Bark App 并允许通知权限<br>
                </div>
                
                <div style="text-align: center; margin-top: 30px; color: #666; font-size: 12px;">
                    ©2026 YP俱乐部 | 数据文件自动保存 | 实时同步 | 版本3.0 (会员版 + Bark推送)
                </div>
            </div>
        </body>
        </html>
    `);
});

// 404处理
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'API不存在',
        availableEndpoints: [
            'GET  /api/status',
            'GET  /api/products',
            'GET  /api/orders',
            'GET  /api/members',
            'GET  /api/members/pending-requests',
            'POST /api/members/approve/:orderId',
            'POST /api/orders/add (支持type=vip)',
            'POST /api/login',
            'POST /api/register',
            'GET  /api/settings',
            'GET  /api/services',
            'DELETE /api/orders/:id',
            'DELETE /api/services/:id',
            'PUT /api/orders/:id/status',
            'GET  /data.json'
        ]
    });
});

// 错误处理
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({
        success: false,
        error: '服务器内部错误',
        message: err.message
    });
});

// 启动服务器
async function startServer() {
    try {
        await ensureDataFile();
        
        app.listen(PORT, () => {
            console.log(`
            ╔════════════════════════════════════════════════════════════════╗
            ║     🚀 YP俱乐部后台系统启动 3.0 (会员版 + Bark推送)              ║
            ╠════════════════════════════════════════════════════════════════╣
            ║  📍 本地访问: http://localhost:${PORT}                            ║
            ║  🔗 API基础: http://localhost:${PORT}/api                         ║
            ║  📁 数据文件: ${DATA_FILE}                                      ║
            ╠════════════════════════════════════════════════════════════════╣
            ║  📱 Bark 推送已启用 (兼容模式)                                    ║
            ║  • 新订单会自动推送到您的手机                                      ║
            ║  • 推送内容: 订单号 + 金额 + 商品名称                              ║
            ║  • 自定义图标已配置                                              ║
            ╠════════════════════════════════════════════════════════════════╣
            ║  👑 会员管理功能:                                                 ║
            ║  • 会员类型: 普通/RM15, 白金/RM25, 黑金/RM35, 永久/RM50           ║
            ║  • API: /api/members/* 系列接口                                  ║
            ╠════════════════════════════════════════════════════════════════╣
            ║  🔑 默认管理员: admin / admin123                                  ║
            ║  📦 自动保存: 所有数据实时保存到文件                               ║
            ╚════════════════════════════════════════════════════════════════╝
            `);
        });
    } catch (error) {
        console.error('❌ 服务器启动失败:', error);
        process.exit(1);
    }
}

startServer().catch(console.error);
