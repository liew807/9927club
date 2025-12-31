// server.js - 添加客服功能完整版（包含静态文件服务）
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
// 添加静态文件服务 - 将前端文件放在public目录
app.use(express.static('public'));

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
            // 创建初始数据（添加客服数据）
            const initialData = {
                users: [
                    { username: 'admin', password: 'admin123', isAdmin: true }
                ],
                products: [],
                orders: [],
                services: [  // 新增客服数据
                    {
                        id: 1,
                        type: 'whatsapp',
                        name: '官方客服',
                        link: 'https://wa.me/60123456789',
                        enabled: true,
                        createdAt: new Date().toISOString()
                    }
                ],
                settings: {
                    storeName: 'CPMCY商城',
                    kuaishouLink: 'https://v.kuaishou.com/JGv00n48',
                    enableService: true  // 新增客服开关设置
                },
                lastUpdated: new Date().toISOString()
            };
            
            await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
            console.log('✅ 数据文件初始化完成（包含客服数据）');
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

// ========== 新增客服管理API ==========

// 11. 获取客服列表
app.get('/api/services', async (req, res) => {
    try {
        const data = await readData();
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        res.json({
            success: true,
            data: data.services || [],
            message: '获取客服列表成功'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取客服列表失败' });
    }
});

// 12. 添加客服
app.post('/api/services', async (req, res) => {
    try {
        const service = req.body;
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        // 验证必要字段
        if (!service.type || !service.name || !service.link) {
            return res.status(400).json({ success: false, error: '缺少必要字段' });
        }
        
        // 验证链接格式
        if (!service.link.startsWith('http://') && !service.link.startsWith('https://')) {
            return res.status(400).json({ success: false, error: '链接格式不正确' });
        }
        
        // 生成ID
        service.id = Date.now();
        service.enabled = service.enabled !== undefined ? service.enabled : true;
        service.createdAt = new Date().toISOString();
        service.updatedAt = new Date().toISOString();
        
        if (!data.services) {
            data.services = [];
        }
        
        data.services.push(service);
        await saveData(data);
        
        res.json({
            success: true,
            data: service,
            message: '客服添加成功'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '添加客服失败' });
    }
});

// 13. 更新客服
app.put('/api/services/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const serviceData = req.body;
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        const serviceId = Number(id);
        const service = data.services.find(s => s.id === serviceId);
        
        if (!service) {
            return res.status(404).json({ success: false, error: '客服不存在' });
        }
        
        // 更新字段
        Object.assign(service, serviceData);
        service.updatedAt = new Date().toISOString();
        
        // 验证链接格式
        if (service.link && !service.link.startsWith('http://') && !service.link.startsWith('https://')) {
            return res.status(400).json({ success: false, error: '链接格式不正确' });
        }
        
        await saveData(data);
        
        res.json({
            success: true,
            data: service,
            message: '客服更新成功'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '更新客服失败' });
    }
});

// 14. 删除客服
app.delete('/api/services/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
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

// 15. 切换客服状态
app.put('/api/services/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;
        const { enabled } = req.body;
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        const serviceId = Number(id);
        const service = data.services.find(s => s.id === serviceId);
        
        if (!service) {
            return res.status(404).json({ success: false, error: '客服不存在' });
        }
        
        service.enabled = enabled;
        service.updatedAt = new Date().toISOString();
        
        await saveData(data);
        
        res.json({
            success: true,
            data: service,
            message: `客服已${enabled ? '启用' : '禁用'}`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '更新客服状态失败' });
    }
});

// 16. 获取启用的客服（公开接口）
app.get('/api/services/enabled', async (req, res) => {
    try {
        const data = await readData();
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        const enabledServices = (data.services || []).filter(service => service.enabled);
        
        res.json({
            success: true,
            data: enabledServices,
            message: '获取客服列表成功'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取客服列表失败' });
    }
});

// 17. 系统状态
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
                servicesCount: data.services ? data.services.length : 0,
                enabledServicesCount: data.services ? data.services.filter(s => s.enabled).length : 0,
                lastUpdated: data.lastUpdated,
                uptime: process.uptime()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取状态失败' });
    }
});

// 18. 首页 - 当public目录没有index.html时才显示
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
                .new { background: #ff6b6b; color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px; }
            </style>
        </head>
        <body>
            <h1>✅ CPMCY商城后端运行中（客服功能已添加）</h1>
            <p>服务器端口: ${PORT}</p>
            <p>API基础URL: <code>http://localhost:${PORT}/api</code></p>
            <p style="color: #666; background: #fff3cd; padding: 10px; border-radius: 4px;">
                💡 前端商城访问地址: <a href="http://localhost:${PORT}/index.html">http://localhost:${PORT}/index.html</a>
            </p>
            
            <h2>常规接口:</h2>
            <div class="endpoint"><span class="method get">GET</span> /api/products - 获取商品列表</div>
            <div class="endpoint"><span class="method post">POST</span> /api/products - 添加商品</div>
            <div class="endpoint"><span class="method delete">DELETE</span> /api/products/:id - 删除商品</div>
            <div class="endpoint"><span class="method get">GET</span> /api/orders - 获取订单列表</div>
            <div class="endpoint"><span class="method post">POST</span> /api/orders - 创建订单</div>
            <div class="endpoint"><span class="method post">POST</span> /api/login - 用户登录</div>
            <div class="endpoint"><span class="method post">POST</span> /api/register - 用户注册</div>
            <div class="endpoint"><span class="method get">GET</span> /api/settings - 获取系统设置</div>
            <div class="endpoint"><span class="method put">PUT</span> /api/settings - 更新系统设置</div>
            
            <h2><span class="new">新增</span> 客服管理接口:</h2>
            <div class="endpoint"><span class="method get">GET</span> /api/services - 获取客服列表</div>
            <div class="endpoint"><span class="method get">GET</span> /api/services/enabled - 获取启用的客服（公开）</div>
            <div class="endpoint"><span class="method post">POST</span> /api/services - 添加客服</div>
            <div class="endpoint"><span class="method put">PUT</span> /api/services/:id - 更新客服</div>
            <div class="endpoint"><span class="method delete">DELETE</span> /api/services/:id - 删除客服</div>
            <div class="endpoint"><span class="method put">PUT</span> /api/services/:id/toggle - 切换客服状态</div>
            
            <div class="endpoint"><span class="method get">GET</span> /api/status - 系统状态</div>
            
            <p style="color: #666; margin-top: 30px; padding: 15px; background: #e8f5e9; border-radius: 5px;">
                💡 <strong>客服功能已集成！</strong><br>
                现在前端可以通过API管理客服信息，包括添加WhatsApp、微信等客服链接。
            </p>
        </body>
        </html>
    `);
});

// 启动服务器
async function startServer() {
    await ensureDataDir();
    
    app.listen(PORT, () => {
        console.log(`
        🚀 CPMCY商城后端已启动（客服功能已添加）！
        📍 本地访问: http://localhost:${PORT}
        📍 前端商城: http://localhost:${PORT}/index.html
        📍 API基础: http://localhost:${PORT}/api
        
        📁 数据文件: ${DATA_FILE}
        📁 前端文件: ./public/ 目录
        
        📞 客服管理API:
        GET    /api/services          - 获取客服列表
        POST   /api/services          - 添加客服
        PUT    /api/services/:id      - 更新客服
        DELETE /api/services/:id      - 删除客服
        GET    /api/services/enabled  - 获取启用的客服（前台使用）
        
        📋 部署说明:
        1. 将前端HTML文件放入 ./public/ 目录
        2. 确保文件名为 index.html
        3. 重启服务器即可访问
        `);
    });
}

startServer().catch(console.error);
