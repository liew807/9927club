// server.js - 完整修复版
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000; // 改成3000或其他可用端口

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.')); // 当前目录

// 数据文件配置
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
                }
            ],
            products: [],
            orders: [],
            services: [],
            settings: {},
            banner: null,
            lastUpdated: new Date().toISOString()
        };
        
        await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
        console.log('✅ 创建初始数据文件');
    }
}

// 读取数据
async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('读取数据失败:', error);
        await ensureDataFile();
        return await readData();
    }
}

// 保存数据
async function saveData(data) {
    try {
        data.lastUpdated = new Date().toISOString();
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('保存数据失败:', error);
        return false;
    }
}

// ========== 基本API路由 ==========

// 测试连接
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'API测试成功',
        timestamp: new Date().toISOString()
    });
});

// 获取商品列表
app.get('/api/products', async (req, res) => {
    try {
        const data = await readData();
        res.json({
            success: true,
            data: data.products || []
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取商品失败' });
    }
});

// 添加商品
app.post('/api/products/add', async (req, res) => {
    try {
        const { name, price, description, image } = req.body;
        const data = await readData();
        
        const product = {
            id: Date.now(),
            name,
            price: parseFloat(price),
            description: description || '',
            image: image || '',
            createdAt: new Date().toISOString()
        };
        
        data.products.push(product);
        await saveData(data);
        
        res.json({
            success: true,
            data: product
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '添加商品失败' });
    }
});

// 删除商品
app.post('/api/products/delete', async (req, res) => {
    try {
        const { id } = req.body;
        const data = await readData();
        
        data.products = data.products.filter(p => p.id != id);
        await saveData(data);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: '删除商品失败' });
    }
});

// 获取订单列表
app.get('/api/orders', async (req, res) => {
    try {
        const data = await readData();
        res.json({
            success: true,
            data: data.orders || []
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取订单失败' });
    }
});

// 添加订单
app.post('/api/orders/add', async (req, res) => {
    try {
        const data = await readData();
        const order = {
            id: Date.now(),
            ...req.body,
            createdAt: new Date().toISOString()
        };
        
        data.orders.push(order);
        await saveData(data);
        
        res.json({
            success: true,
            data: order
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '添加订单失败' });
    }
});

// 用户登录
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const data = await readData();
        
        const user = data.users.find(u => 
            u.username === username && u.password === password
        );
        
        if (user) {
            res.json({
                success: true,
                data: {
                    username: user.username,
                    isAdmin: user.isAdmin
                }
            });
        } else {
            res.status(401).json({ 
                success: false, 
                error: '用户名或密码错误'
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '登录失败' });
    }
});

// 用户注册
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
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
        
        res.json({
            success: true,
            data: {
                username: newUser.username,
                isAdmin: newUser.isAdmin
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '注册失败' });
    }
});

// 获取设置
app.get('/api/settings', async (req, res) => {
    try {
        const data = await readData();
        res.json({
            success: true,
            data: data.settings || {}
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取设置失败' });
    }
});

// 更新设置
app.post('/api/settings/update', async (req, res) => {
    try {
        const data = await readData();
        data.settings = {
            ...data.settings,
            ...req.body
        };
        
        await saveData(data);
        res.json({
            success: true,
            data: data.settings
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '更新设置失败' });
    }
});

// ========== 横幅管理API ==========

// 获取横幅
app.get('/api/settings/banner', async (req, res) => {
    try {
        const data = await readData();
        res.json({
            success: true,
            data: data.banner || null
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取横幅失败' });
    }
});

// 上传横幅 (POST接口)
app.post('/api/settings/banner', async (req, res) => {
    try {
        const data = await readData();
        
        // 简单处理，只保存URL或基本信息
        data.banner = {
            ...req.body,
            updatedAt: new Date().toISOString()
        };
        
        await saveData(data);
        
        res.json({
            success: true,
            data: data.banner
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: '上传横幅失败'
        });
    }
});

// 删除横幅
app.delete('/api/settings/banner', async (req, res) => {
    try {
        const data = await readData();
        data.banner = null;
        await saveData(data);
        
        res.json({
            success: true,
            message: '横幅已删除'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: '删除横幅失败'
        });
    }
});

// 首页
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>YP俱乐部后台</title>
            <style>
                body { font-family: Arial; margin: 40px; background: #f0f0f0; }
                .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
                h1 { color: #333; text-align: center; }
                .status { background: #4CAF50; color: white; padding: 15px; border-radius: 8px; text-align: center; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>✅ YP俱乐部后台系统运行中</h1>
                <div class="status">
                    端口: ${PORT} | 时间: ${new Date().toLocaleString()}
                </div>
                <p>API测试: <a href="/api/test">/api/test</a></p>
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
        path: req.path
    });
});

// 错误处理
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({
        success: false,
        error: '服务器内部错误'
    });
});

// 启动服务器
async function startServer() {
    try {
        await ensureDataFile();
        
        app.listen(PORT, () => {
            console.log(`
            ╔══════════════════════════════════════════════╗
            ║          ✅ YP俱乐部后台系统启动              ║
            ╠══════════════════════════════════════════════╣
            ║  网址: http://localhost:${PORT}              ║
            ║  测试: http://localhost:${PORT}/api/test      ║
            ║  时间: ${new Date().toLocaleString()}        ║
            ╚══════════════════════════════════════════════╝
            `);
        });
    } catch (error) {
        console.error('❌ 服务器启动失败:', error);
        process.exit(1);
    }
}

// 启动
startServer();
