// server.js - 数据文件改为 data.json
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
app.use(express.static('public'));

// ========== 修改这里：数据文件改为 data.json ==========
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
                }
            ],
            settings: {
                storeName: 'CPMCY商城',
                kuaishouLink: 'https://v.kuaishou.com/JGv00n48',
                enableService: true
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
        return JSON.parse(data);
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

// ========== API路由（保持原样） ==========

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

// 7. 用户登录（修复版）
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log(`🔐 登录尝试: ${username}`);
        
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        const user = data.users.find(u => u.username === username && u.password === password);
        
        if (user) {
            console.log('✅ 登录成功');
            // 不返回密码
            const { password: _, ...userWithoutPassword } = user;
            
            res.json({
                success: true,
                data: userWithoutPassword,
                message: '登录成功'
            });
        } else {
            console.log('❌ 登录失败');
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

// 13. 删除客服
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

// 14. 系统状态
app.get('/api/status', async (req, res) => {
    try {
        const data = await readData();
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        const fileStats = await fs.stat(DATA_FILE).catch(() => null);
        
        res.json({
            success: true,
            data: {
                status: 'running',
                storage: 'data.json',
                productsCount: data.products.length,
                ordersCount: data.orders.length,
                usersCount: data.users.length,
                servicesCount: data.services ? data.services.length : 0,
                fileSize: fileStats ? `${(fileStats.size / 1024).toFixed(2)} KB` : '未知',
                lastUpdated: data.lastUpdated,
                uptime: process.uptime()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取状态失败' });
    }
});

// 15. 直接获取 data.json（用于调试）
app.get('/data.json', async (req, res) => {
    try {
        const data = await readData();
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(data, null, 2));
    } catch (error) {
        res.status(500).json({ error: '无法读取数据文件' });
    }
});

// 首页
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>CPMCY商城后端</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                h1 { color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px; }
                .info { background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0; }
                .endpoint { background: #f8f9fa; padding: 12px; margin: 8px 0; border-radius: 5px; border-left: 4px solid #4CAF50; }
                .method { display: inline-block; padding: 4px 8px; border-radius: 3px; margin-right: 10px; font-weight: bold; font-size: 12px; }
                .get { background: #61affe; color: white; }
                .post { background: #49cc90; color: white; }
                .put { background: #fca130; color: white; }
                .delete { background: #f93e3e; color: white; }
                .url { color: #666; font-family: monospace; font-size: 14px; }
                .data-file { background: #fff3cd; padding: 10px; border-radius: 5px; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>✅ CPMCY商城后端运行中</h1>
                <div class="info">
                    <p>服务器端口: <strong>${PORT}</strong></p>
                    <p>数据文件: <strong>data.json</strong> (根目录)</p>
                    <p>默认管理员: <strong>admin / admin123</strong></p>
                </div>
                
                <h2>📊 测试链接:</h2>
                <div class="endpoint"><span class="method get">GET</span> <span class="url"><a href="/api/status" target="_blank">/api/status</a></span> - 系统状态</div>
                <div class="endpoint"><span class="method get">GET</span> <span class="url"><a href="/api/products" target="_blank">/api/products</a></span> - 获取商品</div>
                <div class="endpoint"><span class="method get">GET</span> <span class="url"><a href="/data.json" target="_blank">/data.json</a></span> - 查看数据文件</div>
                
                <h2>🔧 主要API:</h2>
                <div class="endpoint"><span class="method get">GET</span> <span class="url">/api/products</span> - 获取商品列表</div>
                <div class="endpoint"><span class="method post">POST</span> <span class="url">/api/products</span> - 添加商品</div>
                <div class="endpoint"><span class="method post">POST</span> <span class="url">/api/login</span> - 用户登录</div>
                <div class="endpoint"><span class="method post">POST</span> <span class="url">/api/register</span> - 用户注册</div>
                <div class="endpoint"><span class="method get">GET</span> <span class="url">/api/settings</span> - 获取系统设置</div>
                
                <div class="data-file">
                    <h3>📁 数据文件说明:</h3>
                    <p>所有数据现在保存在 <code>data.json</code> 文件中，位于服务器根目录。</p>
                    <p>前端可以通过API访问，也可以通过 <a href="/data.json" target="_blank">/data.json</a> 直接查看。</p>
                </div>
                
                <p style="margin-top: 30px; color: #666; font-size: 14px;">
                    💡 将前端HTML文件放入 <strong>public</strong> 目录即可访问商城。
                </p>
            </div>
        </body>
        </html>
    `);
});

// 启动服务器
async function startServer() {
    await ensureDataFile();
    
    app.listen(PORT, () => {
        console.log(`
        🚀 CPMCY商城后端已启动！
        📍 本地访问: http://localhost:${PORT}
        📍 API基础: http://localhost:${PORT}/api
        📍 数据文件: ${DATA_FILE}
        
        📊 测试链接:
        - http://localhost:${PORT}/api/status
        - http://localhost:${PORT}/api/products  
        - http://localhost:${PORT}/data.json
        
        🔑 默认管理员:
        - 用户名: admin
        - 密码: admin123
        
        📂 部署说明:
        1. 将前端文件放入 public/ 目录
        2. 数据会自动保存到 data.json
        3. 所有用户通过API访问同一份数据
        `);
    });
}

startServer().catch(console.error);
