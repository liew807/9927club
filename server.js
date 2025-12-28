// server.js - CPMCY商城完整后端（PostgreSQL版本）
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;

// 环境变量验证
if (!process.env.DATABASE_URL) {
    console.error('❌ 缺少必需的环境变量: DATABASE_URL');
    console.log('请设置 PostgreSQL 数据库连接URL：');
    console.log('DATABASE_URL=postgresql://username:password@localhost:5432/database_name');
    console.log('或者使用Heroku等云服务的DATABASE_URL');
    process.exit(1);
}

// PostgreSQL连接池配置
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

// 语音文件目录
const VOICE_DIR = path.join(__dirname, 'voices');

// ========== 数据库初始化 ==========
async function initializeDatabase() {
    try {
        console.log('🔄 初始化数据库...');
        
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
        
        // 检查是否有管理员用户
        const adminResult = await pool.query('SELECT * FROM users WHERE username = $1', ['Liew1201']);
        if (adminResult.rows.length === 0) {
            await pool.query(
                'INSERT INTO users (username, password, is_admin) VALUES ($1, $2, $3)',
                ['Liew1201', 'Liew1201', true]
            );
            console.log('✅ 默认管理员账户已创建: Liew1201/Liew1201');
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
        }
        
        // 检查是否有选手
        const playerResult = await pool.query('SELECT * FROM players');
        if (playerResult.rows.length === 0) {
            await pool.query(
                'INSERT INTO players (name, description, image) VALUES ($1, $2, $3)',
                ['选手示例', '这是一个选手示例', 'https://via.placeholder.com/200x200?text=选手']
            );
        }
        
        // 检查是否有设置
        const settingsResult = await pool.query('SELECT * FROM settings');
        if (settingsResult.rows.length === 0) {
            await pool.query(
                'INSERT INTO settings (store_name) VALUES ($1)',
                ['CPMCY商城']
            );
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
        }
        
        // 创建语音目录
        await fs.mkdir(VOICE_DIR, { recursive: true });
        
        console.log('✅ 数据库初始化完成');
    } catch (error) {
        console.error('❌ 数据库初始化失败:', error);
    }
}

// 处理Base64语音数据并保存为文件
async function saveVoiceFile(base64Data, playerId) {
    try {
        if (!base64Data || base64Data.trim() === '') {
            return { success: true, voiceFile: '', message: '无语音数据' };
        }
        
        // 移除Base64前缀
        const base64String = base64Data.replace(/^data:audio\/\w+;base64,/, '');
        
        // 生成文件名
        const timestamp = Date.now();
        const filename = `voice_${playerId}_${timestamp}.webm`;
        const filepath = path.join(VOICE_DIR, filename);
        
        // 保存文件
        await fs.writeFile(filepath, base64String, 'base64');
        
        console.log(`✅ 语音文件保存成功: ${filename}`);
        return {
            success: true,
            voiceFile: `/api/voices/${filename}`,
            filename: filename
        };
    } catch (error) {
        console.error('保存语音文件失败:', error);
        return {
            success: false,
            voiceFile: '',
            message: '保存语音文件失败'
        };
    }
}

// ========== API路由 ==========

// 1. 健康检查
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'CPMCY商城服务器运行正常',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
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
        console.error('登录失败:', error);
        res.status(500).json({
            success: false,
            error: '服务器内部错误'
        });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
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
        res.json({
            success: true,
            data: userWithoutPassword,
            message: '注册成功'
        });
    } catch (error) {
        console.error('注册失败:', error);
        res.status(500).json({
            success: false,
            error: '服务器内部错误'
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
        console.error('获取商品失败:', error);
        res.status(500).json({
            success: false,
            error: '获取商品列表失败'
        });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const { name, price, description, image } = req.body;
        
        if (!name || !price) {
            return res.status(400).json({
                success: false,
                error: '商品名称和价格不能为空'
            });
        }
        
        const result = await pool.query(
            `INSERT INTO products (name, price, description, image) 
             VALUES ($1, $2, $3, $4) 
             RETURNING *`,
            [name, parseFloat(price), description || '', image || 'https://via.placeholder.com/300x200?text=商品']
        );
        
        res.json({
            success: true,
            data: result.rows[0],
            message: '商品添加成功'
        });
    } catch (error) {
        console.error('添加商品失败:', error);
        res.status(500).json({
            success: false,
            error: '添加商品失败'
        });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        
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
        
        res.json({
            success: true,
            message: '商品删除成功'
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
        const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
        res.json({
            success: true,
            data: result.rows,
            count: result.rowCount
        });
    } catch (error) {
        console.error('获取订单失败:', error);
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
                orderNumber, userId, productId, productName,
                parseFloat(productPrice), parseFloat(totalAmount),
                paymentMethod, remark || '', status
            ]
        );
        
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
        
        res.json({
            success: true,
            data: result.rows[0],
            message: '订单状态更新成功'
        });
    } catch (error) {
        console.error('更新订单状态失败:', error);
        res.status(500).json({
            success: false,
            error: '更新订单状态失败'
        });
    }
});

// 5. 选手相关API
app.get('/api/players', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM players ORDER BY id DESC');
        res.json({
            success: true,
            data: result.rows,
            count: result.rowCount
        });
    } catch (error) {
        console.error('获取选手失败:', error);
        res.status(500).json({
            success: false,
            error: '获取选手列表失败'
        });
    }
});

app.post('/api/players', async (req, res) => {
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
            const voiceResult = await saveVoiceFile(audio, 0); // 临时ID
            if (voiceResult.success && voiceResult.voiceFile) {
                voiceFile = voiceResult.voiceFile;
                hasVoice = true;
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
        
        // 更新语音文件的player_id
        if (voiceFile) {
            const player = result.rows[0];
            const filename = voiceFile.split('/').pop();
            const newFilepath = path.join(VOICE_DIR, `voice_${player.id}_${Date.now()}.webm`);
            const oldFilepath = path.join(VOICE_DIR, filename);
            
            try {
                await fs.rename(oldFilepath, newFilepath);
                const newVoiceFile = `/api/voices/voice_${player.id}_${Date.now()}.webm`;
                await pool.query(
                    'UPDATE players SET voice_file = $1 WHERE id = $2',
                    [newVoiceFile, player.id]
                );
                result.rows[0].voice_file = newVoiceFile;
            } catch (error) {
                console.error('重命名语音文件失败:', error);
            }
        }
        
        res.json({
            success: true,
            data: result.rows[0],
            message: '选手添加成功'
        });
    } catch (error) {
        console.error('添加选手失败:', error);
        res.status(500).json({
            success: false,
            error: '添加选手失败'
        });
    }
});

app.delete('/api/players/:id', async (req, res) => {
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
        
        res.json({
            success: true,
            message: '选手删除成功'
        });
    } catch (error) {
        console.error('删除选手失败:', error);
        res.status(500).json({
            success: false,
            error: '删除选手失败'
        });
    }
});

// 6. 语音文件服务
app.get('/api/voices/:filename', async (req, res) => {
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
        
        // 设置正确的Content-Type
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
        console.error('获取客服信息失败:', error);
        res.status(500).json({
            success: false,
            error: '获取客服信息失败'
        });
    }
});

app.put('/api/customer-service', async (req, res) => {
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
    } catch (error) {
        console.error('备份数据失败:', error);
        res.status(500).json({
            success: false,
            error: '备份数据失败'
        });
    }
});

// 10. 数据恢复API
app.post('/api/restore', async (req, res) => {
    try {
        const { backupData } = req.body;
        
        if (!backupData) {
            return res.status(400).json({
                success: false,
                error: '备份数据不能为空'
            });
        }
        
        // 开始事务
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // 清空所有表
            await client.query('DELETE FROM customer_service');
            await client.query('DELETE FROM players');
            await client.query('DELETE FROM orders');
            await client.query('DELETE FROM products');
            await client.query('DELETE FROM users');
            await client.query('DELETE FROM settings');
            
            // 恢复用户数据
            if (backupData.users && Array.isArray(backupData.users)) {
                for (const user of backupData.users) {
                    await client.query(
                        'INSERT INTO users (id, username, password, is_admin, created_at) VALUES ($1, $2, $3, $4, $5)',
                        [user.id, user.username, user.password, user.is_admin || false, user.created_at]
                    );
                }
                // 重置序列
                await client.query("SELECT setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users), 0) + 1)");
            }
            
            // 恢复商品数据
            if (backupData.products && Array.isArray(backupData.products)) {
                for (const product of backupData.products) {
                    await client.query(
                        'INSERT INTO products (id, name, price, description, image, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
                        [product.id, product.name, product.price, product.description, product.image, product.created_at]
                    );
                }
                await client.query("SELECT setval('products_id_seq', COALESCE((SELECT MAX(id) FROM products), 0) + 1)");
            }
            
            // 恢复订单数据
            if (backupData.orders && Array.isArray(backupData.orders)) {
                for (const order of backupData.orders) {
                    await client.query(
                        `INSERT INTO orders (id, order_number, user_id, product_id, product_name, 
                         product_price, total_amount, payment_method, remark, status, created_at, updated_at) 
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                        [
                            order.id, order.order_number, order.user_id, order.product_id,
                            order.product_name, order.product_price, order.total_amount,
                            order.payment_method, order.remark, order.status,
                            order.created_at, order.updated_at
                        ]
                    );
                }
                await client.query("SELECT setval('orders_id_seq', COALESCE((SELECT MAX(id) FROM orders), 0) + 1)");
            }
            
            // 恢复选手数据
            if (backupData.players && Array.isArray(backupData.players)) {
                for (const player of backupData.players) {
                    await client.query(
                        'INSERT INTO players (id, name, description, image, voice_file, has_voice, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                        [
                            player.id, player.name, player.description, player.image,
                            player.voice_file, player.has_voice, player.created_at
                        ]
                    );
                }
                await client.query("SELECT setval('players_id_seq', COALESCE((SELECT MAX(id) FROM players), 0) + 1)");
            }
            
            // 恢复设置数据
            if (backupData.settings && Array.isArray(backupData.settings)) {
                for (const setting of backupData.settings) {
                    await client.query(
                        'INSERT INTO settings (id, store_name, kuaishou_link, banner_image, updated_at) VALUES ($1, $2, $3, $4, $5)',
                        [setting.id, setting.store_name, setting.kuaishou_link, setting.banner_image, setting.updated_at]
                    );
                }
                await client.query("SELECT setval('settings_id_seq', COALESCE((SELECT MAX(id) FROM settings), 0) + 1)");
            }
            
            // 恢复客服数据
            if (backupData.customerService && Array.isArray(backupData.customerService)) {
                for (const service of backupData.customerService) {
                    await client.query(
                        `INSERT INTO customer_service (id, icon, name, description, url, enabled, sort_order, updated_at) 
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [
                            service.id, service.icon, service.name, service.description,
                            service.url, service.enabled !== false, service.sort_order || 0,
                            service.updated_at
                        ]
                    );
                }
                await client.query("SELECT setval('customer_service_id_seq', COALESCE((SELECT MAX(id) FROM customer_service), 0) + 1)");
            }
            
            await client.query('COMMIT');
            
            res.json({
                success: true,
                message: '数据恢复成功'
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('恢复数据失败:', error);
        res.status(500).json({
            success: false,
            error: '恢复数据失败'
        });
    }
});

// 11. 首页服务
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 12. 静态文件服务（语音文件）
app.use('/voices', express.static(VOICE_DIR));

// ========== 启动服务器 ==========
async function startServer() {
    try {
        await initializeDatabase();
        
        app.listen(PORT, () => {
            console.log(`
=========================================================
🚀 CPMCY商城服务器已启动!
=========================================================

📡 服务器地址: http://localhost:${PORT}
🌐 局域网访问: http://[你的IP地址]:${PORT}
📱 移动端可访问: 确保在同一网络下使用服务器IP访问

👨‍💼 默认管理员账户:
   用户名: Liew1201
   密码: Liew1201
   
💾 数据库: PostgreSQL (使用DATABASE_URL环境变量)
🗄️  语音存储目录: ${VOICE_DIR}

📋 可用API端点:
  [用户认证]
  POST /api/login           - 用户登录
  POST /api/register        - 用户注册
  
  [商品管理]
  GET  /api/products        - 获取商品列表
  POST /api/products        - 添加商品
  DELETE /api/products/:id  - 删除商品
  
  [订单管理]
  GET  /api/orders          - 获取订单列表
  POST /api/orders          - 创建订单
  PUT  /api/orders/:id/status - 更新订单状态
  
  [选手管理]
  GET  /api/players         - 获取选手列表
  POST /api/players         - 添加选手（支持语音）
  DELETE /api/players/:id   - 删除选手
  
  [客服功能]
  GET  /api/customer-service - 获取客服链接
  PUT  /api/customer-service - 更新客服链接
  
  [语音功能]
  GET  /api/voices/:filename - 获取语音文件
  
  [系统设置]
  GET  /api/settings        - 获取设置
  PUT  /api/settings        - 更新设置
  
  [数据管理]
  GET  /api/backup         - 备份数据
  POST /api/restore        - 恢复数据
  
  [健康检查]
  GET  /api/health         - 健康检查

💡 使用提示:
1. 首次访问请登录管理员账户
2. 客服链接支持WhatsApp、Telegram、Facebook等
3. 语音录制需要HTTPS环境（本地localhost可用）
4. 多设备访问时使用服务器IP地址

=========================================================
            `);
        });
    } catch (error) {
        console.error('❌ 启动服务器失败:', error);
    }
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
    console.error('未捕获的异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的Promise拒绝:', reason);
});

startServer();
