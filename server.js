// server.js - CPMCY商城完整后端（修复版）
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;

// ========== 数据库连接修复 ==========
console.log('🔗 正在初始化数据库连接...');

// 检查环境变量
if (!process.env.DATABASE_URL) {
    console.error('❌ 错误: 缺少 DATABASE_URL 环境变量');
    console.log('💡 请在项目根目录创建 .env 文件，内容如下:');
    console.log('DATABASE_URL=postgresql://username:password@localhost:5432/cpmcy_db');
    console.log('PORT=3000');
    process.exit(1);
}

console.log('📋 数据库URL:', process.env.DATABASE_URL.replace(/:[^:]*@/, ':****@'));

// PostgreSQL连接池配置
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000, // 增加到10秒
});

// 测试数据库连接
pool.on('connect', () => {
    console.log('✅ 数据库连接成功');
});

pool.on('error', (err) => {
    console.error('❌ 数据库连接错误:', err.message);
});

// 中间件
app.use(cors({
    origin: '*', // 允许所有来源，正式环境应该限制
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

// 添加请求日志中间件
app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.url} - ${new Date().toLocaleTimeString()}`);
    next();
});

// 语音文件目录
const VOICE_DIR = path.join(__dirname, 'voices');

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
        
        // 创建选手表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS players (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                image TEXT,
                voice_file TEXT,
                has_voice BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ 选手表创建/检查完成');
        
        // 创建客服链接表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS customer_service (
                id SERIAL PRIMARY KEY,
                icon VARCHAR(10),
                name VARCHAR(100) NOT NULL,
                description VARCHAR(255),
                url TEXT NOT NULL,
                enabled BOOLEAN DEFAULT TRUE,
                sort_order INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ 客服表创建/检查完成');
        
        // 创建设置表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS settings (
                id SERIAL PRIMARY KEY,
                store_name VARCHAR(255) DEFAULT 'CPMCY商城',
                kuaishou_link TEXT,
                banner_image TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ 设置表创建/检查完成');
        
        // 检查是否有管理员用户
        const adminResult = await pool.query('SELECT * FROM users WHERE username = $1', ['Liew1201']);
        if (adminResult.rows.length === 0) {
            await pool.query(
                'INSERT INTO users (username, password, is_admin) VALUES ($1, $2, $3)',
                ['Liew1201', 'Liew1201', true]
            );
            console.log('✅ 默认管理员账户已创建: Liew1201/Liew1201');
        } else {
            console.log('✅ 管理员账户已存在');
        }
        
        // 检查是否有商品
        const productResult = await pool.query('SELECT * FROM products');
        if (productResult.rows.length === 0) {
            await pool.query(
                `INSERT INTO products (name, price, description, image) 
                 VALUES 
                 ('示例商品1', 99.99, '这是一个示例商品描述', 'https://via.placeholder.com/300x200?text=商品1'),
                 ('示例商品2', 199.99, '这是另一个示例商品描述', 'https://via.placeholder.com/300x200?text=商品2')`
            );
            console.log('✅ 添加了2个示例商品');
        } else {
            console.log(`✅ 已有 ${productResult.rows.length} 个商品`);
        }
        
        // 检查是否有选手
        const playerResult = await pool.query('SELECT * FROM players');
        if (playerResult.rows.length === 0) {
            await pool.query(
                'INSERT INTO players (name, description, image) VALUES ($1, $2, $3)',
                ['选手示例', '这是一个选手示例', 'https://via.placeholder.com/200x200?text=选手']
            );
            console.log('✅ 添加了示例选手');
        }
        
        // 检查是否有设置
        const settingsResult = await pool.query('SELECT * FROM settings');
        if (settingsResult.rows.length === 0) {
            await pool.query(
                'INSERT INTO settings (store_name) VALUES ($1)',
                ['CPMCY商城']
            );
            console.log('✅ 添加了默认设置');
        }
        
        // 检查是否有客服链接
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
        }
        
        // 创建语音目录
        await fs.mkdir(VOICE_DIR, { recursive: true });
        console.log('✅ 语音目录创建完成');
        
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
    console.log('🩺 健康检查请求');
    res.json({
        success: true,
        message: 'CPMCY商城服务器运行正常',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        database: 'PostgreSQL'
    });
});

// 2. 用户认证相关API
app.post('/api/login', async (req, res) => {
    console.log('🔐 登录请求:', req.body.username);
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: '用户名和密码不能为空'
            });
        }
        
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1 AND password = $2',
            [username, password]
        );
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const { password, ...userWithoutPassword } = user;
            console.log(`✅ 用户 ${username} 登录成功`);
            res.json({
                success: true,
                data: userWithoutPassword,
                message: '登录成功'
            });
        } else {
            console.log(`❌ 用户 ${username} 登录失败: 用户名或密码错误`);
            res.status(401).json({
                success: false,
                error: '用户名或密码错误'
            });
        }
    } catch (error) {
        console.error('登录失败:', error);
        res.status(500).json({
            success: false,
            error: '服务器内部错误: ' + error.message
        });
    }
});

app.post('/api/register', async (req, res) => {
    console.log('📝 注册请求:', req.body.username);
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: '用户名和密码不能为空'
            });
        }
        
        // 检查用户名是否已存在
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
            'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *',
            [username, password]
        );
        
        const user = result.rows[0];
        const { password: _, ...userWithoutPassword } = user;
        console.log(`✅ 用户 ${username} 注册成功`);
        res.json({
            success: true,
            data: userWithoutPassword,
            message: '注册成功'
        });
    } catch (error) {
        console.error('注册失败:', error);
        res.status(500).json({
            success: false,
            error: '服务器内部错误: ' + error.message
        });
    }
});

// 3. 商品相关API - 关键修复部分
app.get('/api/products', async (req, res) => {
    console.log('📦 获取商品列表请求');
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY id DESC');
        console.log(`✅ 返回 ${result.rows.length} 个商品`);
        res.json({
            success: true,
            data: result.rows,
            count: result.rowCount
        });
    } catch (error) {
        console.error('获取商品失败:', error);
        res.status(500).json({
            success: false,
            error: '获取商品列表失败: ' + error.message
        });
    }
});

app.post('/api/products', async (req, res) => {
    console.log('➕ 添加商品请求');
    console.log('请求数据:', JSON.stringify(req.body, null, 2));
    
    try {
        const { name, price, description, image } = req.body;
        
        console.log(`商品名称: ${name}, 价格: ${price}`);
        
        if (!name || !price) {
            console.log('❌ 商品名称或价格不能为空');
            return res.status(400).json({
                success: false,
                error: '商品名称和价格不能为空'
            });
        }
        
        const priceNum = parseFloat(price);
        if (isNaN(priceNum) || priceNum <= 0) {
            console.log('❌ 价格无效:', price);
            return res.status(400).json({
                success: false,
                error: '请输入有效的价格（大于0的数字）'
            });
        }
        
        console.log('正在插入数据库...');
        const result = await pool.query(
            `INSERT INTO products (name, price, description, image) 
             VALUES ($1, $2, $3, $4) 
             RETURNING *`,
            [name, priceNum, description || '', image || 'https://via.placeholder.com/300x200?text=商品']
        );
        
        console.log(`✅ 商品添加成功: ${name} (ID: ${result.rows[0].id})`);
        res.json({
            success: true,
            data: result.rows[0],
            message: '商品添加成功'
        });
    } catch (error) {
        console.error('添加商品失败:', error);
        console.error('错误详情:', error.stack);
        res.status(500).json({
            success: false,
            error: '添加商品失败: ' + error.message
        });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    console.log(`🗑️ 删除商品请求: ID=${req.params.id}`);
    try {
        const productId = parseInt(req.params.id);
        
        const result = await pool.query(
            'DELETE FROM products WHERE id = $1 RETURNING *',
            [productId]
        );
        
        if (result.rowCount === 0) {
            console.log(`❌ 商品不存在: ID=${productId}`);
            return res.status(404).json({
                success: false,
                error: '商品不存在'
            });
        }
        
        console.log(`✅ 商品删除成功: ID=${productId}`);
        res.json({
            success: true,
            message: '商品删除成功'
        });
    } catch (error) {
        console.error('删除商品失败:', error);
        res.status(500).json({
            success: false,
            error: '删除商品失败: ' + error.message
        });
    }
});

// 4. 订单相关API
app.get('/api/orders', async (req, res) => {
    console.log('📋 获取订单列表请求');
    try {
        const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
        console.log(`✅ 返回 ${result.rows.length} 个订单`);
        res.json({
            success: true,
            data: result.rows,
            count: result.rowCount
        });
    } catch (error) {
        console.error('获取订单失败:', error);
        res.status(500).json({
            success: false,
            error: '获取订单列表失败: ' + error.message
        });
    }
});

app.post('/api/orders', async (req, res) => {
    console.log('🛒 创建订单请求');
    console.log('订单数据:', req.body);
    
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
        
        if (!orderNumber) {
            return res.status(400).json({
                success: false,
                error: '订单号不能为空'
            });
        }
        
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
        
        console.log(`✅ 订单创建成功: ${orderNumber}`);
        res.json({
            success: true,
            data: result.rows[0],
            message: '订单创建成功'
        });
    } catch (error) {
        console.error('创建订单失败:', error);
        res.status(500).json({
            success: false,
            error: '创建订单失败: ' + error.message
        });
    }
});

app.put('/api/orders/:id/status', async (req, res) => {
    console.log(`🔄 更新订单状态: ID=${req.params.id}, 状态=${req.body.status}`);
    try {
        const orderId = parseInt(req.params.id);
        const { status } = req.body;
        
        const result = await pool.query(
            'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [status, orderId]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: '订单不存在'
            });
        }
        
        console.log(`✅ 订单状态更新成功: ID=${orderId} -> ${status}`);
        res.json({
            success: true,
            data: result.rows[0],
            message: '订单状态更新成功'
        });
    } catch (error) {
        console.error('更新订单状态失败:', error);
        res.status(500).json({
            success: false,
            error: '更新订单状态失败: ' + error.message
        });
    }
});

// 5. 选手相关API
app.get('/api/players', async (req, res) => {
    console.log('👥 获取选手列表请求');
    try {
        const result = await pool.query('SELECT * FROM players ORDER BY id DESC');
        console.log(`✅ 返回 ${result.rows.length} 个选手`);
        res.json({
            success: true,
            data: result.rows,
            count: result.rowCount
        });
    } catch (error) {
        console.error('获取选手失败:', error);
        res.status(500).json({
            success: false,
            error: '获取选手列表失败: ' + error.message
        });
    }
});

app.post('/api/players', async (req, res) => {
    console.log('➕ 添加选手请求');
    try {
        const { name, description, image, audio } = req.body;
        
        if (!name) {
            return res.status(400).json({
                success: false,
                error: '选手名称不能为空'
            });
        }
        
        // 处理语音文件
        let voiceFile = '';
        let hasVoice = false;
        
        if (audio && audio.trim() !== '') {
            try {
                // 移除Base64前缀
                const base64String = audio.replace(/^data:audio\/\w+;base64,/, '');
                const timestamp = Date.now();
                const filename = `voice_${timestamp}.webm`;
                const filepath = path.join(VOICE_DIR, filename);
                
                await fs.writeFile(filepath, base64String, 'base64');
                voiceFile = `/api/voices/${filename}`;
                hasVoice = true;
                console.log(`✅ 语音文件保存成功: ${filename}`);
            } catch (error) {
                console.error('保存语音文件失败:', error);
            }
        }
        
        const result = await pool.query(
            `INSERT INTO players (name, description, image, voice_file, has_voice) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING *`,
            [
                name, 
                description || '', 
                image || 'https://via.placeholder.com/200x200?text=选手',
                voiceFile,
                hasVoice
            ]
        );
        
        console.log(`✅ 选手添加成功: ${name} (ID: ${result.rows[0].id})`);
        res.json({
            success: true,
            data: result.rows[0],
            message: '选手添加成功'
        });
    } catch (error) {
        console.error('添加选手失败:', error);
        res.status(500).json({
            success: false,
            error: '添加选手失败: ' + error.message
        });
    }
});

app.delete('/api/players/:id', async (req, res) => {
    console.log(`🗑️ 删除选手请求: ID=${req.params.id}`);
    try {
        const playerId = parseInt(req.params.id);
        
        // 获取选手信息以删除语音文件
        const playerResult = await pool.query(
            'SELECT * FROM players WHERE id = $1',
            [playerId]
        );
        
        if (playerResult.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: '选手不存在'
            });
        }
        
        const player = playerResult.rows[0];
        
        // 删除关联的语音文件
        if (player.voice_file) {
            try {
                const filename = player.voice_file.split('/').pop();
                const voicePath = path.join(VOICE_DIR, filename);
                await fs.unlink(voicePath);
                console.log(`🗑️ 删除语音文件: ${filename}`);
            } catch (error) {
                console.error('删除语音文件失败:', error);
            }
        }
        
        // 删除选手记录
        await pool.query('DELETE FROM players WHERE id = $1', [playerId]);
        
        console.log(`✅ 选手删除成功: ID=${playerId}`);
        res.json({
            success: true,
            message: '选手删除成功'
        });
    } catch (error) {
        console.error('删除选手失败:', error);
        res.status(500).json({
            success: false,
            error: '删除选手失败: ' + error.message
        });
    }
});

// 6. 语音文件服务
app.get('/api/voices/:filename', async (req, res) => {
    console.log(`🔊 获取语音文件: ${req.params.filename}`);
    try {
        const filename = req.params.filename;
        const filepath = path.join(VOICE_DIR, filename);
        
        // 检查文件是否存在
        try {
            await fs.access(filepath);
        } catch {
            return res.status(404).json({
                success: false,
                error: '语音文件不存在'
            });
        }
        
        res.setHeader('Content-Type', 'audio/webm');
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        res.sendFile(filepath);
    } catch (error) {
        console.error('获取语音文件失败:', error);
        res.status(500).json({
            success: false,
            error: '获取语音文件失败'
        });
    }
});

// 7. 客服相关API
app.get('/api/customer-service', async (req, res) => {
    console.log('💬 获取客服链接请求');
    try {
        const result = await pool.query(
            'SELECT * FROM customer_service WHERE enabled = true ORDER BY sort_order'
        );
        
        console.log(`✅ 返回 ${result.rows.length} 个客服链接`);
        res.json({
            success: true,
            data: result.rows,
            count: result.rowCount,
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('获取客服信息失败:', error);
        res.status(500).json({
            success: false,
            error: '获取客服信息失败'
        });
    }
});

app.put('/api/customer-service', async (req, res) => {
    console.log('💾 更新客服链接请求');
    try {
        const { links } = req.body;
        
        if (!Array.isArray(links)) {
            return res.status(400).json({
                success: false,
                error: '客服链接数据格式不正确'
            });
        }
        
        // 清空现有数据
        await pool.query('DELETE FROM customer_service');
        
        // 插入新数据
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            await pool.query(
                `INSERT INTO customer_service (icon, name, description, url, enabled, sort_order) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    link.icon || '💬',
                    link.name || `客服${i + 1}`,
                    link.description || '',
                    link.url || '',
                    link.enabled !== false,
                    i
                ]
            );
        }
        
        const result = await pool.query('SELECT * FROM customer_service ORDER BY sort_order');
        
        console.log(`✅ 客服链接保存成功: ${result.rows.length} 个链接`);
        res.json({
            success: true,
            data: result.rows,
            message: '客服链接保存成功',
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('保存客服链接失败:', error);
        res.status(500).json({
            success: false,
            error: '保存客服链接失败'
        });
    }
});

// 8. 设置相关API
app.get('/api/settings', async (req, res) => {
    console.log('⚙️ 获取设置请求');
    try {
        const result = await pool.query('SELECT * FROM settings LIMIT 1');
        
        if (result.rows.length === 0) {
            // 创建默认设置
            await pool.query(
                'INSERT INTO settings (store_name) VALUES ($1)',
                ['CPMCY商城']
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
        console.error('获取设置失败:', error);
        res.status(500).json({
            success: false,
            error: '获取设置失败'
        });
    }
});

app.put('/api/settings', async (req, res) => {
    console.log('💾 更新设置请求');
    try {
        const { storeName, kuaishouLink, bannerImage } = req.body;
        
        // 检查是否有现有设置
        const checkResult = await pool.query('SELECT * FROM settings LIMIT 1');
        
        if (checkResult.rows.length === 0) {
            // 创建新设置
            const result = await pool.query(
                `INSERT INTO settings (store_name, kuaishou_link, banner_image) 
                 VALUES ($1, $2, $3) 
                 RETURNING *`,
                [storeName || 'CPMCY商城', kuaishouLink || '', bannerImage || '']
            );
            
            console.log(`✅ 设置创建成功: ${storeName}`);
            return res.json({
                success: true,
                data: result.rows[0],
                message: '设置保存成功'
            });
        }
        
        // 更新现有设置
        const result = await pool.query(
            `UPDATE settings 
             SET store_name = $1, kuaishou_link = $2, banner_image = $3, updated_at = CURRENT_TIMESTAMP 
             RETURNING *`,
            [storeName || checkResult.rows[0].store_name, 
             kuaishouLink || checkResult.rows[0].kuaishou_link, 
             bannerImage || checkResult.rows[0].banner_image]
        );
        
        console.log(`✅ 设置更新成功: ${storeName}`);
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

// 9. 数据备份API
app.get('/api/backup', async (req, res) => {
    console.log('💾 数据备份请求');
    try {
        const [
            usersResult,
            productsResult,
            ordersResult,
            playersResult,
            settingsResult,
            serviceResult
        ] = await Promise.all([
            pool.query('SELECT * FROM users'),
            pool.query('SELECT * FROM products'),
            pool.query('SELECT * FROM orders'),
            pool.query('SELECT * FROM players'),
            pool.query('SELECT * FROM settings'),
            pool.query('SELECT * FROM customer_service')
        ]);
        
        const backupData = {
            timestamp: new Date().toISOString(),
            version: '2.0.0',
            users: usersResult.rows,
            products: productsResult.rows,
            orders: ordersResult.rows,
            players: playersResult.rows,
            settings: settingsResult.rows,
            customerService: serviceResult.rows
        };
        
        const backupJson = JSON.stringify(backupData, null, 2);
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="cpmcy_backup_${Date.now()}.json"`);
        res.send(backupJson);
        
        console.log('✅ 数据备份成功');
    } catch (error) {
        console.error('备份数据失败:', error);
        res.status(500).json({
            success: false,
            error: '备份数据失败'
        });
    }
});

// 10. 首页服务
app.get('/', (req, res) => {
    console.log('🏠 首页请求');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 11. 静态文件服务（语音文件）
app.use('/voices', express.static(VOICE_DIR));

// 12. 处理404错误
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

👨‍💼 管理员账户:
   用户名: Liew1201
   密码: Liew1201

📋 快速测试:
1. 打开浏览器访问: http://localhost:${PORT}
2. 登录管理员账户
3. 添加商品测试

🔧 调试信息:
- 所有API请求都会在终端显示日志
- 数据库错误会详细显示
- 前端网络错误请检查浏览器控制台(F12)

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

// 优雅关闭
process.on('SIGTERM', () => {
    console.log('👋 正在关闭服务器...');
    pool.end();
    process.exit(0);
});

// 启动服务器
startServer();
