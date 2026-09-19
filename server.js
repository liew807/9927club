// server.js - 完整修复版 v3.1
// 修复：客服删除接口、链接校验、商品分类兼容、新增轮播图/宫格按钮后端存储
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
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
                    username: 'admin', 
                    password: 'admin123', 
                    isAdmin: true,
                    createdAt: new Date().toISOString()
                },
                { 
                    id: 2,
                    username: 'xiaoyi', 
                    password: 'xiaoyi123', 
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
            carousels: [],       // 轮播图数据
            gridButtons: {       // 宫格按钮数据
                left: { img: '', link: '', label: '热门推荐' },
                right: { img: '', link: '', label: '限时优惠' }
            },
            settings: {
                storeName: 'XIAOYI卖涂装和外挂服务',
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

// 读取数据（向后兼容处理）
async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const parsed = JSON.parse(data);
        
        // 确保数据结构完整
        if (!parsed.users) parsed.users = [];
        if (!parsed.products) parsed.products = [];
        if (!parsed.orders) parsed.orders = [];
        if (!parsed.services) parsed.services = [];
        if (!parsed.carousels) parsed.carousels = [];
        if (!parsed.gridButtons) parsed.gridButtons = { left: {}, right: {} };
        if (!parsed.settings) parsed.settings = {};
        
        // 订单：补全游戏信息字段
        if (parsed.orders) {
            parsed.orders = parsed.orders.map(order => ({
                gameName: '',
                gameRegion: '',
                specifiedPlayer: '',
                orderRemark: '',
                ...order
            }));
        }
        
        // 商品：只在没有 category 时补默认值，不覆盖已有分类
        if (parsed.products) {
            parsed.products = parsed.products.map(product => {
                if (!product.category) {
                    return { ...product, category: '热门' };
                }
                return product;
            });
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
        console.log('📦 添加商品:', { name, price, category });
        
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
        
        console.log(`✅ 商品添加成功: ${product.name} (分类: ${product.category})`);
        
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
            data.products = products.map(product => {
                if (!product.category) {
                    return { ...product, category: '热门' };
                }
                return product;
            });
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

// 6. 添加订单
app.post('/api/orders/add', async (req, res) => {
    try {
        const { 
            orderNumber, userId, productId, productName, productPrice, 
            totalAmount, paymentMethod, status,
            gameName, gameRegion, specifiedPlayer, orderRemark
        } = req.body;
        
        console.log('📋 添加订单:', orderNumber);
        
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

// 7. 删除订单
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
            res.json({ success: true, message: '订单删除成功', deletedId: orderId });
        } else {
            res.status(404).json({ success: false, error: '订单不存在' });
        }
    } catch (error) {
        console.error('删除订单失败:', error);
        res.status(500).json({ success: false, error: '删除订单失败' });
    }
});

// 8. 更新订单状态
app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        console.log(`🔄 更新订单状态: ID ${id}, 状态: ${status}`);
        
        if (!status) {
            return res.status(400).json({ success: false, error: '状态是必填项' });
        }
        
        const validStatuses = ['pending', 'paid', 'completed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, error: '无效的状态值' });
        }
        
        const data = await readData();
        const orderId = Number(id);
        const order = data.orders.find(o => o.id === orderId);
        
        if (order) {
            order.status = status;
            order.updatedAt = new Date().toISOString();
            await saveData(data);
            res.json({ success: true, data: order, message: '订单状态更新成功' });
        } else {
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
        const user = data.users.find(u => u.username === username && u.password === password);
        
        if (user) {
            const safeUser = {
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin || false,
                createdAt: user.createdAt
            };
            res.json({ success: true, data: safeUser, message: '登录成功' });
        } else {
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

// 10. 用户注册
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log('👤 注册用户:', username);
        
        if (!username || !password) {
            return res.status(400).json({ success: false, error: '用户名和密码是必填项' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ success: false, error: '密码长度至少6位' });
        }
        
        const data = await readData();
        
        if (data.users.some(u => u.username === username)) {
            return res.status(400).json({ success: false, error: '用户名已存在' });
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
        
        const safeUser = {
            id: newUser.id,
            username: newUser.username,
            isAdmin: newUser.isAdmin,
            createdAt: newUser.createdAt
        };
        
        res.json({ success: true, data: safeUser, message: '注册成功' });
    } catch (error) {
        console.error('注册失败:', error);
        res.status(500).json({ success: false, error: '注册失败' });
    }
});

// 11. 获取用户列表
app.get('/api/users', async (req, res) => {
    try {
        const data = await readData();
        const safeUsers = data.users.map(user => ({
            id: user.id,
            username: user.username,
            isAdmin: user.isAdmin,
            createdAt: user.createdAt
        }));
        res.json({ success: true, data: safeUsers, total: safeUsers.length });
    } catch (error) {
        console.error('获取用户失败:', error);
        res.status(500).json({ success: false, error: '获取用户失败' });
    }
});

// 12. 获取系统设置
app.get('/api/settings', async (req, res) => {
    try {
        const data = await readData();
        res.json({ success: true, data: data.settings || {} });
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
        res.json({ success: true, data: data.settings, message: '设置更新成功' });
    } catch (error) {
        console.error('更新设置失败:', error);
        res.status(500).json({ success: false, error: '更新设置失败' });
    }
});

// 14. 获取客服列表（仅启用的）
app.get('/api/services', async (req, res) => {
    try {
        const data = await readData();
        const enabledServices = data.services.filter(service => service.enabled !== false);
        res.json({ success: true, data: enabledServices, total: enabledServices.length });
    } catch (error) {
        console.error('获取客服失败:', error);
        res.status(500).json({ success: false, error: '获取客服失败' });
    }
});

// 15. 获取所有客服
app.get('/api/services/all', async (req, res) => {
    try {
        const data = await readData();
        res.json({ success: true, data: data.services || [], total: data.services.length });
    } catch (error) {
        console.error('获取所有客服失败:', error);
        res.status(500).json({ success: false, error: '获取客服失败' });
    }
});

// 16. 添加客服（放宽链接校验）
app.post('/api/services/add', async (req, res) => {
    try {
        const { type, name, link, enabled } = req.body;
        console.log('💁 添加客服:', { type, name });
        
        if (!type || !name || !link) {
            return res.status(400).json({ success: false, error: '客服类型、名称和链接是必填项' });
        }
        
        // 放宽校验：不再强制 http/https 开头，只要求非空
        // 微信、QQ等可能不是标准链接
        
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
        
        res.json({ success: true, data: service, message: '客服添加成功' });
    } catch (error) {
        console.error('添加客服失败:', error);
        res.status(500).json({ success: false, error: '添加客服失败' });
    }
});

// 17. 删除客服（POST 方式，兼容前端现有调用）
app.post('/api/services/delete', async (req, res) => {
    try {
        const { id } = req.body;
        console.log('🗑️ 删除客服(POST):', id);
        
        if (!id) {
            return res.status(400).json({ success: false, error: '客服ID是必填项' });
        }
        
        const data = await readData();
        const serviceId = Number(id);
        const initialLength = data.services.length;
        
        data.services = data.services.filter(s => s.id !== serviceId);
        
        if (data.services.length < initialLength) {
            await saveData(data);
            res.json({ success: true, message: '客服删除成功', deletedId: serviceId });
        } else {
            res.status(404).json({ success: false, error: '客服不存在' });
        }
    } catch (error) {
        console.error('删除客服失败:', error);
        res.status(500).json({ success: false, error: '删除客服失败' });
    }
});

// 18. 删除客服（DELETE 方式，保留兼容）
app.delete('/api/services/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('🗑️ 删除客服(DELETE):', id);
        
        const data = await readData();
        const serviceId = Number(id);
        const initialLength = data.services.length;
        
        data.services = data.services.filter(s => s.id !== serviceId);
        
        if (data.services.length < initialLength) {
            await saveData(data);
            res.json({ success: true, message: '客服删除成功', deletedId: serviceId });
        } else {
            res.status(404).json({ success: false, error: '客服不存在' });
        }
    } catch (error) {
        console.error('删除客服失败:', error);
        res.status(500).json({ success: false, error: '删除客服失败' });
    }
});

// 19. 更新客服状态（PUT 方式）
app.put('/api/services/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;
        const { enabled } = req.body;
        console.log(`🔄 更新客服状态: ID ${id}, 启用: ${enabled}`);
        
        if (enabled === undefined) {
            return res.status(400).json({ success: false, error: '启用状态是必填项' });
        }
        
        const data = await readData();
        const serviceId = Number(id);
        const service = data.services.find(s => s.id === serviceId);
        
        if (service) {
            service.enabled = enabled;
            service.updatedAt = new Date().toISOString();
            await saveData(data);
            res.json({ success: true, data: service, message: `客服已${enabled ? '启用' : '禁用'}` });
        } else {
            res.status(404).json({ success: false, error: '客服不存在' });
        }
    } catch (error) {
        console.error('更新客服状态失败:', error);
        res.status(500).json({ success: false, error: '更新客服状态失败' });
    }
});

// 20. 更新客服信息（POST 方式，兼容前端现有调用，放宽链接校验）
app.post('/api/services/update', async (req, res) => {
    try {
        const { id, name, link, enabled } = req.body;
        console.log('✏️ 更新客服信息(POST):', { id, name });
        
        if (!id) {
            return res.status(400).json({ success: false, error: '客服ID是必填项' });
        }
        
        const data = await readData();
        const serviceId = Number(id);
        const service = data.services.find(s => s.id === serviceId);
        
        if (service) {
            if (name !== undefined) service.name = name;
            if (link !== undefined) {
                // 放宽校验：只要求非空
                service.link = link;
            }
            if (enabled !== undefined) service.enabled = enabled;
            
            service.updatedAt = new Date().toISOString();
            await saveData(data);
            
            res.json({ success: true, data: service, message: '客服信息已更新' });
        } else {
            res.status(404).json({ success: false, error: '客服不存在' });
        }
    } catch (error) {
        console.error('更新客服信息失败:', error);
        res.status(500).json({ success: false, error: '更新客服信息失败' });
    }
});

// ========== 新增：轮播图接口 ==========
// 21. 获取轮播图
app.get('/api/carousels', async (req, res) => {
    try {
        const data = await readData();
        res.json({ success: true, data: data.carousels || [] });
    } catch (error) {
        console.error('获取轮播图失败:', error);
        res.status(500).json({ success: false, error: '获取轮播图失败' });
    }
});

// 22. 更新轮播图（整体替换）
app.post('/api/carousels/update', async (req, res) => {
    try {
        const { carousels } = req.body;
        console.log('🖼️ 更新轮播图:', carousels?.length || 0);
        
        if (!Array.isArray(carousels)) {
            return res.status(400).json({ success: false, error: '轮播图数据格式不正确' });
        }
        
        const data = await readData();
        data.carousels = carousels.slice(0, 5); // 最多5张
        await saveData(data);
        
        res.json({ success: true, data: data.carousels, message: '轮播图更新成功' });
    } catch (error) {
        console.error('更新轮播图失败:', error);
        res.status(500).json({ success: false, error: '更新轮播图失败' });
    }
});

// ========== 新增：宫格按钮接口 ==========
// 23. 获取宫格按钮
app.get('/api/grid-buttons', async (req, res) => {
    try {
        const data = await readData();
        res.json({ success: true, data: data.gridButtons || { left: {}, right: {} } });
    } catch (error) {
        console.error('获取宫格按钮失败:', error);
        res.status(500).json({ success: false, error: '获取宫格按钮失败' });
    }
});

// 24. 更新宫格按钮
app.post('/api/grid-buttons/update', async (req, res) => {
    try {
        const { left, right } = req.body;
        console.log('🔲 更新宫格按钮');
        
        const data = await readData();
        data.gridButtons = {
            left: left || { img: '', link: '', label: '热门推荐' },
            right: right || { img: '', link: '', label: '限时优惠' }
        };
        await saveData(data);
        
        res.json({ success: true, data: data.gridButtons, message: '宫格按钮更新成功' });
    } catch (error) {
        console.error('更新宫格按钮失败:', error);
        res.status(500).json({ success: false, error: '更新宫格按钮失败' });
    }
});

// 25. 系统状态
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
                carouselsCount: (data.carousels || []).length,
                lastUpdated: data.lastUpdated,
                uptime: process.uptime(),
                storeName: data.settings.storeName || '未设置',
                version: '3.1 (修复客服删除接口 + 轮播图/宫格后端存储)'
            },
            message: '系统运行正常'
        });
    } catch (error) {
        console.error('获取状态失败:', error);
        res.status(500).json({ success: false, error: '获取状态失败' });
    }
});

// 26. 获取完整数据
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
        res.json({ success: true, data: safeData });
    } catch (error) {
        console.error('获取完整数据失败:', error);
        res.status(500).json({ success: false, error: '获取数据失败' });
    }
});

// 27. 直接访问 data.json
app.get('/data.json', async (req, res) => {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        res.setHeader('Content-Type', 'application/json');
        res.send(data);
    } catch (error) {
        res.status(500).json({ error: '无法读取数据文件' });
    }
});

// 28. 测试连接
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'API测试成功',
        timestamp: new Date().toISOString(),
        server: 'XIAOYI卖涂装和外挂服务后端',
        version: '3.1',
        features: [
            '商品分类',
            '游戏信息字段',
            '订单管理',
            '多用户支持',
            '客服管理（含POST删除）',
            '轮播图后端存储',
            '宫格按钮后端存储'
        ]
    });
});

// 首页
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>XIAOYI卖涂装和外挂服务 后台系统</title>
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
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🎮 XIAOYI卖涂装和外挂服务 后台</h1>
                
                <div class="status">
                    ✅ 服务器运行中 | 端口: ${PORT} | 版本: 3.1
                </div>
                
                <div class="new-feature">
                    <h3>🎯 版本3.1 更新内容</h3>
                    <ul>
                        <li>✅ 新增 <code>POST /api/services/delete</code>（修复前端删除客服失败）</li>
                        <li>✅ 新增 <code>GET/POST /api/carousels</code>（轮播图后端存储）</li>
                        <li>✅ 新增 <code>GET/POST /api/grid-buttons</code>（宫格按钮后端存储）</li>
                        <li>✅ 放宽客服链接校验（支持微信号等非http链接）</li>
                        <li>✅ 优化商品分类向后兼容逻辑</li>
                    </ul>
                </div>
                
                <div class="section">
                    <h2>📡 实时API测试</h2>
                    <div class="api-list">
                        <div class="api-item">
                            <span class="method get">GET</span>
                            <a href="/api/status" target="_blank" class="url">/api/status</a>
                        </div>
                        <div class="api-item">
                            <span class="method get">GET</span>
                            <a href="/api/products" target="_blank" class="url">/api/products</a>
                        </div>
                        <div class="api-item">
                            <span class="method get">GET</span>
                            <a href="/api/orders" target="_blank" class="url">/api/orders</a>
                        </div>
                        <div class="api-item">
                            <span class="method get">GET</span>
                            <a href="/api/services/all" target="_blank" class="url">/api/services/all</a>
                        </div>
                        <div class="api-item">
                            <span class="method get">GET</span>
                            <a href="/api/carousels" target="_blank" class="url">/api/carousels</a>
                        </div>
                        <div class="api-item">
                            <span class="method get">GET</span>
                            <a href="/data.json" target="_blank" class="url">/data.json</a>
                        </div>
                    </div>
                </div>
                
                <div class="section">
                    <h2>🔑 管理员账户</h2>
                    <div style="background: #e8f5e9; padding: 15px; border-radius: 8px;">
                        <strong>用户名:</strong> admin &nbsp;|&nbsp; <strong>密码:</strong> admin123<br>
                        <strong>用户名:</strong> xiaoyi &nbsp;|&nbsp; <strong>密码:</strong> xiaoyi123
                    </div>
                </div>
                
                <div class="note">
                    <strong>💡 使用说明：</strong><br>
                    1. 将前端HTML文件放入 <strong>public</strong> 目录<br>
                    2. 所有数据存储在 <a href="/data.json" target="_blank">data.json</a><br>
                    3. 手机添加商品后，电脑可通过API实时获取<br>
                    4. <strong>版本3.1 已修复：</strong>客服删除、轮播图/宫格后端存储
                </div>
                
                <div style="text-align: center; margin-top: 30px; color: #666; font-size: 12px;">
                    ©2026 XIAOYI卖涂装和外挂服务 | 版本 3.1
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
            'POST /api/orders/add',
            'POST /api/products/add',
            'POST /api/login',
            'POST /api/register',
            'GET  /api/settings',
            'POST /api/settings/update',
            'GET  /api/services',
            'GET  /api/services/all',
            'POST /api/services/add',
            'POST /api/services/delete',
            'POST /api/services/update',
            'DELETE /api/services/:id',
            'PUT  /api/services/:id/toggle',
            'GET  /api/carousels',
            'POST /api/carousels/update',
            'GET  /api/grid-buttons',
            'POST /api/grid-buttons/update',
            'DELETE /api/orders/:id',
            'PUT  /api/orders/:id/status',
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
            ╔══════════════════════════════════════════════╗
            ║     🚀 XIAOYI卖涂装和外挂服务 后端 3.1       ║
            ╠══════════════════════════════════════════════╣
            ║  📍 本地访问: http://localhost:${PORT}            ║
            ║  🔗 API基础: http://localhost:${PORT}/api         ║
            ║  📁 数据文件: ${DATA_FILE}                      ║
            ╠══════════════════════════════════════════════╣
            ║  🎯 版本3.1 新增:                             ║
            ║  ✅ POST /api/services/delete (修复删除客服)   ║
            ║  ✅ GET/POST /api/carousels (轮播图后端)       ║
            ║  ✅ GET/POST /api/grid-buttons (宫格后端)     ║
            ║  ✅ 放宽客服链接校验                          ║
            ╠══════════════════════════════════════════════╣
            ║  🔑 默认管理员: admin / admin123              ║
            ║  🔑 管理员: xiaoyi / xiaoyi123                ║
            ║  📦 自动保存: 所有数据实时保存到文件           ║
            ╚══════════════════════════════════════════════╝
            `);
        });
    } catch (error) {
        console.error('❌ 服务器启动失败:', error);
        process.exit(1);
    }
}

startServer().catch(console.error);
