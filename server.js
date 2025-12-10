// server.js - 商城后端服务器
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const multer = require('multer');

// 如果没有安装依赖，运行: npm install express cors multer
// 启动服务器: node server.js

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // 静态文件目录

// 数据存储路径
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'mall-data.json');

// 初始化数据目录
async function initDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        
        // 检查数据文件是否存在
        try {
            await fs.access(DATA_FILE);
            console.log('数据文件已存在');
        } catch {
            // 创建初始数据文件
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
                settings: {
                    storeName: '我的快手商城',
                    kuaishouLink: 'https://v.kuaishou.com/JGv00n48',
                    createdAt: new Date().toISOString()
                },
                stats: {
                    totalOrders: 0,
                    totalRevenue: 0,
                    onlineUsers: 0,
                    lastUpdated: new Date().toISOString()
                }
            };
            
            await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
            console.log('初始化数据文件创建成功');
        }
    } catch (error) {
        console.error('初始化数据目录失败:', error);
    }
}

// 读取数据
async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('读取数据失败:', error);
        return null;
    }
}

// 保存数据
async function saveData(data) {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('保存数据失败:', error);
        return false;
    }
}

// 文件上传配置
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'public', 'uploads');
        // 确保上传目录存在
        fs.mkdir(uploadDir, { recursive: true }).then(() => {
            cb(null, uploadDir);
        }).catch(err => {
            cb(err, null);
        });
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB限制
    },
    fileFilter: function (req, file, cb) {
        // 只接受图片文件
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('只支持图片文件'), false);
        }
    }
});

// API路由

// 1. 获取系统状态
app.get('/api/status', async (req, res) => {
    try {
        const data = await readData();
        if (!data) {
            return res.status(500).json({ error: '系统错误' });
        }
        
        res.json({
            success: true,
            data: {
                status: 'healthy',
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
                stats: data.stats || {
                    totalOrders: 0,
                    totalRevenue: 0,
                    onlineUsers: 0
                }
            }
        });
    } catch (error) {
        res.status(500).json({ error: '获取状态失败' });
    }
});

// 2. 用户登录
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        const user = data.users.find(u => u.username === username && u.password === password);
        
        if (user) {
            // 更新用户最后登录时间
            user.lastLogin = new Date().toISOString();
            await saveData(data);
            
            // 不返回密码
            const { password: _, ...userWithoutPassword } = user;
            
            res.json({
                success: true,
                data: userWithoutPassword,
                message: '登录成功'
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

// 3. 用户注册
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        // 检查用户名是否已存在
        if (data.users.some(u => u.username === username)) {
            return res.status(400).json({
                success: false,
                error: '用户名已存在'
            });
        }
        
        // 创建新用户
        const newUser = {
            username,
            password,
            isAdmin: false,
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
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

// 4. 获取商品列表
app.get('/api/products', async (req, res) => {
    try {
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        res.json({
            success: true,
            data: data.products || []
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取商品失败' });
    }
});

// 5. 添加商品
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

// 6. 删除商品
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
            res.json({
                success: true,
                message: '商品删除成功'
            });
        } else {
            res.status(404).json({
                success: false,
                error: '商品不存在'
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '删除商品失败' });
    }
});

// 7. 获取订单列表
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

// 8. 创建订单
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
        
        // 更新统计
        data.stats = data.stats || {};
        data.stats.totalOrders = (data.stats.totalOrders || 0) + 1;
        data.stats.totalRevenue = (data.stats.totalRevenue || 0) + order.totalAmount;
        data.stats.lastUpdated = new Date().toISOString();
        
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

// 9. 更新订单状态
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
            res.status(404).json({
                success: false,
                error: '订单不存在'
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '更新订单失败' });
    }
});

// 10. 获取系统设置
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

// 11. 更新系统设置
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

// 12. 文件上传接口
app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: '请选择文件' });
        }
        
        // 返回文件的访问URL
        const fileUrl = `/uploads/${req.file.filename}`;
        
        res.json({
            success: true,
            data: {
                url: fileUrl,
                filename: req.file.filename,
                originalname: req.file.originalname,
                size: req.file.size,
                mimetype: req.file.mimetype
            },
            message: '文件上传成功'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 13. 备份数据
app.get('/api/backup', async (req, res) => {
    try {
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        const backupData = {
            ...data,
            backupAt: new Date().toISOString()
        };
        
        // 设置响应头，让浏览器下载文件
        res.setHeader('Content-Disposition', 'attachment; filename=mall-backup.json');
        res.setHeader('Content-Type', 'application/json');
        
        res.send(JSON.stringify(backupData, null, 2));
    } catch (error) {
        res.status(500).json({ success: false, error: '备份失败' });
    }
});

// 14. 恢复数据
app.post('/api/restore', upload.single('backupFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: '请选择备份文件' });
        }
        
        // 读取上传的备份文件
        const backupContent = await fs.readFile(req.file.path, 'utf8');
        const backupData = JSON.parse(backupContent);
        
        // 验证数据格式
        if (!backupData.users || !backupData.products || !backupData.orders) {
            return res.status(400).json({ success: false, error: '无效的备份文件格式' });
        }
        
        // 保存恢复的数据
        await fs.writeFile(DATA_FILE, JSON.stringify(backupData, null, 2));
        
        // 删除临时文件
        await fs.unlink(req.file.path);
        
        res.json({
            success: true,
            message: '数据恢复成功'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '恢复失败: ' + error.message });
    }
});

// 15. 获取统计数据
app.get('/api/stats', async (req, res) => {
    try {
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        // 计算今日订单
        const today = new Date().toDateString();
        const todayOrders = (data.orders || []).filter(order => 
            new Date(order.createdAt).toDateString() === today
        );
        
        const todaySales = todayOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
        
        // 在线用户数（模拟）
        const onlineUsers = Math.floor(Math.random() * 20) + 5;
        
        const stats = {
            totalOrders: data.orders?.length || 0,
            totalRevenue: data.stats?.totalRevenue || 0,
            todayOrders: todayOrders.length,
            todaySales: todaySales,
            onlineUsers: onlineUsers,
            totalProducts: data.products?.length || 0,
            totalUsers: data.users?.length || 0,
            lastUpdated: new Date().toISOString()
        };
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取统计失败' });
    }
});

// 16. 首页
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>商城后端服务</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                h1 { color: #333; }
                .endpoint { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px; }
                .method { display: inline-block; padding: 5px 10px; border-radius: 3px; margin-right: 10px; }
                .get { background: #61affe; color: white; }
                .post { background: #49cc90; color: white; }
                .put { background: #fca130; color: white; }
                .delete { background: #f93e3e; color: white; }
                .url { font-family: monospace; color: #333; }
            </style>
        </head>
        <body>
            <h1>🛍️ 商城后端服务运行中</h1>
            <p>服务器端口: ${PORT}</p>
            <p>API基础URL: http://localhost:${PORT}/api</p>
            
            <h2>可用接口:</h2>
            
            <div class="endpoint">
                <span class="method get">GET</span>
                <span class="url">/api/status</span> - 系统状态
            </div>
            
            <div class="endpoint">
                <span class="method post">POST</span>
                <span class="url">/api/login</span> - 用户登录
            </div>
            
            <div class="endpoint">
                <span class="method post">POST</span>
                <span class="url">/api/register</span> - 用户注册
            </div>
            
            <div class="endpoint">
                <span class="method get">GET</span>
                <span class="url">/api/products</span> - 获取商品列表
            </div>
            
            <div class="endpoint">
                <span class="method post">POST</span>
                <span class="url">/api/products</span> - 添加商品
            </div>
            
            <div class="endpoint">
                <span class="method delete">DELETE</span>
                <span class="url">/api/products/:id</span> - 删除商品
            </div>
            
            <div class="endpoint">
                <span class="method get">GET</span>
                <span class="url">/api/orders</span> - 获取订单列表
            </div>
            
            <div class="endpoint">
                <span class="method post">POST</span>
                <span class="url">/api/orders</span> - 创建订单
            </div>
            
            <div class="endpoint">
                <span class="method get">GET</span>
                <span class="url">/api/stats</span> - 获取统计数据
            </div>
            
            <div class="endpoint">
                <span class="method post">POST</span>
                <span class="url">/api/upload</span> - 上传图片
            </div>
            
            <p>将前端HTML文件放在 <code>public</code> 目录中即可访问。</p>
        </body>
        </html>
    `);
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({
        success: false,
        error: err.message || '服务器内部错误'
    });
});

// 404处理
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: '接口不存在'
    });
});

// 启动服务器
async function startServer() {
    // 初始化数据目录
    await initDataDir();
    
    app.listen(PORT, () => {
        console.log(`
        🚀 商城后端服务已启动！
        📍 本地访问: http://localhost:${PORT}
        📍 网络访问: http://你的IP地址:${PORT}
        
        📁 静态文件目录: ./public
        💾 数据文件位置: ./data/mall-data.json
        📸 上传文件目录: ./public/uploads
        
        ⚠️  请确保将前端HTML文件放入public目录
        `);
    });
}

startServer().catch(console.error);
