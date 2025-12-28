// server.js - 完整版（添加PostgreSQL、环境变量验证、客服管理、自定义图片链接）
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
app.use(express.static('public'));

// 请求日志中间件
app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.url} - ${new Date().toLocaleTimeString()}`);
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
                image_url TEXT,
                custom_image_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ 商品表创建/检查完成');
        
        // 创建订单表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                order_number VARCHAR(50) UNIQUE NOT NULL,
                user_id INTEGER,
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
        
        // 创建客服链接表 - 新增功能
        await pool.query(`
            CREATE TABLE IF NOT EXISTS customer_service (
                id SERIAL PRIMARY KEY,
                icon VARCHAR(10) DEFAULT '💬',
                name VARCHAR(100) NOT NULL,
                description VARCHAR(255),
                url TEXT NOT NULL,
                custom_image TEXT,
                enabled BOOLEAN DEFAULT TRUE,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ 客服表创建/检查完成');
        
        // 创建设置表 - 增强功能
        await pool.query(`
            CREATE TABLE IF NOT EXISTS settings (
                id SERIAL PRIMARY KEY,
                store_name VARCHAR(255) DEFAULT 'CPMCY商城',
                store_logo TEXT,
                store_banner TEXT,
                kuaishou_link TEXT,
                contact_info TEXT,
                welcome_message TEXT,
                custom_link1 TEXT,
                custom_link1_name VARCHAR(100),
                custom_link2 TEXT,
                custom_link2_name VARCHAR(100),
                custom_image1 TEXT,
                custom_image2 TEXT,
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
        
        // 检查是否有客服链接 - 新增功能
        const serviceResult = await pool.query('SELECT * FROM customer_service');
        if (serviceResult.rows.length === 0) {
            await pool.query(
                `INSERT INTO customer_service (icon, name, description, url, sort_order) 
                 VALUES 
                 ('📞', 'WhatsApp客服', '通过WhatsApp联系我们', 'https://wa.me/1234567890', 1),
                 ('✈️', 'Telegram客服', '通过Telegram联系我们', 'https://t.me/username', 2),
                 ('📱', 'Facebook客服', '通过Facebook联系我们', 'https://www.facebook.com/username', 3)`
            );
            console.log('✅ 添加了3个客服链接示例');
        } else {
            console.log(`✅ 已有 ${serviceResult.rows.length} 个客服链接`);
        }
        
        // 检查是否有设置
        const settingsResult = await pool.query('SELECT * FROM settings');
        if (settingsResult.rows.length === 0) {
            await pool.query(
                `INSERT INTO settings (store_name, kuaishou_link, contact_info, welcome_message, 
                 custom_link1_name, custom_link1, custom_link2_name, custom_link2) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    'CPMCY商城',
                    'https://v.kuaishou.com/JGv00n48',
                    'FB账号GH Tree',
                    '欢迎选购！点击购买扫码完成付款',
                    '自定义链接1',
                    'https://example.com',
                    '自定义链接2',
                    'https://example2.com'
                ]
            );
            console.log('✅ 添加了默认设置和自定义链接');
        }
        
        console.log('🎉 数据库初始化完成！');
    } catch (error) {
        console.error('❌ 数据库初始化失败:');
        console.error('错误信息:', error.message);
        console.error('错误详情:', error);
        process.exit(1);
    }
}

// ========== API路由 ==========

// 1. 健康检查
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'CPMCY商城服务器运行正常',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        database: 'PostgreSQL'
    });
});

// 2. 用户认证相关API
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1 AND password = $2',
            [username, password]
        );
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const { password, ...userWithoutPassword } = user;
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
        res.status(500).json({
            success: false,
            error: '服务器内部错误: ' + error.message
        });
    }
});

// 3. 商品相关API
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY id DESC');
        res.json({
            success: true,
            data: result.rows,
            count: result.rowCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: '获取商品列表失败: ' + error.message
        });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const { name, price, description, image_url, custom_image_url } = req.body;
        
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
            `INSERT INTO products (name, price, description, image_url, custom_image_url) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING *`,
            [name, priceNum, description || '', image_url || 'https://via.placeholder.com/300x200?text=商品', custom_image_url || '']
        );
        
        res.json({
            success: true,
            data: result.rows[0],
            message: '商品添加成功'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: '添加商品失败: ' + error.message
        });
    }
});

// 4. 订单相关API
app.get('/api/orders', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
        res.json({
            success: true,
            data: result.rows,
            count: result.rowCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: '获取订单列表失败: ' + error.message
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
            remark,
            status = 'pending'
        } = req.body;
        
        const result = await pool.query(
            `INSERT INTO orders (
                order_number, user_id, product_id, product_name, 
                product_price, total_amount, payment_method, remark, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
            RETURNING *`,
            [
                orderNumber, 
                userId || 'anonymous', 
                productId || 0,
                productName || '未知商品',
                parseFloat(productPrice) || 0,
                parseFloat(totalAmount) || 0,
                paymentMethod || 'tng',
                remark || '',
                status
            ]
        );
        
        res.json({
            success: true,
            data: result.rows[0],
            message: '订单创建成功'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: '创建订单失败: ' + error.message
        });
    }
});

// 5. 客服相关API - 新增功能
app.get('/api/customer-service', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM customer_service WHERE enabled = true ORDER BY sort_order'
        );
        
        res.json({
            success: true,
            data: result.rows,
            count: result.rowCount,
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: '获取客服信息失败'
        });
    }
});

app.post('/api/customer-service', async (req, res) => {
    try {
        const { icon, name, description, url, custom_image } = req.body;
        
        if (!name || !url) {
            return res.status(400).json({
                success: false,
                error: '客服名称和链接不能为空'
            });
        }
        
        const result = await pool.query(
            `INSERT INTO customer_service (icon, name, description, url, custom_image) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING *`,
            [
                icon || '💬',
                name,
                description || '',
                url,
                custom_image || ''
            ]
        );
        
        res.json({
            success: true,
            data: result.rows[0],
            message: '客服链接添加成功'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: '添加客服链接失败'
        });
    }
});

app.put('/api/customer-service/:id', async (req, res) => {
    try {
        const serviceId = req.params.id;
        const { icon, name, description, url, custom_image, enabled, sort_order } = req.body;
        
        const result = await pool.query(
            `UPDATE customer_service 
             SET icon = $1, name = $2, description = $3, url = $4, custom_image = $5, 
                 enabled = $6, sort_order = $7
             WHERE id = $8 
             RETURNING *`,
            [
                icon || '💬',
                name,
                description || '',
                url,
                custom_image || '',
                enabled !== false,
                sort_order || 0,
                serviceId
            ]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: '客服链接不存在'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0],
            message: '客服链接更新成功'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: '更新客服链接失败'
        });
    }
});

app.delete('/api/customer-service/:id', async (req, res) => {
    try {
        const serviceId = req.params.id;
        
        const result = await pool.query(
            'DELETE FROM customer_service WHERE id = $1 RETURNING *',
            [serviceId]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: '客服链接不存在'
            });
        }
        
        res.json({
            success: true,
            message: '客服链接删除成功'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: '删除客服链接失败'
        });
    }
});

// 6. 设置相关API - 增强功能
app.get('/api/settings', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM settings LIMIT 1');
        
        if (result.rows.length === 0) {
            // 创建默认设置
            await pool.query(
                `INSERT INTO settings (store_name, kuaishou_link) 
                 VALUES ($1, $2)`,
                ['CPMCY商城', 'https://v.kuaishou.com/JGv00n48']
            );
            const newResult = await pool.query('SELECT * FROM settings LIMIT 1');
            return res.json({
                success: true,
                data: newResult.rows[0]
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: '获取设置失败'
        });
    }
});

app.put('/api/settings', async (req, res) => {
    try {
        const { 
            store_name, 
            store_logo, 
            store_banner, 
            kuaishou_link, 
            contact_info, 
            welcome_message,
            custom_link1, 
            custom_link1_name,
            custom_link2, 
            custom_link2_name,
            custom_image1,
            custom_image2
        } = req.body;
        
        // 检查是否有现有设置
        const checkResult = await pool.query('SELECT * FROM settings LIMIT 1');
        
        if (checkResult.rows.length === 0) {
            // 创建新设置
            const result = await pool.query(
                `INSERT INTO settings (
                    store_name, store_logo, store_banner, kuaishou_link, contact_info, welcome_message,
                    custom_link1, custom_link1_name, custom_link2, custom_link2_name, custom_image1, custom_image2
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
                RETURNING *`,
                [
                    store_name || 'CPMCY商城',
                    store_logo || '',
                    store_banner || '',
                    kuaishou_link || '',
                    contact_info || '',
                    welcome_message || '',
                    custom_link1 || '',
                    custom_link1_name || '',
                    custom_link2 || '',
                    custom_link2_name || '',
                    custom_image1 || '',
                    custom_image2 || ''
                ]
            );
            
            return res.json({
                success: true,
                data: result.rows[0],
                message: '设置保存成功'
            });
        }
        
        // 更新现有设置
        const result = await pool.query(
            `UPDATE settings 
             SET store_name = $1, store_logo = $2, store_banner = $3, kuaishou_link = $4, 
                 contact_info = $5, welcome_message = $6, custom_link1 = $7, custom_link1_name = $8,
                 custom_link2 = $9, custom_link2_name = $10, custom_image1 = $11, custom_image2 = $12,
                 updated_at = CURRENT_TIMESTAMP 
             RETURNING *`,
            [
                store_name || checkResult.rows[0].store_name,
                store_logo || checkResult.rows[0].store_logo,
                store_banner || checkResult.rows[0].store_banner,
                kuaishou_link || checkResult.rows[0].kuaishou_link,
                contact_info || checkResult.rows[0].contact_info,
                welcome_message || checkResult.rows[0].welcome_message,
                custom_link1 || checkResult.rows[0].custom_link1,
                custom_link1_name || checkResult.rows[0].custom_link1_name,
                custom_link2 || checkResult.rows[0].custom_link2,
                custom_link2_name || checkResult.rows[0].custom_link2_name,
                custom_image1 || checkResult.rows[0].custom_image1,
                custom_image2 || checkResult.rows[0].custom_image2
            ]
        );
        
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

// 7. 首页服务
app.get('/', (req, res) => {
    console.log('🏠 首页请求');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 8. 处理404错误
app.use((req, res) => {
    console.log(`❌ 404 Not Found: ${req.method} ${req.url}`);
    res.status(404).json({
        success: false,
        error: 'API端点不存在'
    });
});

// ========== 启动服务器 ==========
async function startServer() {
    try {
        console.log('🚀 正在启动服务器...');
        console.log('=========================================================');
        
        // 初始化数据库
        await initializeDatabase();
        
        // 启动服务器
        app.listen(PORT, () => {
            console.log(`
=========================================================
🎉 CPMCY商城服务器已启动!
=========================================================

📡 服务器地址: http://localhost:${PORT}
🌐 局域网访问: http://[您的IP地址]:${PORT}

💾 存储模式: PostgreSQL数据库
👨‍💼 管理员账户:
   用户名: admin
   密码: admin123

📋 新增功能:
1. 客服链接管理
   - GET /api/customer-service        获取客服列表
   - POST /api/customer-service       添加客服链接
   - PUT /api/customer-service/:id    更新客服链接
   - DELETE /api/customer-service/:id 删除客服链接

2. 自定义设置增强
   - 店铺Logo和横幅图片
   - 两个自定义链接和链接名称
   - 两个自定义图片
   - 商品支持自定义图片链接

3. 环境变量验证
   - 必须设置 DATABASE_URL
   - 支持 SSL 配置

=========================================================
            `);
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
