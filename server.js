// server.js - 修复完整版
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 数据文件路径
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'mall-data.json');

// 确保数据目录存在
async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        
        // 检查数据文件是否存在
        try {
            await fs.access(DATA_FILE);
        } catch {
            // 创建初始数据
            const initialData = {
                users: [
                    { username: 'admin', password: 'admin123', isAdmin: true }
                ],
                products: [],
                orders: [],
                settings: {
                    storeName: 'CPMCY商城',
                    kuaishouLink: 'https://v.kuaishou.com/JGv00n48'
                },
                lastUpdated: new Date().toISOString()
            };
            
            await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
            console.log('✅ 数据文件初始化完成');
        }
    } catch (error) {
        console.error('❌ 初始化数据目录失败:', error);
    }
}

// 读取数据
async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('❌ 读取数据失败:', error);
        return null;
    }
}

// 保存数据
async function saveData(data) {
    try {
        data.lastUpdated = new Date().toISOString();
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
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
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        res.json({
            success: true,
            data: data.products || [],
            lastUpdated: data.lastUpdated
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取商品失败' });
    }
});

// 2. 添加商品
app.post('/api/products', async (req, res) => {
    try {
        const product = req.body;
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        // 生成ID
        product.id = Date.now();
        product.createdAt = new Date().toISOString();
        
        data.products.push(product);
        await saveData(data);
        
        res.json({
            success: true,
            data: product,
            message: '商品添加成功'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '添加商品失败' });
    }
});

// 3. 删除商品
app.delete('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
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

// 4. 获取订单列表
app.get('/api/orders', async (req, res) => {
    try {
        const data = await readData();
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        res.json({
            success: true,
            data: data.orders || []
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取订单失败' });
    }
});

// 5. 创建订单
app.post('/api/orders', async (req, res) => {
    try {
        const order = req.body;
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        // 生成订单号
        const now = new Date();
        const dateStr = now.getFullYear().toString().substr(2) + 
                      (now.getMonth() + 1).toString().padStart(2, '0') + 
                      now.getDate().toString().padStart(2, '0');
        const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        
        order.id = Date.now();
        order.orderNumber = `DD${dateStr}${randomNum}`;
        order.createdAt = now.toISOString();
        order.updatedAt = now.toISOString();
        
        data.orders.push(order);
        await saveData(data);
        
        res.json({
            success: true,
            data: order,
            message: '订单创建成功'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '创建订单失败' });
    }
});

// 6. 更新订单状态
app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        const orderId = Number(id);
        const order = data.orders.find(o => o.id === orderId);
        
        if (order) {
            order.status = status;
            order.updatedAt = new Date().toISOString();
            await saveData(data);
            
            res.json({
                success: true,
                data: order,
                message: '订单状态更新成功'
            });
        } else {
            res.status(404).json({ success: false, error: '订单不存在' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '更新订单失败' });
    }
});

// 7. 用户登录
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        const user = data.users.find(u => u.username === username && u.password === password);
        
        if (user) {
            // 不返回密码
            const { password: _, ...userWithoutPassword } = user;
            
            res.json({
                success: true,
                data: userWithoutPassword,
                message: '登录成功'
            });
        } else {
            res.status(401).json({ success: false, error: '用户名或密码错误' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '登录失败' });
    }
});

// 8. 用户注册
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        // 检查用户名是否已存在
        if (data.users.some(u => u.username === username)) {
            return res.status(400).json({ success: false, error: '用户名已存在' });
        }
        
        // 创建新用户
        const newUser = {
            username,
            password,
            isAdmin: false,
            createdAt: new Date().toISOString()
        };
        
        data.users.push(newUser);
        await saveData(data);
        
        // 不返回密码
        const { password: _, ...userWithoutPassword } = newUser;
        
        res.json({
            success: true,
            data: userWithoutPassword,
            message: '注册成功'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '注册失败' });
    }
});

// 9. 获取系统设置
app.get('/api/settings', async (req, res) => {
    try {
        const data = await readData();
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        res.json({
            success: true,
            data: data.settings || {}
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取设置失败' });
    }
});

// 10. 更新系统设置
app.put('/api/settings', async (req, res) => {
    try {
        const settings = req.body;
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        data.settings = {
            ...data.settings,
            ...settings,
            updatedAt: new Date().toISOString()
        };
        
        await saveData(data);
        
        res.json({
            success: true,
            data: data.settings,
            message: '设置更新成功'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '更新设置失败' });
    }
});

// 11. 系统状态
app.get('/api/status', async (req, res) => {
    try {
        const data = await readData();
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        res.json({
            success: true,
            data: {
                status: 'running',
                productsCount: data.products.length,
                ordersCount: data.orders.length,
                usersCount: data.users.length,
                lastUpdated: data.lastUpdated,
                uptime: process.uptime()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取状态失败' });
    }
});

// 12. 首页
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>CPMCY商城后端</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                h1 { color: #333; }
                .endpoint { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px; }
                .method { display: inline-block; padding: 5px 10px; border-radius: 3px; margin-right: 10px; }
                .get { background: #61affe; color: white; }
                .post { background: #49cc90; color: white; }
                .put { background: #fca130; color: white; }
                .delete { background: #f93e3e; color: white; }
            </style>
        </head>
        <body>
            <h1>✅ CPMCY商城后端运行中</h1>
            <p>服务器端口: ${PORT}</p>
            <p>API基础URL: <code>http://localhost:${PORT}/api</code></p>
            
            <h2>可用接口:</h2>
            <div class="endpoint"><span class="method get">GET</span> /api/products - 获取商品列表</div>
            <div class="endpoint"><span class="method post">POST</span> /api/products - 添加商品</div>
            <div class="endpoint"><span class="method delete">DELETE</span> /api/products/:id - 删除商品</div>
            <div class="endpoint"><span class="method get">GET</span> /api/orders - 获取订单列表</div>
            <div class="endpoint"><span class="method post">POST</span> /api/orders - 创建订单</div>
            <div class="endpoint"><span class="method post">POST</span> /api/login - 用户登录</div>
            <div class="endpoint"><span class="method post">POST</span> /api/register - 用户注册</div>
            <div class="endpoint"><span class="method get">GET</span> /api/status - 系统状态</div>
            
            <p>将前端HTML文件放在 <code>public</code> 目录中即可访问。</p>
        </body>
        </html>
    `);
});

// 启动服务器
async function startServer() {
    await ensureDataDir();
    
    app.listen(PORT, () => {
        console.log(`
        🚀 CPMCY商城后端已启动！
        📍 本地访问: http://localhost:${PORT}
        📍 API基础: http://localhost:${PORT}/api
        
        📁 数据文件: ${DATA_FILE}
        ⚠️  请确保将前端HTML文件放入public目录
        `);
    });
}

startServer().catch(console.error);
