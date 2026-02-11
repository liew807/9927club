// server.js - 完全修复版（横幅上传不限制任何格式）
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== 关键修复：大幅增加请求限制 ==========
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ 
    limit: '200mb',  // 增加到200mb
    parameterLimit: 1000000
}));

app.use(express.urlencoded({ 
    extended: true, 
    limit: '200mb',  // 增加到200mb
    parameterLimit: 1000000 
}));

app.use(express.static('public'));

// ========== 数据文件配置 ==========
const DATA_FILE = path.join(__dirname, 'data.json');

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
            banner: null,
            lastUpdated: new Date().toISOString()
        };
        
        await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
        console.log('✅ 创建初始数据文件 data.json');
    }
}

async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const parsed = JSON.parse(data);
        
        if (!parsed.users) parsed.users = [];
        if (!parsed.products) parsed.products = [];
        if (!parsed.orders) parsed.orders = [];
        if (!parsed.services) parsed.services = [];
        if (!parsed.settings) parsed.settings = {};
        if (!parsed.banner) parsed.banner = null;
        
        if (parsed.orders) {
            parsed.orders = parsed.orders.map(order => ({
                gameName: '',
                gameRegion: '',
                specifiedPlayer: '',
                orderRemark: '',
                ...order
            }));
        }
        
        return parsed;
    } catch (error) {
        console.error('❌ 读取数据失败:', error.message);
        await ensureDataFile();
        return await readData();
    }
}

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

// ========== 横幅管理API - 完全不限制任何格式 ==========
app.post('/api/settings/banner', async (req, res) => {
    try {
        console.log('='.repeat(50));
        console.log('📷 接收横幅上传请求');
        console.log('请求方法:', req.method);
        console.log('Content-Type:', req.headers['content-type']);
        
        // 获取原始请求数据
        let bannerData = req.body;
        let rawData = '';
        
        // 如果req.body是空的，尝试手动解析原始数据
        if (!bannerData || Object.keys(bannerData).length === 0) {
            console.log('⚠️ req.body为空，尝试解析原始数据');
            
            req.on('data', chunk => {
                rawData += chunk;
            });
            
            await new Promise(resolve => req.on('end', resolve));
            
            if (rawData) {
                try {
                    bannerData = JSON.parse(rawData);
                    console.log('✅ 成功解析原始JSON数据');
                } catch (e) {
                    // 如果不是JSON，就当作字符串保存
                    console.log('📝 原始数据不是JSON，作为字符串处理');
                    bannerData = { rawString: rawData };
                }
            }
        }
        
        console.log('✅ 收到横幅数据，准备保存');
        
        const data = await readData();
        
        // ========== 完全开放：接收任何格式，直接保存 ==========
        // 不管传来什么数据，都原样保存到banner字段
        
        // 情况1：直接是字符串
        if (typeof bannerData === 'string') {
            console.log('📷 保存字符串格式横幅');
            data.banner = {
                type: 'string',
                value: bannerData,
                savedAt: new Date().toISOString()
            };
        }
        // 情况2：直接是数组
        else if (Array.isArray(bannerData)) {
            console.log('📷 保存数组格式横幅');
            data.banner = {
                type: 'array',
                value: bannerData,
                savedAt: new Date().toISOString()
            };
        }
        // 情况3：是对象，但不确定结构
        else if (typeof bannerData === 'object' && bannerData !== null) {
            console.log('📷 保存对象格式横幅');
            console.log('对象keys:', Object.keys(bannerData));
            
            // 直接保存整个对象
            data.banner = {
                type: 'object',
                value: bannerData,
                savedAt: new Date().toISOString()
            };
            
            // 同时也保留原始字段以便前端直接使用
            if (bannerData.dataUrl || bannerData.url || bannerData.image) {
                data.banner.original = bannerData;
            }
        }
        // 情况4：其他任何格式
        else {
            console.log('📷 保存其他格式横幅');
            data.banner = {
                type: typeof bannerData,
                value: bannerData,
                savedAt: new Date().toISOString()
            };
        }
        
        // 添加启用状态和上传时间
        if (data.banner) {
            data.banner.enabled = true;
            data.banner.uploadedAt = new Date().toISOString();
        }
        
        await saveData(data);
        
        console.log('✅ 横幅保存成功！');
        console.log('保存的横幅类型:', data.banner.type);
        
        res.json({
            success: true,
            data: data.banner,
            message: '横幅上传成功',
            debug: {
                receivedType: typeof bannerData,
                savedType: data.banner.type
            }
        });
        
    } catch (error) {
        console.error('❌ 上传横幅失败:', error);
        res.status(500).json({
            success: false,
            error: '上传横幅失败',
            message: error.message,
            stack: error.stack
        });
    }
});

// 获取横幅 - 兼容旧格式
app.get('/api/settings/banner', async (req, res) => {
    try {
        const data = await readData();
        
        // 如果横幅存在，确保返回格式兼容前端
        let bannerData = data.banner;
        
        if (bannerData) {
            // 兼容旧版前端：如果有value字段且是对象，尝试提取常用字段
            if (bannerData.type === 'object' && bannerData.value) {
                const val = bannerData.value;
                if (val.dataUrl || val.url || val.image) {
                    bannerData = {
                        ...bannerData,
                        dataUrl: val.dataUrl,
                        url: val.url,
                        image: val.image
                    };
                }
            }
        }
        
        res.json({
            success: true,
            data: bannerData || null
        });
    } catch (error) {
        console.error('获取横幅失败:', error);
        res.status(500).json({ success: false, error: '获取横幅失败' });
    }
});

// 删除横幅
app.delete('/api/settings/banner', async (req, res) => {
    try {
        const data = await readData();
        data.banner = null;
        await saveData(data);
        res.json({ success: true, message: '横幅已删除' });
    } catch (error) {
        res.status(500).json({ success: false, error: '删除横幅失败' });
    }
});

// 切换横幅状态
app.put('/api/settings/banner/toggle', async (req, res) => {
    try {
        const { enabled } = req.body;
        const data = await readData();
        if (data.banner) {
            data.banner.enabled = enabled;
            data.banner.updatedAt = new Date().toISOString();
            await saveData(data);
            res.json({ success: true, data: data.banner });
        } else {
            res.status(404).json({ success: false, error: '没有横幅' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '切换状态失败' });
    }
});

// 更新横幅信息
app.post('/api/settings/banner/update', async (req, res) => {
    try {
        const updates = req.body;
        const data = await readData();
        
        if (!data.banner) {
            return res.status(404).json({ success: false, error: '没有横幅可更新' });
        }
        
        // 合并更新
        if (data.banner.type === 'object' && data.banner.value) {
            data.banner.value = { ...data.banner.value, ...updates };
        } else {
            data.banner = { ...data.banner, ...updates };
        }
        
        data.banner.updatedAt = new Date().toISOString();
        await saveData(data);
        
        res.json({ success: true, data: data.banner, message: '横幅已更新' });
    } catch (error) {
        res.status(500).json({ success: false, error: '更新横幅失败' });
    }
});

// ========== 商品管理API ==========
app.get('/api/products', async (req, res) => {
    try {
        const data = await readData();
        res.json({ success: true, data: data.products || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取商品失败' });
    }
});

app.post('/api/products/add', async (req, res) => {
    try {
        const { name, price, description, image } = req.body;
        if (!name || !price) {
            return res.status(400).json({ success: false, error: '商品名称和价格是必填项' });
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
        res.json({ success: true, data: product, message: '商品添加成功' });
    } catch (error) {
        res.status(500).json({ success: false, error: '添加商品失败' });
    }
});

app.post('/api/products/delete', async (req, res) => {
    try {
        const { id } = req.body;
        const data = await readData();
        const productId = Number(id);
        const initialLength = data.products.length;
        
        data.products = data.products.filter(p => p.id !== productId);
        
        if (data.products.length < initialLength) {
            await saveData(data);
            res.json({ success: true, message: '商品删除成功' });
        } else {
            res.status(404).json({ success: false, error: '商品不存在' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '删除商品失败' });
    }
});

app.post('/api/products/sync', async (req, res) => {
    try {
        const { products } = req.body;
        const data = await readData();
        if (products && Array.isArray(products)) {
            data.products = products;
            await saveData(data);
        }
        res.json({ success: true, data: data.products, message: '同步成功' });
    } catch (error) {
        res.status(500).json({ success: false, error: '同步商品失败' });
    }
});

// ========== 订单管理API（含游戏信息）==========
app.get('/api/orders', async (req, res) => {
    try {
        const data = await readData();
        res.json({ success: true, data: data.orders || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取订单失败' });
    }
});

app.post('/api/orders/add', async (req, res) => {
    try {
        const { 
            orderNumber, userId, productId, productName, productPrice, 
            totalAmount, paymentMethod, status,
            gameName, gameRegion, specifiedPlayer, orderRemark 
        } = req.body;
        
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
        res.json({ success: true, data: order, message: '订单创建成功' });
    } catch (error) {
        res.status(500).json({ success: false, error: '添加订单失败' });
    }
});

app.delete('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = await readData();
        const orderId = Number(id);
        const initialLength = data.orders.length;
        
        data.orders = data.orders.filter(o => o.id !== orderId);
        
        if (data.orders.length < initialLength) {
            await saveData(data);
            res.json({ success: true, message: '订单删除成功' });
        } else {
            res.status(404).json({ success: false, error: '订单不存在' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '删除订单失败' });
    }
});

app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
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
        res.status(500).json({ success: false, error: '更新订单状态失败' });
    }
});

// ========== 用户管理API ==========
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
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
            res.status(401).json({ success: false, error: '用户名或密码错误' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '登录失败' });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
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
        res.status(500).json({ success: false, error: '注册失败' });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const data = await readData();
        const safeUsers = data.users.map(user => ({
            id: user.id,
            username: user.username,
            isAdmin: user.isAdmin,
            createdAt: user.createdAt
        }));
        res.json({ success: true, data: safeUsers });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取用户失败' });
    }
});

// ========== 系统设置API ==========
app.get('/api/settings', async (req, res) => {
    try {
        const data = await readData();
        res.json({ success: true, data: data.settings || {} });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取设置失败' });
    }
});

app.post('/api/settings/update', async (req, res) => {
    try {
        const settings = req.body;
        const data = await readData();
        
        data.settings = {
            ...data.settings,
            ...settings,
            updatedAt: new Date().toISOString()
        };
        
        await saveData(data);
        res.json({ success: true, data: data.settings, message: '设置更新成功' });
    } catch (error) {
        res.status(500).json({ success: false, error: '更新设置失败' });
    }
});

// ========== 客服管理API ==========
app.get('/api/services', async (req, res) => {
    try {
        const data = await readData();
        const enabledServices = data.services.filter(s => s.enabled !== false);
        res.json({ success: true, data: enabledServices });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取客服失败' });
    }
});

app.get('/api/services/all', async (req, res) => {
    try {
        const data = await readData();
        res.json({ success: true, data: data.services || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取客服失败' });
    }
});

app.post('/api/services/add', async (req, res) => {
    try {
        const { type, name, link, enabled } = req.body;
        
        if (!type || !name || !link) {
            return res.status(400).json({ success: false, error: '客服类型、名称和链接是必填项' });
        }
        if (!link.startsWith('http://') && !link.startsWith('https://')) {
            return res.status(400).json({ success: false, error: '链接格式不正确' });
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
        res.json({ success: true, data: service, message: '客服添加成功' });
    } catch (error) {
        res.status(500).json({ success: false, error: '添加客服失败' });
    }
});

app.delete('/api/services/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = await readData();
        const serviceId = Number(id);
        const initialLength = data.services.length;
        
        data.services = data.services.filter(s => s.id !== serviceId);
        
        if (data.services.length < initialLength) {
            await saveData(data);
            res.json({ success: true, message: '客服删除成功' });
        } else {
            res.status(404).json({ success: false, error: '客服不存在' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '删除客服失败' });
    }
});

app.put('/api/services/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;
        const { enabled } = req.body;
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
        res.status(500).json({ success: false, error: '更新客服状态失败' });
    }
});

app.post('/api/services/update', async (req, res) => {
    try {
        const { id, name, link, enabled } = req.body;
        const data = await readData();
        const serviceId = Number(id);
        const service = data.services.find(s => s.id === serviceId);
        
        if (service) {
            if (name) service.name = name;
            if (link) {
                if (!link.startsWith('http://') && !link.startsWith('https://')) {
                    return res.status(400).json({ success: false, error: '链接格式不正确' });
                }
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
        res.status(500).json({ success: false, error: '更新客服信息失败' });
    }
});

// ========== 系统状态和数据API ==========
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
                version: '2.2.2',
                hasBanner: !!data.banner
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取状态失败' });
    }
});

app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'API测试成功',
        timestamp: new Date().toISOString(),
        server: 'YP俱乐部后端服务器',
        version: '2.2.2',
        features: ['横幅上传完全不限制格式', '任何数据都能保存']
    });
});

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
        res.status(500).json({ success: false, error: '获取数据失败' });
    }
});

app.get('/api/system-config', async (req, res) => {
    try {
        const data = await readData();
        const config = {
            settings: data.settings,
            banner: data.banner,
            services: data.services.filter(s => s.enabled !== false),
            stats: {
                products: data.products.length,
                orders: data.orders.length,
                users: data.users.length,
                services: data.services.length
            },
            version: '2.2.2',
            lastUpdated: data.lastUpdated
        };
        res.json({ success: true, data: config });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取系统配置失败' });
    }
});

app.get('/data.json', async (req, res) => {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        res.setHeader('Content-Type', 'application/json');
        res.send(data);
    } catch (error) {
        res.status(500).json({ error: '无法读取数据文件' });
    }
});

// ========== 首页 ==========
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>YP俱乐部后台系统</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
                .container { max-width: 1000px; margin: 0 auto; background: rgba(255,255,255,0.95); padding: 30px; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); color: #333; }
                h1 { color: #333; text-align: center; margin-bottom: 30px; }
                .status { background: #4CAF50; color: white; padding: 15px; border-radius: 8px; text-align: center; margin-bottom: 30px; }
                .section { margin-bottom: 30px; }
                .section h2 { color: #444; border-bottom: 2px solid #4CAF50; padding-bottom: 10px; }
                .api-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; }
                .api-card { background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #4CAF50; }
                .method { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; color: white; }
                .get { background: #61affe; }
                .post { background: #49cc90; }
                .put { background: #fca130; }
                .delete { background: #f93e3e; }
                .url { font-family: monospace; font-size: 13px; margin-left: 8px; }
                .note { background: #fff3cd; padding: 15px; border-radius: 8px; margin-top: 20px; color: #856404; }
                .feature-badge { background: #ff4444; color: white; padding: 3px 10px; border-radius: 12px; font-size: 12px; margin-left: 10px; animation: blink 1s infinite; }
                @keyframes blink { 50% { opacity: 0.7; } }
                .feature-box { background: #d1ecf1; border-left: 4px solid #0c5460; padding: 15px; border-radius: 8px; margin: 15px 0; }
                .success-box { background: #d4edda; border-left: 4px solid #155724; padding: 15px; border-radius: 8px; margin: 15px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🎮 YP俱乐部后台系统</h1>
                <div class="status">
                    ✅ 服务器运行中 | 端口: ${PORT} | 版本: 2.2.2 | 横幅上传完全无限制
                </div>
                
                <div class="success-box">
                    <h3>📷 商城顶部横幅管理 <span class="feature-badge">已修复！完全不限制格式</span></h3>
                    <p><strong>✅ 修复完成：</strong> 现在可以上传任何尺寸、任何格式、任何大小的图片！</p>
                    <p><strong>📌 上传说明：</strong> 直接上传即可，后端不再做任何格式检查，原样保存</p>
                    <p><strong>🔄 测试方法：</strong> POST /api/settings/banner 直接发送图片base64或URL</p>
                </div>
                
                <div class="feature-box">
                    <h4>📋 横幅管理API列表：</h4>
                    <ul>
                        <li><strong>POST /api/settings/banner</strong> - 上传横幅（任何格式都支持）</li>
                        <li><strong>GET /api/settings/banner</strong> - 获取横幅</li>
                        <li><strong>DELETE /api/settings/banner</strong> - 删除横幅</li>
                        <li><strong>PUT /api/settings/banner/toggle</strong> - 切换横幅状态</li>
                        <li><strong>POST /api/settings/banner/update</strong> - 更新横幅信息</li>
                    </ul>
                </div>
                
                <div class="section">
                    <h2>📦 商品管理</h2>
                    <div class="api-grid">
                        <div class="api-card"><span class="method get">GET</span><span class="url">/api/products</span></div>
                        <div class="api-card"><span class="method post">POST</span><span class="url">/api/products/add</span></div>
                        <div class="api-card"><span class="method post">POST</span><span class="url">/api/products/delete</span></div>
                        <div class="api-card"><span class="method post">POST</span><span class="url">/api/products/sync</span></div>
                    </div>
                </div>
                
                <div class="section">
                    <h2>📋 订单管理（含游戏信息）</h2>
                    <div class="api-grid">
                        <div class="api-card"><span class="method get">GET</span><span class="url">/api/orders</span></div>
                        <div class="api-card"><span class="method post">POST</span><span class="url">/api/orders/add</span></div>
                        <div class="api-card"><span class="method delete">DELETE</span><span class="url">/api/orders/:id</span></div>
                        <div class="api-card"><span class="method put">PUT</span><span class="url">/api/orders/:id/status</span></div>
                    </div>
                </div>
                
                <div class="section">
                    <h2>👥 用户管理</h2>
                    <div class="api-grid">
                        <div class="api-card"><span class="method post">POST</span><span class="url">/api/login</span></div>
                        <div class="api-card"><span class="method post">POST</span><span class="url">/api/register</span></div>
                        <div class="api-card"><span class="method get">GET</span><span class="url">/api/users</span></div>
                    </div>
                </div>
                
                <div class="section">
                    <h2>💬 客服管理</h2>
                    <div class="api-grid">
                        <div class="api-card"><span class="method get">GET</span><span class="url">/api/services</span></div>
                        <div class="api-card"><span class="method get">GET</span><span class="url">/api/services/all</span></div>
                        <div class="api-card"><span class="method post">POST</span><span class="url">/api/services/add</span></div>
                        <div class="api-card"><span class="method delete">DELETE</span><span class="url">/api/services/:id</span></div>
                        <div class="api-card"><span class="method put">PUT</span><span class="url">/api/services/:id/toggle</span></div>
                        <div class="api-card"><span class="method post">POST</span><span class="url">/api/services/update</span></div>
                    </div>
                </div>
                
                <div class="section">
                    <h2>⚙️ 系统设置</h2>
                    <div class="api-grid">
                        <div class="api-card"><span class="method get">GET</span><span class="url">/api/settings</span></div>
                        <div class="api-card"><span class="method post">POST</span><span class="url">/api/settings/update</span></div>
                    </div>
                </div>
                
                <div class="section">
                    <h2>📊 系统状态</h2>
                    <div class="api-grid">
                        <div class="api-card"><span class="method get">GET</span><span class="url">/api/status</span></div>
                        <div class="api-card"><span class="method get">GET</span><span class="url">/api/test</span></div>
                        <div class="api-card"><span class="method get">GET</span><span class="url">/api/data</span></div>
                        <div class="api-card"><span class="method get">GET</span><span class="url">/api/system-config</span></div>
                        <div class="api-card"><span class="method get">GET</span><span class="url">/data.json</span></div>
                    </div>
                </div>
                
                <div class="note">
                    <h3>📝 使用说明</h3>
                    <p>🔑 <strong>默认管理员:</strong> admin / admin123</p>
                    <p>📁 <strong>数据文件:</strong> <a href="/data.json" target="_blank">查看data.json</a></p>
                    <p>🧪 <strong>测试API:</strong> <a href="/api/test" target="_blank">/api/test</a></p>
                    <p>📊 <strong>系统状态:</strong> <a href="/api/status" target="_blank">/api/status</a></p>
                    <p>📷 <strong>横幅上传:</strong> POST /api/settings/banner <span style="color:red;font-weight:bold;">【完全不限制任何格式】</span></p>
                    <p style="color:green;font-weight:bold;">✅ 任何尺寸、任何格式、任何大小的图片都可以上传！</p>
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
        error: 'API接口不存在',
        available: [
            '/api/products',
            '/api/orders',
            '/api/login',
            '/api/register',
            '/api/services',
            '/api/settings',
            '/api/settings/banner',
            '/api/status',
            '/api/test'
        ]
    });
});

// 全局错误处理
app.use((err, req, res, next) => {
    console.error('💥 服务器错误:', err);
    res.status(500).json({ 
        success: false, 
        error: '服务器内部错误',
        message: err.message 
    });
});

// 启动服务器
async function startServer() {
    await ensureDataFile();
    app.listen(PORT, () => {
        console.log('\n' + '='.repeat(60));
        console.log(`🚀 YP俱乐部后台服务器启动成功！`);
        console.log('='.repeat(60));
        console.log(`📍 地址: http://localhost:${PORT}`);
        console.log(`📊 数据文件: ${DATA_FILE}`);
        console.log(`🎮 版本: 2.2.2 (横幅上传完全无限制)`);
        console.log(`📷 横幅上传: POST /api/settings/banner`);
        console.log(`   ✅ 任何尺寸、任何格式、任何大小都可以！`);
        console.log(`👤 默认账号: admin / admin123`);
        console.log('='.repeat(60) + '\n');
    });
}

startServer().catch(err => {
    console.error('❌ 服务器启动失败:', err);
    process.exit(1);
});
