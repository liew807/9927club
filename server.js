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

// ========== API路由 ==========

// 1. 获取商品列表
app.get('/api/products', async (req, res) => {
    try {
        res.json({
            success: true,
            data: [],
            message: '商品列表获取成功（前端LocalStorage数据库）'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取商品失败' });
    }
});

// 2. 添加商品
app.post('/api/products', async (req, res) => {
    try {
        const product = req.body;
        res.json({
            success: true,
            data: product,
            message: '商品添加成功（前端LocalStorage数据库）'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '添加商品失败' });
    }
});

// 3. 删除商品
app.delete('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        res.json({ 
            success: true, 
            message: '商品删除成功（前端LocalStorage数据库）' 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '删除商品失败' });
    }
});

// 4. 获取订单列表
app.get('/api/orders', async (req, res) => {
    try {
        res.json({
            success: true,
            data: [],
            message: '订单列表获取成功（前端LocalStorage数据库）'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取订单失败' });
    }
});

// 5. 创建订单
app.post('/api/orders', async (req, res) => {
    try {
        const order = req.body;
        res.json({
            success: true,
            data: order,
            message: '订单创建成功（前端LocalStorage数据库）'
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
        res.json({
            success: true,
            message: '订单状态更新成功（前端LocalStorage数据库）'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '更新订单失败' });
    }
});

// 7. 用户登录
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        res.json({
            success: true,
            data: { username, isAdmin: username === 'admin' },
            message: '登录成功（前端LocalStorage数据库）'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '登录失败' });
    }
});

// 8. 用户注册
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        res.json({
            success: true,
            data: { username, isAdmin: false },
            message: '注册成功（前端LocalStorage数据库）'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '注册失败' });
    }
});

// 9. 获取系统设置
app.get('/api/settings', async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                storeName: 'CPMCY商城',
                kuaishouLink: 'https://v.kuaishou.com/JGv00n48',
                enableService: true
            },
            message: '设置获取成功（前端LocalStorage数据库）'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取设置失败' });
    }
});

// 10. 更新系统设置
app.put('/api/settings', async (req, res) => {
    try {
        const settings = req.body;
        res.json({
            success: true,
            data: settings,
            message: '设置更新成功（前端LocalStorage数据库）'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '更新设置失败' });
    }
});

// ========== 新增客服管理API ==========

// 11. 获取客服列表
app.get('/api/services', async (req, res) => {
    try {
        res.json({
            success: true,
            data: [
                {
                    id: 1,
                    type: 'whatsapp',
                    name: '官方客服',
                    link: 'https://wa.me/60123456789',
                    enabled: true,
                    createdAt: new Date().toISOString()
                }
            ],
            message: '客服列表获取成功（前端LocalStorage数据库）'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取客服列表失败' });
    }
});

// 12. 添加客服
app.post('/api/services', async (req, res) => {
    try {
        const service = req.body;
        service.id = Date.now();
        service.enabled = service.enabled !== undefined ? service.enabled : true;
        service.createdAt = new Date().toISOString();
        service.updatedAt = new Date().toISOString();
        
        res.json({
            success: true,
            data: service,
            message: '客服添加成功（前端LocalStorage数据库）'
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
        res.json({
            success: true,
            data: serviceData,
            message: '客服更新成功（前端LocalStorage数据库）'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '更新客服失败' });
    }
});

// 14. 删除客服
app.delete('/api/services/:id', async (req, res) => {
    try {
        const { id } = req.params;
        res.json({ 
            success: true, 
            message: '客服删除成功（前端LocalStorage数据库）' 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '删除客服失败' });
    }
});

// 15. 切换客服状态
app.put('/api/services/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;
        const { enabled } = req.body;
        res.json({
            success: true,
            message: `客服已${enabled ? '启用' : '禁用'}（前端LocalStorage数据库）`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '更新客服状态失败' });
    }
});

// 16. 获取启用的客服（公开接口）
app.get('/api/services/enabled', async (req, res) => {
    try {
        res.json({
            success: true,
            data: [
                {
                    id: 1,
                    type: 'whatsapp',
                    name: '官方客服',
                    link: 'https://wa.me/60123456789',
                    enabled: true,
                    createdAt: new Date().toISOString()
                }
            ],
            message: '获取客服列表成功（前端LocalStorage数据库）'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取客服列表失败' });
    }
});

// 17. 系统状态
app.get('/api/status', async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                status: 'running',
                productsCount: 0,
                ordersCount: 0,
                usersCount: 0,
                servicesCount: 1,
                enabledServicesCount: 1,
                lastUpdated: new Date().toISOString(),
                uptime: process.uptime()
            },
            message: '系统状态正常（使用前端LocalStorage数据库）'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取状态失败' });
    }
});

// 18. 首页
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
            <h1>✅ CPMCY商城后端运行中（前端LocalStorage数据库）</h1>
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
                💡 <strong>使用前端LocalStorage数据库</strong><br>
                所有数据存储在用户浏览器中，无需后端数据文件。
            </p>
        </body>
        </html>
    `);
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`
    🚀 CPMCY商城后端已启动（前端LocalStorage数据库）！
    📍 本地访问: http://localhost:${PORT}
    📍 前端商城: http://localhost:${PORT}/index.html
    📍 API基础: http://localhost:${PORT}/api
    
    📋 部署说明:
    1. 将前端HTML文件放入 ./public/ 目录
    2. 确保文件名为 index.html
    3. 前端使用LocalStorage存储数据
    4. API接口只提供模拟响应
    
    ⚠️  注意: 数据存储在用户浏览器中，每个用户数据独立
    `);
});
