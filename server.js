// server.js - 完整修复版
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== 环境变量验证 ==========
console.log('🔍 环境变量检查:');

// 检查必需的DATABASE_URL环境变量
if (!process.env.DATABASE_URL) {
    console.error('❌ 错误: 缺少 DATABASE_URL 环境变量');
    console.log('💡 请创建 .env 文件并添加:');
    console.log('DATABASE_URL=postgresql://username:password@localhost:5432/cpmcy_db');
    console.log('PORT=3000');
    console.log('💡 或者使用:');
    console.log('DATABASE_URL=postgresql://localhost:5432/cpmcy_db');
    process.exit(1);
}

console.log('- DATABASE_URL:', process.env.DATABASE_URL ? '已设置' : '未设置');
console.log('- PORT:', process.env.PORT || '3000 (默认)');
console.log('- NODE_ENV:', process.env.NODE_ENV || 'development');

// ========== PostgreSQL配置 ==========
console.log('🔗 正在连接数据库...');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { 
        rejectUnauthorized: false 
    } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
});

// 中间件
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 静态文件服务 - 自动检测并创建public目录
const publicDir = path.join(__dirname, 'public');
try {
    // 检查public目录是否存在，不存在则创建
    await fs.access(publicDir);
    console.log('✅ public目录存在');
} catch (err) {
    console.log('📁 创建public目录...');
    await fs.mkdir(publicDir, { recursive: true });
    console.log('✅ public目录创建成功');
}

app.use(express.static(publicDir));
console.log('✅ 静态文件服务已启用，目录:', publicDir);

// 请求日志中间件
app.use((req, res, next) => {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    console.log(`📨 ${req.method} ${req.path} - ${timestamp}`);
    next();
});

// ========== 数据库初始化 ==========
async function initializeDatabase() {
    try {
        console.log('🔄 初始化数据库...');
        
        // 测试连接
        const testResult = await pool.query('SELECT NOW()');
        console.log('✅ 数据库连接测试成功:', testResult.rows[0].now);
        
        // 创建用户表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(100) NOT NULL,
                is_admin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ 用户表创建/检查完成');
        
        // 创建商品表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                description TEXT,
                image TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ 商品表创建/检查完成');
        
        // 创建订单表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                order_number VARCHAR(50) UNIQUE NOT NULL,
                user_id VARCHAR(100),
                product_id INTEGER,
                product_name VARCHAR(255) NOT NULL,
                product_price DECIMAL(10,2) NOT NULL,
                total_amount DECIMAL(10,2) NOT NULL,
                payment_method VARCHAR(50),
                remark TEXT,
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ 订单表创建/检查完成');
        
        // 创建客服链接表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS customer_service (
                id SERIAL PRIMARY KEY,
                icon VARCHAR(10) DEFAULT '💬',
                name VARCHAR(100) NOT NULL,
                description VARCHAR(255),
                url TEXT NOT NULL,
                enabled BOOLEAN DEFAULT TRUE,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ 客服表创建/检查完成');
        
        // 创建设置表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS settings (
                id SERIAL PRIMARY KEY,
                store_name VARCHAR(255) DEFAULT '9927俱乐部',
                kuaishou_link TEXT,
                banner_image TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ 设置表创建/检查完成');
        
        // 检查是否有管理员用户
        const adminResult = await pool.query('SELECT * FROM users WHERE username = $1', ['admin']);
        if (adminResult.rows.length === 0) {
            await pool.query(
                'INSERT INTO users (username, password, is_admin) VALUES ($1, $2, $3)',
                ['admin', 'admin123', true]
            );
            console.log('✅ 默认管理员账户已创建: admin/admin123');
        } else {
            console.log('✅ 管理员账户已存在');
        }
        
        // 检查是否有客服链接
        const serviceResult = await pool.query('SELECT * FROM customer_service');
        if (serviceResult.rows.length === 0) {
            await pool.query(
                `INSERT INTO customer_service (icon, name, description, url, sort_order) 
                 VALUES 
                 ('📞', 'WhatsApp客服', '通过WhatsApp联系我们', 'https://wa.me/1234567890', 1),
                 ('✈️', 'Telegram客服', '通过Telegram联系我们', 'https://t.me/username', 2)`
            );
            console.log('✅ 添加了2个客服链接示例');
        } else {
            console.log(`✅ 已有 ${serviceResult.rows.length} 个客服链接`);
        }
        
        // 检查是否有设置
        const settingsResult = await pool.query('SELECT * FROM settings');
        if (settingsResult.rows.length === 0) {
            await pool.query(
                `INSERT INTO settings (store_name, kuaishou_link) 
                 VALUES ($1, $2)`,
                ['9927俱乐部', 'https://v.kuaishou.com/JGv00n48']
            );
            console.log('✅ 添加了默认设置');
        }
        
        console.log('🎉 数据库初始化完成！');
    } catch (error) {
        console.error('❌ 数据库初始化失败:');
        console.error('错误信息:', error.message);
        console.error('错误堆栈:', error.stack);
        process.exit(1);
    }
}

// ========== API路由 ==========

// 1. 健康检查
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: '9927俱乐部商城服务器运行正常',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        database: 'PostgreSQL'
    });
});

// 2. 用户认证相关API
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        console.log('🔑 登录尝试:', username);
        
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1 AND password = $2',
            [username, password]
        );
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const { password, ...userWithoutPassword } = user;
            console.log('✅ 登录成功:', username);
            res.json({
                success: true,
                data: userWithoutPassword,
                message: '登录成功'
            });
        } else {
            console.log('❌ 登录失败:', username);
            res.status(401).json({
                success: false,
                error: '用户名或密码错误'
            });
        }
    } catch (error) {
        console.error('登录API错误:', error);
        res.status(500).json({
            success: false,
            error: '服务器内部错误'
        });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        console.log('📝 注册尝试:', username);
        
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: '用户名和密码不能为空'
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                error: '密码长度至少6位'
            });
        }
        
        // 检查用户是否已存在
        const checkResult = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );
        
        if (checkResult.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: '用户名已存在'
            });
        }
        
        const result = await pool.query(
            'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username, is_admin',
            [username, password]
        );
        
        console.log('✅ 注册成功:', username);
        res.json({
            success: true,
            data: result.rows[0],
            message: '注册成功'
        });
    } catch (error) {
        console.error('注册API错误:', error);
        res.status(500).json({
            success: false,
            error: '注册失败'
        });
    }
});

// 3. 商品相关API
app.get('/api/products', async (req, res) => {
    try {
        console.log('🔄 获取商品列表');
        const result = await pool.query('SELECT * FROM products ORDER BY id DESC');
        console.log(`✅ 获取到 ${result.rows.length} 个商品`);
        res.json({
            success: true,
            data: result.rows,
            count: result.rowCount
        });
    } catch (error) {
        console.error('获取商品列表失败:', error);
        res.status(500).json({
            success: false,
            error: '获取商品列表失败'
        });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const { name, price, description, image } = req.body;
        
        console.log('➕ 添加商品请求:', { name, price, description: description?.substring(0, 50) + '...' });
        
        if (!name || !price) {
            return res.status(400).json({
                success: false,
                error: '商品名称和价格不能为空'
            });
        }
        
        const priceNum = parseFloat(price);
        if (isNaN(priceNum) || priceNum <= 0) {
            return res.status(400).json({
                success: false,
                error: '请输入有效的价格（大于0的数字）'
            });
        }
        
        const result = await pool.query(
            `INSERT INTO products (name, price, description, image) 
             VALUES ($1, $2, $3, $4) 
             RETURNING *`,
            [
                name, 
                priceNum, 
                description || '', 
                image || 'https://via.placeholder.com/300x200?text=商品'
            ]
        );
        
        console.log('✅ 商品添加成功:', result.rows[0].id);
        res.json({
            success: true,
            data: result.rows[0],
            message: '商品添加成功'
        });
    } catch (error) {
        console.error('添加商品失败:', error);
        res.status(500).json({
            success: false,
            error: '添加商品失败: ' + error.message
        });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        console.log('🗑️ 删除商品请求:', productId);
        
        const result = await pool.query(
            'DELETE FROM products WHERE id = $1 RETURNING *',
            [productId]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: '商品不存在'
            });
        }
        
        console.log('✅ 商品删除成功:', productId);
        res.json({
            success: true,
            message: '商品已删除'
        });
    } catch (error) {
        console.error('删除商品失败:', error);
        res.status(500).json({
            success: false,
            error: '删除商品失败'
        });
    }
});

// 4. 订单相关API
app.get('/api/orders', async (req, res) => {
    try {
        console.log('🔄 获取订单列表');
        const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
        console.log(`✅ 获取到 ${result.rows.length} 个订单`);
        res.json({
            success: true,
            data: result.rows,
            count: result.rowCount
        });
    } catch (error) {
        console.error('获取订单列表失败:', error);
        res.status(500).json({
            success: false,
            error: '获取订单列表失败'
        });
    }
});

app.post('/api/orders', async (req, res) => {
    try {
        const { 
            orderNumber, 
            userId, 
            productId, 
            productName, 
            productPrice, 
            totalAmount, 
            paymentMethod, 
            remark 
        } = req.body;
        
        console.log('🛒 创建订单请求:', { orderNumber, productName });
        
        const result = await pool.query(
            `INSERT INTO orders (
                order_number, user_id, product_id, product_name, 
                product_price, total_amount, payment_method, remark
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
            RETURNING *`,
            [
                orderNumber, 
                userId || 'anonymous', 
                productId || 0,
                productName || '未知商品',
                parseFloat(productPrice) || 0,
                parseFloat(totalAmount) || 0,
                paymentMethod || 'tng',
                remark || ''
            ]
        );
        
        console.log('✅ 订单创建成功:', orderNumber);
        res.json({
            success: true,
            data: result.rows[0],
            message: '订单创建成功'
        });
    } catch (error) {
        console.error('创建订单失败:', error);
        res.status(500).json({
            success: false,
            error: '创建订单失败'
        });
    }
});

app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const orderId = req.params.id;
        const { status } = req.body;
        
        console.log('📝 更新订单状态:', { orderId, status });
        
        const result = await pool.query(
            `UPDATE orders 
             SET status = $1, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $2 
             RETURNING *`,
            [status, orderId]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: '订单不存在'
            });
        }
        
        console.log('✅ 订单状态更新成功:', orderId);
        res.json({
            success: true,
            data: result.rows[0],
            message: '订单状态已更新'
        });
    } catch (error) {
        console.error('更新订单状态失败:', error);
        res.status(500).json({
            success: false,
            error: '更新订单状态失败'
        });
    }
});

// 5. 客服相关API
app.get('/api/customer-service', async (req, res) => {
    try {
        console.log('🔄 获取客服链接');
        const result = await pool.query(
            'SELECT * FROM customer_service WHERE enabled = true ORDER BY sort_order'
        );
        console.log(`✅ 获取到 ${result.rows.length} 个客服链接`);
        res.json({
            success: true,
            data: result.rows,
            count: result.rowCount
        });
    } catch (error) {
        console.error('获取客服信息失败:', error);
        res.status(500).json({
            success: false,
            error: '获取客服信息失败'
        });
    }
});

// 批量保存客服链接
app.put('/api/customer-service/batch', async (req, res) => {
    try {
        const { links } = req.body;
        
        console.log('💾 批量保存客服链接:', links?.length || 0);
        
        if (!Array.isArray(links)) {
            return res.status(400).json({
                success: false,
                error: '链接数据格式错误'
            });
        }
        
        // 清空现有数据
        await pool.query('DELETE FROM customer_service');
        
        // 插入新数据
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            await pool.query(
                `INSERT INTO customer_service (icon, name, description, url, sort_order) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    link.icon || '💬',
                    link.name,
                    link.description || '',
                    link.url,
                    i + 1
                ]
            );
        }
        
        console.log('✅ 客服链接保存成功');
        res.json({
            success: true,
            message: '客服链接保存成功'
        });
    } catch (error) {
        console.error('保存客服链接失败:', error);
        res.status(500).json({
            success: false,
            error: '保存客服链接失败'
        });
    }
});

// 6. 设置相关API
app.get('/api/settings', async (req, res) => {
    try {
        console.log('🔄 获取设置');
        const result = await pool.query('SELECT * FROM settings LIMIT 1');
        
        if (result.rows.length === 0) {
            // 创建默认设置
            await pool.query(
                `INSERT INTO settings (store_name, kuaishou_link) 
                 VALUES ($1, $2)`,
                ['9927俱乐部', 'https://v.kuaishou.com/JGv00n48']
            );
            const newResult = await pool.query('SELECT * FROM settings LIMIT 1');
            console.log('✅ 创建默认设置');
            return res.json({
                success: true,
                data: newResult.rows[0]
            });
        }
        
        console.log('✅ 获取设置成功');
        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('获取设置失败:', error);
        res.status(500).json({
            success: false,
            error: '获取设置失败'
        });
    }
});

app.put('/api/settings', async (req, res) => {
    try {
        const { storeName, kuaishouLink, bannerImage } = req.body;
        
        console.log('💾 保存设置请求:', { storeName, kuaishouLink });
        
        // 检查是否有现有设置
        const checkResult = await pool.query('SELECT * FROM settings LIMIT 1');
        
        if (checkResult.rows.length === 0) {
            // 创建新设置
            const result = await pool.query(
                `INSERT INTO settings (store_name, kuaishou_link, banner_image) 
                 VALUES ($1, $2, $3) 
                 RETURNING *`,
                [
                    storeName || '9927俱乐部',
                    kuaishouLink || '',
                    bannerImage || ''
                ]
            );
            
            console.log('✅ 设置创建成功');
            return res.json({
                success: true,
                data: result.rows[0],
                message: '设置保存成功'
            });
        }
        
        // 更新现有设置
        const result = await pool.query(
            `UPDATE settings 
             SET store_name = $1, kuaishou_link = $2, banner_image = $3,
                 updated_at = CURRENT_TIMESTAMP 
             RETURNING *`,
            [
                storeName || checkResult.rows[0].store_name,
                kuaishouLink || checkResult.rows[0].kuaishou_link,
                bannerImage || checkResult.rows[0].banner_image
            ]
        );
        
        console.log('✅ 设置更新成功');
        res.json({
            success: true,
            data: result.rows[0],
            message: '设置保存成功'
        });
    } catch (error) {
        console.error('保存设置失败:', error);
        res.status(500).json({
            success: false,
            error: '保存设置失败'
        });
    }
});

// 7. 数据备份和恢复
app.get('/api/backup', async (req, res) => {
    try {
        console.log('💾 备份数据请求');
        // 获取所有数据
        const [products, orders, serviceLinks, settings] = await Promise.all([
            pool.query('SELECT * FROM products'),
            pool.query('SELECT * FROM orders'),
            pool.query('SELECT * FROM customer_service'),
            pool.query('SELECT * FROM settings')
        ]);
        
        const backupData = {
            products: products.rows,
            orders: orders.rows,
            serviceLinks: serviceLinks.rows,
            settings: settings.rows,
            timestamp: new Date().toISOString()
        };
        
        console.log(`✅ 数据备份成功: ${products.rows.length}商品, ${orders.rows.length}订单`);
        res.json({
            success: true,
            data: backupData
        });
    } catch (error) {
        console.error('备份数据失败:', error);
        res.status(500).json({
            success: false,
            error: '备份数据失败'
        });
    }
});

app.post('/api/restore', async (req, res) => {
    try {
        const { backupData } = req.body;
        
        console.log('🔄 恢复数据请求');
        
        if (!backupData) {
            return res.status(400).json({
                success: false,
                error: '备份数据不能为空'
            });
        }
        
        // 清空现有数据
        await pool.query('DELETE FROM products');
        await pool.query('DELETE FROM orders');
        await pool.query('DELETE FROM customer_service');
        await pool.query('DELETE FROM settings');
        
        // 恢复数据
        if (backupData.products && Array.isArray(backupData.products)) {
            for (const product of backupData.products) {
                await pool.query(
                    `INSERT INTO products (name, price, description, image) 
                     VALUES ($1, $2, $3, $4)`,
                    [
                        product.name,
                        product.price,
                        product.description || '',
                        product.image || product.image_url || 'https://via.placeholder.com/300x200?text=商品'
                    ]
                );
            }
        }
        
        // 恢复客服链接
        if (backupData.serviceLinks && Array.isArray(backupData.serviceLinks)) {
            for (const link of backupData.serviceLinks) {
                await pool.query(
                    `INSERT INTO customer_service (icon, name, description, url, sort_order) 
                     VALUES ($1, $2, $3, $4, $5)`,
                    [
                        link.icon || '💬',
                        link.name,
                        link.description || '',
                        link.url,
                        link.sort_order || 0
                    ]
                );
            }
        }
        
        // 恢复设置
        if (backupData.settings && Array.isArray(backupData.settings) && backupData.settings.length > 0) {
            const setting = backupData.settings[0];
            await pool.query(
                `INSERT INTO settings (store_name, kuaishou_link, banner_image) 
                 VALUES ($1, $2, $3)`,
                [
                    setting.store_name || setting.storeName || '9927俱乐部',
                    setting.kuaishou_link || setting.kuaishouLink || '',
                    setting.banner_image || setting.bannerImage || ''
                ]
            );
        }
        
        console.log('✅ 数据恢复成功');
        res.json({
            success: true,
            message: '数据恢复成功'
        });
    } catch (error) {
        console.error('恢复数据失败:', error);
        res.status(500).json({
            success: false,
            error: '恢复数据失败'
        });
    }
});

// 8. 首页服务 - 修复文件路径问题
app.get('/', async (req, res) => {
    console.log('🏠 首页请求');
    
    // 尝试多种可能的HTML文件路径
    const possiblePaths = [
        path.join(__dirname, 'index.html'),
        path.join(__dirname, 'public', 'index.html'),
        path.join(__dirname, 'html', 'index.html'),
        path.join(__dirname, 'views', 'index.html')
    ];
    
    for (const htmlPath of possiblePaths) {
        try {
            await fs.access(htmlPath);
            console.log(`✅ 找到HTML文件: ${htmlPath}`);
            return res.sendFile(htmlPath);
        } catch (err) {
            // 文件不存在，继续尝试下一个路径
            continue;
        }
    }
    
    // 如果都找不到，返回一个简单的HTML页面
    console.log('⚠️ 未找到HTML文件，返回默认页面');
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>9927俱乐部</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                h1 { color: #333; }
                p { color: #666; }
                .setup { background: #f5f5f5; padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 600px; }
                code { background: #e0e0e0; padding: 2px 6px; border-radius: 4px; }
            </style>
        </head>
        <body>
            <h1>🎉 9927俱乐部商城服务器已启动！</h1>
            <p>API服务运行正常，但未找到前端页面。</p>
            
            <div class="setup">
                <h2>📁 安装步骤：</h2>
                <ol style="text-align: left; display: inline-block;">
                    <li>将您的 <code>index.html</code> 文件放在项目根目录</li>
                    <li>或者放在 <code>public</code> 文件夹内</li>
                    <li>重启服务器即可访问</li>
                </ol>
                
                <h2 style="margin-top: 30px;">🔗 API测试：</h2>
                <p><a href="/api/health">/api/health</a> - 检查服务器状态</p>
                <p><a href="/api/products">/api/products</a> - 获取商品列表</p>
                <p><a href="/api/customer-service">/api/customer-service</a> - 获取客服链接</p>
            </div>
            
            <p style="margin-top: 30px;">💡 提示：管理员账户 - 用户名: <code>admin</code>, 密码: <code>admin123</code></p>
        </body>
        </html>
    `);
});

// 9. 处理404错误
app.use((req, res) => {
    console.log(`❌ 404 Not Found: ${req.method} ${req.path}`);
    res.status(404).json({
        success: false,
        error: 'API端点不存在',
        requestedUrl: req.path,
        timestamp: new Date().toISOString()
    });
});

// 10. 错误处理中间件
app.use((err, req, res, next) => {
    console.error('💥 服务器错误:', err);
    res.status(500).json({
        success: false,
        error: '服务器内部错误',
        message: process.env.NODE_ENV === 'development' ? err.message : '请稍后重试'
    });
});

// ========== 启动服务器 ==========
async function startServer() {
    try {
        console.log('🚀 正在启动服务器...');
        console.log('='.repeat(60));
        
        // 初始化数据库
        await initializeDatabase();
        
        // 检查HTML文件是否存在
        try {
            await fs.access(path.join(__dirname, 'index.html'));
            console.log('✅ 找到根目录下的 index.html 文件');
        } catch (err) {
            console.log('⚠️ 未找到根目录下的 index.html 文件');
            console.log('💡 提示：将您的HTML文件放在项目根目录即可');
        }
        
        // 启动服务器
        app.listen(PORT, () => {
            console.log(`
🎉 9927俱乐部商城服务器启动成功！

📡 服务器地址: http://localhost:${PORT}
🌐 局域网访问: http://[您的IP地址]:${PORT}

💾 数据库: PostgreSQL (已连接)
👨‍💼 管理员账户: admin / admin123

📁 项目结构:
   server.js     - 服务器代码
   index.html    - 前端页面 (请放在根目录)
   public/       - 静态文件目录

🔗 重要API:
   GET  /                    - 访问前端页面
   GET  /api/health         - 服务器状态检查
   GET  /api/products       - 获取商品列表
   POST /api/login          - 用户登录

🛠️ 管理功能:
   1. 访问首页
   2. 使用管理员账户登录
   3. 点击右上角"管理后台"按钮
   4. 管理商品、订单、客服链接等

`.trim());
        });
    } catch (error) {
        console.error('❌ 启动服务器失败:');
        console.error('错误信息:', error.message);
        console.error('错误堆栈:', error.stack);
        process.exit(1);
    }
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
    console.error('💥 未捕获的异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 未处理的Promise拒绝:', reason);
});

// 启动服务器
startServer();
