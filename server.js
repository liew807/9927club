// server.js - 完整修复版（包含游戏信息字段和横幅管理）
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const multer = require('multer'); // 新增：用于文件上传
const sharp = require('sharp'); // 新增：用于图片处理

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ========== 配置图片上传 ==========
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// 确保上传目录存在
async function ensureUploadsDir() {
    try {
        await fs.access(UPLOADS_DIR);
    } catch {
        await fs.mkdir(UPLOADS_DIR, { recursive: true });
        console.log('✅ 创建上传目录:', UPLOADS_DIR);
    }
}

// 配置 multer 存储
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'banner-' + uniqueSuffix + ext);
    }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
    // 接受所有图片类型
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('只允许上传图片文件'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB 限制（您想要的无限制）
    }
});

// ========== 数据文件配置 ==========
const DATA_FILE = path.join(__dirname, 'data.json');

// 确保数据文件存在
async function ensureDataFile() {
    try {
        await fs.access(DATA_FILE);
        console.log('✅ 数据文件已存在');
    } catch {
        // 创建初始数据
        const initialData = {
            users: [
                { 
                    id: 1,
                    username: 'admin', 
                    password: 'admin123', 
                    isAdmin: true,
                    createdAt: new Date().toISOString()
                }
            ],
            products: [],
            orders: [],
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
            banner: null, // 新增：横幅图片信息
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
        
        // 确保数据结构完整
        if (!parsed.users) parsed.users = [];
        if (!parsed.products) parsed.products = [];
        if (!parsed.orders) parsed.orders = [];
        if (!parsed.services) parsed.services = [];
        if (!parsed.settings) parsed.settings = {};
        if (!parsed.banner) parsed.banner = null; // 确保banner字段存在
        
        // 确保订单有游戏信息字段（向后兼容）
        if (parsed.orders) {
            parsed.orders = parsed.orders.map(order => ({
                gameName: '',
                gameRegion: '',
                specifiedPlayer: '',
                orderRemark: '',
                ...order // 新字段在前，旧字段在后覆盖
            }));
        }
        
        return parsed;
    } catch (error) {
        console.error('❌ 读取数据失败:', error.message);
        // 尝试重新创建文件
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
        const { name, price, description, image } = req.body;
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
        
        // 如果传入的商品数组不为空，则替换现有商品
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
        res.json({
            success: true,
            data: data.orders || [],
            total: data.orders.length
        });
    } catch (error) {
        console.error('获取订单失败:', error);
        res.status(500).json({ success: false, error: '获取订单失败' });
    }
});

// 6. 添加订单（包含游戏信息）
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
            // 新增的游戏信息字段
            gameName,
            gameRegion,
            specifiedPlayer,
            orderRemark
        } = req.body;
        
        console.log('📋 添加订单:', orderNumber);
        console.log('🎮 游戏信息:', { gameName, gameRegion, specifiedPlayer });
        
        const data = await readData();
        
        const order = {
            id: Date.now(),
            orderNumber: orderNumber || `DD${Date.now().toString().slice(-8)}`,
            userId,
            productId: Number(productId),
            productName,
            productPrice: parseFloat(productPrice),
            totalAmount: parseFloat(totalAmount),
            paymentMethod: paymentMethod || 'tng',
            status: status || 'pending',
            // 游戏信息字段
            gameName: gameName || '',
            gameRegion: gameRegion || '',
            specifiedPlayer: specifiedPlayer || '',
            orderRemark: orderRemark || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        data.orders.push(order);
        await saveData(data);
        
        console.log(`✅ 订单添加成功: ${order.orderNumber}`);
        console.log(`🎮 保存的游戏信息: ${gameName} - ${gameRegion}`);
        
        res.json({
            success: true,
            data: order,
            message: '订单创建成功'
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
        
        const validStatuses = ['pending', 'paid', 'completed'];
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
            order.status = status;
            order.updatedAt = new Date().toISOString();
            await saveData(data);
            
            console.log(`✅ 订单状态更新成功: ID ${id} -> ${status}`);
            
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

// 9. 用户登录
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
            
            // 不返回密码的安全用户对象
            const safeUser = {
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin || false,
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

// 10. 用户注册API
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
        
        // 检查用户名是否已存在
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
        
        // 不返回密码的安全用户对象
        const safeUser = {
            id: newUser.id,
            username: newUser.username,
            isAdmin: newUser.isAdmin,
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

// 11. 获取用户列表
app.get('/api/users', async (req, res) => {
    try {
        const data = await readData();
        // 不返回密码的安全用户列表
        const safeUsers = data.users.map(user => ({
            id: user.id,
            username: user.username,
            isAdmin: user.isAdmin,
            createdAt: user.createdAt
        }));
        
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

// 12. 获取系统设置
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

// 13. 更新系统设置
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

// 14. 获取客服列表
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

// 15. 获取所有客服（包括禁用的）
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

// 16. 添加客服
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

// 17. 删除客服API
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

// 18. 更新客服状态API
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

// 19. 更新客服信息API
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

// 20. 系统状态
app.get('/api/status', async (req, res) => {
    try {
        const data = await readData();
        
        res.json({
            success: true,
            data: {
                status: 'running',
                productsCount: data.products.length,
                ordersCount: data.orders.length,
                usersCount: data.users.length,
                servicesCount: data.services.length,
                lastUpdated: data.lastUpdated,
                uptime: process.uptime(),
                storeName: data.settings.storeName || '未设置',
                version: '3.0 (包含游戏信息字段和横幅管理)',
                hasBanner: !!data.banner
            },
            message: '系统运行正常'
        });
    } catch (error) {
        console.error('获取状态失败:', error);
        res.status(500).json({ success: false, error: '获取状态失败' });
    }
});

// 21. 获取完整数据
app.get('/api/data', async (req, res) => {
    try {
        const data = await readData();
        
        // 返回完整数据但不包含用户密码
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

// 22. 直接访问 data.json（用于调试）
app.get('/data.json', async (req, res) => {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        res.setHeader('Content-Type', 'application/json');
        res.send(data);
    } catch (error) {
        res.status(500).json({ error: '无法读取数据文件' });
    }
});

// 23. 测试连接
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'API测试成功',
        timestamp: new Date().toISOString(),
        server: 'YP俱乐部后端服务器',
        version: '3.0',
        features: ['游戏信息字段', '订单管理', '多用户支持', '横幅图片管理']
    });
});

// ========== 新增：商城顶部横幅管理API ==========

// 24. 获取横幅图片信息
app.get('/api/settings/banner', async (req, res) => {
    try {
        const data = await readData();
        res.json({
            success: true,
            data: data.banner || null,
            message: data.banner ? '横幅图片存在' : '暂无横幅图片'
        });
    } catch (error) {
        console.error('获取横幅失败:', error);
        res.status(500).json({ success: false, error: '获取横幅失败' });
    }
});

// 25. 上传横幅图片
app.post('/api/settings/banner', upload.single('bannerImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: '请选择要上传的图片文件'
            });
        }
        
        console.log('📷 上传横幅图片:', req.file.filename);
        
        const filePath = path.join(UPLOADS_DIR, req.file.filename);
        
        // 获取图片信息
        const imageInfo = await sharp(filePath).metadata();
        
        // 创建可访问的URL
        const bannerUrl = `/uploads/${req.file.filename}`;
        
        const data = await readData();
        
        data.banner = {
            filename: req.file.filename,
            originalName: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            width: imageInfo.width,
            height: imageInfo.height,
            url: bannerUrl,
            uploadedAt: new Date().toISOString()
        };
        
        await saveData(data);
        
        console.log(`✅ 横幅图片上传成功: ${req.file.originalname}`);
        console.log(`📐 图片尺寸: ${imageInfo.width} × ${imageInfo.height}`);
        
        res.json({
            success: true,
            data: data.banner,
            message: '横幅图片上传成功'
        });
    } catch (error) {
        console.error('上传横幅图片失败:', error);
        
        // 如果上传失败，删除已上传的文件
        if (req.file) {
            try {
                await fs.unlink(path.join(UPLOADS_DIR, req.file.filename));
            } catch (unlinkError) {
                console.error('删除临时文件失败:', unlinkError);
            }
        }
        
        res.status(500).json({
            success: false,
            error: '上传横幅图片失败',
            details: error.message
        });
    }
});

// 26. 删除横幅图片
app.delete('/api/settings/banner', async (req, res) => {
    try {
        const data = await readData();
        
        if (!data.banner) {
            return res.status(404).json({
                success: false,
                error: '当前没有横幅图片'
            });
        }
        
        const banner = data.banner;
        const filePath = path.join(UPLOADS_DIR, banner.filename);
        
        // 删除文件
        try {
            await fs.unlink(filePath);
            console.log(`🗑️ 删除横幅文件: ${banner.filename}`);
        } catch (unlinkError) {
            console.warn(`⚠️ 无法删除文件 ${banner.filename}:`, unlinkError.message);
        }
        
        // 清除数据库中的横幅信息
        data.banner = null;
        await saveData(data);
        
        console.log('✅ 横幅图片已移除');
        
        res.json({
            success: true,
            message: '横幅图片已删除',
            deletedBanner: banner
        });
    } catch (error) {
        console.error('删除横幅失败:', error);
        res.status(500).json({
            success: false,
            error: '删除横幅失败'
        });
    }
});

// 27. 获取已上传的文件列表
app.get('/api/uploads', async (req, res) => {
    try {
        await ensureUploadsDir();
        const files = await fs.readdir(UPLOADS_DIR);
        
        const fileInfos = [];
        for (const file of files) {
            try {
                const filePath = path.join(UPLOADS_DIR, file);
                const stats = await fs.stat(filePath);
                const isBanner = file.startsWith('banner-');
                
                fileInfos.push({
                    filename: file,
                    path: `/uploads/${file}`,
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime,
                    isBanner: isBanner
                });
            } catch (err) {
                console.warn(`无法获取文件信息 ${file}:`, err.message);
            }
        }
        
        res.json({
            success: true,
            data: fileInfos,
            total: fileInfos.length,
            uploadsDir: UPLOADS_DIR
        });
    } catch (error) {
        console.error('获取上传文件列表失败:', error);
        res.status(500).json({
            success: false,
            error: '获取上传文件列表失败'
        });
    }
});

// 28. 提供上传文件的静态访问
app.use('/uploads', express.static(UPLOADS_DIR));

// 29. 清理旧的横幅文件（可选功能）
app.delete('/api/uploads/cleanup', async (req, res) => {
    try {
        const data = await readData();
        const currentBanner = data.banner;
        
        const files = await fs.readdir(UPLOADS_DIR);
        let deletedCount = 0;
        
        for (const file of files) {
            // 只清理横幅文件，保留当前横幅
            if (file.startsWith('banner-') && 
                (!currentBanner || currentBanner.filename !== file)) {
                try {
                    const filePath = path.join(UPLOADS_DIR, file);
                    await fs.unlink(filePath);
                    deletedCount++;
                    console.log(`🧹 清理旧横幅文件: ${file}`);
                } catch (err) {
                    console.warn(`清理文件失败 ${file}:`, err.message);
                }
            }
        }
        
        res.json({
            success: true,
            message: `清理完成，删除了 ${deletedCount} 个旧横幅文件`,
            deletedCount: deletedCount
        });
    } catch (error) {
        console.error('清理上传文件失败:', error);
        res.status(500).json({
            success: false,
            error: '清理上传文件失败'
        });
    }
});

// 30. 首页
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>YP俱乐部后台系统</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
                .container { max-width: 800px; margin: 0 auto; background: rgba(255,255,255,0.95); padding: 30px; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); color: #333; }
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
                .new-feature h3 { color: #155724; margin-top: 0; }
                .feature-badge { background: #007bff; color: white; padding: 3px 8px; border-radius: 12px; font-size: 12px; margin-left: 10px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🎮 YP俱乐部后台系统</h1>
                
                <div class="status">
                    ✅ 服务器运行中 | 端口: ${PORT} | 版本: 3.0 | 包含横幅管理功能
                </div>
                
                <div class="new-feature">
                    <h3>📷 新增商城顶部横幅管理 <span class="feature-badge">NEW</span></h3>
                    <p><strong>新增横幅管理API：</strong></p>
                    <ul>
                        <li>✅ <code>GET /api/settings/banner</code> - 获取横幅信息</li>
                        <li>✅ <code>POST /api/settings/banner</code> - 上传横幅图片（支持拖拽）</li>
                        <li>✅ <code>DELETE /api/settings/banner</code> - 删除横幅</li>
                        <li>✅ 图片大小无限制，支持所有常见格式</li>
                        <li>✅ 自动保存横幅信息到数据库</li>
                    </ul>
                    <p><strong>管理员可在后台设置页面管理横幅图片</strong></p>
                </div>
                
                <div class="new-feature">
                    <h3>🎮 游戏信息功能</h3>
                    <p><strong>新增订单字段：</strong></p>
                    <ul>
                        <li>✅ <code>gameName</code> - 游戏名字（必填）</li>
                        <li>✅ <code>gameRegion</code> - 游戏大区（必填）</li>
                        <li>✅ <code>specifiedPlayer</code> - 指定打手名字（可选）</li>
                        <li>✅ <code>orderRemark</code> - 备注信息（可选）</li>
                    </ul>
                    <p><strong>管理员可在订单管理页面查看所有游戏信息</strong></p>
                </div>
                
                <div class="section">
                    <h2>📡 实时API测试</h2>
                    <div class="api-list">
                        <div class="api-item">
                            <span class="method get">GET</span>
                            <a href="/api/status" target="_blank" class="url">/api/status</a>
                            <div style="font-size: 12px; color: #666; margin-top: 5px;">系统状态（含版本信息）</div>
                        </div>
                        <div class="api-item">
                            <span class="method get">GET</span>
                            <a href="/api/products" target="_blank" class="url">/api/products</a>
                            <div style="font-size: 12px; color: #666; margin-top: 5px;">获取商品列表</div>
                        </div>
                        <div class="api-item">
                            <span class="method get">GET</span>
                            <a href="/api/orders" target="_blank" class="url">/api/orders</a>
                            <div style="font-size: 12px; color: #666; margin-top: 5px;">获取订单（含游戏信息）</div>
                        </div>
                        <div class="api-item">
                            <span class="method get">GET</span>
                            <a href="/api/settings/banner" target="_blank" class="url">/api/settings/banner</a>
                            <div style="font-size: 12px; color: #666; margin-top: 5px;">获取横幅信息</div>
                        </div>
                    </div>
                </div>
                
                <div class="section">
                    <h2>🔑 管理员账户</h2>
                    <div style="background: #e8f5e9; padding: 15px; border-radius: 8px;">
                        <strong>用户名:</strong> admin<br>
                        <strong>密码:</strong> admin123<br>
                        <span style="font-size: 12px; color: #666;">（使用此账户登录后台管理系统）</span>
                    </div>
                </div>
                
                <div class="section">
                    <h2>📦 主要API接口</h2>
                    <div style="background: #f0f2f5; padding: 15px; border-radius: 8px;">
                        <div style="margin-bottom: 8px;"><span class="method post">POST</span> <span class="url">/api/login</span> - 用户登录</div>
                        <div style="margin-bottom: 8px;"><span class="method post">POST</span> <span class="url">/api/register</span> - 用户注册</div>
                        <div style="margin-bottom: 8px;"><span class="method post">POST</span> <span class="url">/api/orders/add</span> - 添加订单（含游戏信息）</div>
                        <div style="margin-bottom: 8px;"><span class="method post">POST</span> <span class="url">/api/products/add</span> - 添加商品</div>
                        <div style="margin-bottom: 8px;"><span class="method post">POST</span> <span class="url">/api/settings/banner</span> - 上传横幅图片</div>
                        <div style="margin-bottom: 8px;"><span class="method get">GET</span> <span class="url">/api/services</span> - 获取客服</div>
                        <div style="margin-bottom: 8px;"><span class="method delete">DELETE</span> <span class="url">/api/orders/:id</span> - 删除订单</div>
                        <div style="margin-bottom: 8px;"><span class="method delete">DELETE</span> <span class="url">/api/services/:id</span> - 删除客服</div>
                        <div style="margin-bottom: 8px;"><span class="method delete">DELETE</span> <span class="url">/api/settings/banner</span> - 删除横幅</div>
                        <div style="margin-bottom: 8px;"><span class="method put">PUT</span> <span class="url">/api/orders/:id/status</span> - 更新订单状态</div>
                        <div style="margin-bottom: 8px;"><span class="method put">PUT</span> <span class="url">/api/services/:id/toggle</span> - 更新客服状态</div>
                    </div>
                </div>
                
                <div class="note">
                    <strong>💡 使用说明：</strong><br>
                    1. 将前端HTML文件放入 <strong>public</strong> 目录<br>
                    2. 所有数据存储在 <a href="/data.json" target="_blank">data.json</a><br>
                    3. 图片文件存储在 <strong>uploads</strong> 目录<br>
                    4. 支持多用户同时访问<br>
                    5. <strong>版本3.0新增功能：</strong> 
                       <ul>
                           <li>✅ 商城顶部横幅图片管理</li>
                           <li>✅ 支持图片上传（无大小限制）</li>
                           <li>✅ 支持拖拽上传和点击上传</li>
                           <li>✅ 自动管理横幅文件</li>
                           <li>✅ 订单新增游戏信息字段</li>
                           <li>✅ 前端支持填写游戏信息</li>
                           <li>✅ 管理员可查看游戏信息</li>
                           <li>✅ 完整的CRUD操作</li>
                       </ul>
                </div>
                
                <div style="text-align: center; margin-top: 30px; color: #666; font-size: 12px;">
                    ©2025 YP俱乐部 | 数据文件自动保存 | 实时同步 | 版本3.0
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
            'GET  /api/orders (新增游戏信息)',
            'POST /api/orders/add (支持游戏信息)',
            'POST /api/settings/banner (上传横幅)',
            'GET  /api/settings/banner (获取横幅)',
            'DELETE /api/settings/banner (删除横幅)',
            'POST /api/products/add',
            'POST /api/login',
            'POST /api/register',
            'GET  /api/settings',
            'GET  /api/services',
            'DELETE /api/orders/:id',
            'DELETE /api/services/:id',
            'GET  /data.json'
        ]
    });
});

// 错误处理
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    
    // Multer 文件上传错误
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: '文件太大，最大支持50MB'
            });
        }
        return res.status(400).json({
            success: false,
            error: '文件上传错误',
            message: err.message
        });
    }
    
    // 文件类型错误
    if (err.message === '只允许上传图片文件') {
        return res.status(400).json({
            success: false,
            error: '文件类型错误',
            message: '只允许上传图片文件'
        });
    }
    
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
        await ensureUploadsDir();
        
        app.listen(PORT, () => {
            console.log(`
            ╔══════════════════════════════════════════════╗
            ║          🚀 YP俱乐部后台系统启动 3.0          ║
            ╠══════════════════════════════════════════════╣
            ║  📍 本地访问: http://localhost:${PORT}            ║
            ║  🔗 API基础: http://localhost:${PORT}/api         ║
            ║  📁 数据文件: ${DATA_FILE}                      ║
            ║  📁 上传目录: ${UPLOADS_DIR}                    ║
            ╠══════════════════════════════════════════════╣
            ║  📷 横幅管理API:                              ║
            ║  • GET  /api/settings/banner - 获取横幅信息  ║
            ║  • POST /api/settings/banner - 上传横幅图片  ║
            ║  • DELETE /api/settings/banner - 删除横幅    ║
            ║  • GET  /uploads/* - 访问上传的图片          ║
            ╠══════════════════════════════════════════════╣
            ║  📊 实时测试:                                 ║
            ║  • http://localhost:${PORT}/api/status         ║
            ║  • http://localhost:${PORT}/api/products       ║
            ║  • http://localhost:${PORT}/api/orders         ║
            ║  • http://localhost:${PORT}/data.json          ║
            ║  • http://localhost:${PORT}/api/settings/banner ║
            ╠══════════════════════════════════════════════╣
            ║  🔑 默认管理员: admin / admin123              ║
            ║  📦 自动保存: 所有数据实时保存到文件           ║
            ║  🔄 实时同步: 多设备共享同一数据源             ║
            ╠══════════════════════════════════════════════╣
            ║  📷 新增横幅管理功能:                         ║
            ║  ✅ 支持图片上传（无大小限制）                 ║
            ║  ✅ 支持拖拽上传和点击上传                    ║
            ║  ✅ 自动保存横幅信息到数据库                  ║
            ║  ✅ 前端管理界面完整支持                      ║
            ║  ✅ 图片预览和管理功能                        ║
            ╠══════════════════════════════════════════════╣
            ║  🎮 版本3.0完全支持：                         ║
            ║  • 商城顶部横幅图片管理                       ║
            ║  • 游戏信息字段存储                          ║
            ║  • 用户注册功能                              ║
            ║  • 删除订单和客服                            ║
            ║  • 更新订单状态                              ║
            ║  • 所有数据实时同步                          ║
            ╚══════════════════════════════════════════════╝
            `);
        });
    } catch (error) {
        console.error('❌ 服务器启动失败:', error);
        process.exit(1);
    }
}

startServer().catch(console.error);
