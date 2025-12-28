// server.js - CPMCY商城完整后端（完整版）
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 10000;

// ========== 数据库连接修复 ==========
console.log('🔗 正在初始化数据库连接...');

// 检查环境变量
if (!process.env.DATABASE_URL) {
    console.error('❌ 错误: 缺少 DATABASE_URL 环境变量');
    console.log('💡 请在项目根目录创建 .env 文件，内容如下:');
    console.log('DATABASE_URL=postgresql://username:password@localhost:5432/cpmcy_db');
    console.log('PORT=3000');
    console.log('ℹ️  注意: 如果没有数据库，将使用文件存储模式');
}

let pool;
let useDatabase = true;

// PostgreSQL连接池配置
try {
    if (process.env.DATABASE_URL) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
        });

        // 测试数据库连接
        pool.query('SELECT NOW()', (err) => {
            if (err) {
                console.error('❌ 数据库连接失败:', err.message);
                console.log('⚠️  切换到文件存储模式');
                useDatabase = false;
                initializeFileStorage();
            } else {
                console.log('✅ 数据库连接成功');
                useDatabase = true;
                initializeDatabase();
            }
        });
    } else {
        console.log('ℹ️  未配置DATABASE_URL，使用文件存储模式');
        useDatabase = false;
        initializeFileStorage();
    }
} catch (error) {
    console.error('❌ 数据库配置失败:', error.message);
    useDatabase = false;
    initializeFileStorage();
}

// ========== 文件存储系统 ==========
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'mall-data.json');

async function initializeFileStorage() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        
        try {
            await fs.access(DATA_FILE);
            console.log('✅ 数据文件已存在');
        } catch {
            const initialData = {
                users: [
                    { 
                        id: 1,
                        username: 'admin', 
                        password: bcrypt.hashSync('admin123', 10),
                        is_admin: true,
                        created_at: new Date().toISOString()
                    }
                ],
                products: [],
                orders: [],
                players: [],
                customer_service: [],
                settings: {
                    store_name: 'CPMCY商城',
                    kuaishou_link: 'https://v.kuaishou.com/JGv00n48',
                    contact_info: 'FB账号GH Tree',
                    welcome_message: '欢迎选购！点击购买扫码完成付款',
                    banner_image: ''
                },
                lastUpdated: new Date().toISOString()
            };
            
            await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
            console.log('✅ 数据文件初始化完成');
        }
    } catch (error) {
        console.error('❌ 初始化文件存储失败:', error);
    }
}

// 读取文件数据
async function readFileData() {
    try {
        if (!useDatabase) {
            await initializeFileStorage();
            const data = await fs.readFile(DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
        return null;
    } catch (error) {
        console.error('❌ 读取数据失败:', error);
        return null;
    }
}

// 保存文件数据
async function saveFileData(data) {
    try {
        if (!useDatabase && data) {
            data.lastUpdated = new Date().toISOString();
            await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
            return true;
        }
        return false;
    } catch (error) {
        console.error('❌ 保存数据失败:', error);
        return false;
    }
}

// 语音文件目录
const VOICE_DIR = path.join(__dirname, 'voices');

// ========== 中间件配置 ==========
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
    if (!useDatabase) return;
    
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
                contact_info TEXT,
                welcome_message TEXT,
                banner_image TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ 设置表创建/检查完成');
        
        // 检查是否有管理员用户
        const adminResult = await pool.query('SELECT * FROM users WHERE username = $1', ['admin']);
        if (adminResult.rows.length === 0) {
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            await pool.query(
                'INSERT INTO users (username, password, is_admin) VALUES ($1, $2, $3)',
                ['admin', hashedPassword, true]
            );
            console.log('✅ 默认管理员账户已创建: admin/admin123');
        } else {
            console.log('✅ 管理员账户已存在');
        }
        
        // 检查是否有设置
        const settingsResult = await pool.query('SELECT * FROM settings');
        if (settingsResult.rows.length === 0) {
            await pool.query(
                `INSERT INTO settings (store_name, kuaishou_link, contact_info, welcome_message) 
                 VALUES ($1, $2, $3, $4)`,
                ['CPMCY商城', 'https://v.kuaishou.com/JGv00n48', 'FB账号GH Tree', '欢迎选购！点击购买扫码完成付款']
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
    }
}

// ========== 通用数据访问函数 ==========
// 1. 用户相关
async function getUsers() {
    if (useDatabase) {
        try {
            const result = await pool.query('SELECT * FROM users');
            return result.rows;
        } catch (error) {
            console.error('获取用户失败:', error);
            return [];
        }
    } else {
        const data = await readFileData();
        return data ? data.users : [];
    }
}

async function authenticateUser(username, password) {
    if (useDatabase) {
        try {
            const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
            if (result.rows.length === 0) return null;
            
            const user = result.rows[0];
            const isValid = bcrypt.compareSync(password, user.password);
            
            if (!isValid) return null;
            
            return {
                id: user.id,
                username: user.username,
                is_admin: user.is_admin,
                isAdmin: user.is_admin,
                created_at: user.created_at
            };
        } catch (error) {
            console.error('用户认证失败:', error);
            return null;
        }
    } else {
        const data = await readFileData();
        if (data) {
            const user = data.users.find(u => u.username === username);
            if (user) {
                const isValid = bcrypt.compareSync(password, user.password);
                if (!isValid) return null;
                
                return {
                    ...user,
                    isAdmin: user.is_admin
                };
            }
        }
        return null;
    }
}

async function registerUser(username, password) {
    if (useDatabase) {
        try {
            const hashedPassword = bcrypt.hashSync(password, 10);
            const result = await pool.query(
                'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *',
                [username, hashedPassword]
            );
            return result.rows[0];
        } catch (error) {
            console.error('注册用户失败:', error);
            return null;
        }
    } else {
        const data = await readFileData();
        if (data) {
            const userExists = data.users.some(u => u.username === username);
            if (userExists) return null;
            
            const hashedPassword = bcrypt.hashSync(password, 10);
            const newUser = {
                id: data.users.length + 1,
                username,
                password: hashedPassword,
                is_admin: false,
                created_at: new Date().toISOString()
            };
            
            data.users.push(newUser);
            await saveFileData(data);
            return newUser;
        }
        return null;
    }
}

// 2. 商品相关
async function getProducts() {
    if (useDatabase) {
        try {
            const result = await pool.query('SELECT * FROM products ORDER BY id DESC');
            return result.rows;
        } catch (error) {
            console.error('获取商品失败:', error);
            return [];
        }
    } else {
        const data = await readFileData();
        return data ? data.products : [];
    }
}

async function addProduct(product) {
    if (useDatabase) {
        try {
            const result = await pool.query(
                `INSERT INTO products (name, price, description, image) 
                 VALUES ($1, $2, $3, $4) 
                 RETURNING *`,
                [
                    product.name,
                    product.price,
                    product.description || '',
                    product.image || 'https://via.placeholder.com/300x200?text=商品'
                ]
            );
            return result.rows[0];
        } catch (error) {
            console.error('添加商品失败:', error);
            return null;
        }
    } else {
        const data = await readFileData();
        if (data) {
            const newProduct = {
                id: data.products.length + 1,
                ...product,
                created_at: new Date().toISOString()
            };
            data.products.push(newProduct);
            await saveFileData(data);
            return newProduct;
        }
        return null;
    }
}

async function deleteProduct(productId) {
    if (useDatabase) {
        try {
            const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [productId]);
            return result.rowCount > 0;
        } catch (error) {
            console.error('删除商品失败:', error);
            return false;
        }
    } else {
        const data = await readFileData();
        if (data) {
            const index = data.products.findIndex(p => p.id == productId);
            if (index !== -1) {
                data.products.splice(index, 1);
                await saveFileData(data);
                return true;
            }
        }
        return false;
    }
}

// 3. 订单相关
async function getOrders() {
    if (useDatabase) {
        try {
            const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
            return result.rows;
        } catch (error) {
            console.error('获取订单失败:', error);
            return [];
        }
    } else {
        const data = await readFileData();
        return data ? data.orders : [];
    }
}

async function addOrder(order) {
    if (useDatabase) {
        try {
            const result = await pool.query(
                `INSERT INTO orders (
                    order_number, user_id, product_id, product_name, 
                    product_price, total_amount, payment_method, remark, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
                RETURNING *`,
                [
                    order.orderNumber || ('DD' + Date.now().toString().slice(-8)),
                    order.userId || 'anonymous',
                    order.productId || 0,
                    order.productName || '未知商品',
                    order.productPrice || 0,
                    order.totalAmount || 0,
                    order.paymentMethod || 'tng',
                    order.remark || '',
                    order.status || 'pending'
                ]
            );
            return result.rows[0];
        } catch (error) {
            console.error('添加订单失败:', error);
            return null;
        }
    } else {
        const data = await readFileData();
        if (data) {
            const newOrder = {
                id: data.orders.length + 1,
                ...order,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            data.orders.push(newOrder);
            await saveFileData(data);
            return newOrder;
        }
        return null;
    }
}

async function updateOrderStatus(orderId, status) {
    if (useDatabase) {
        try {
            const result = await pool.query(
                'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
                [status, orderId]
            );
            return result.rowCount > 0;
        } catch (error) {
            console.error('更新订单状态失败:', error);
            return false;
        }
    } else {
        const data = await readFileData();
        if (data) {
            const order = data.orders.find(o => o.id == orderId);
            if (order) {
                order.status = status;
                order.updated_at = new Date().toISOString();
                await saveFileData(data);
                return true;
            }
        }
        return false;
    }
}

// 4. 选手相关
async function getPlayers() {
    if (useDatabase) {
        try {
            const result = await pool.query('SELECT * FROM players ORDER BY id DESC');
            return result.rows;
        } catch (error) {
            console.error('获取选手失败:', error);
            return [];
        }
    } else {
        const data = await readFileData();
        return data ? data.players : [];
    }
}

async function addPlayer(playerData) {
    if (useDatabase) {
        try {
            let voiceFile = '';
            let hasVoice = false;
            
            // 处理语音文件
            if (playerData.audio && playerData.audio.trim() !== '') {
                try {
                    const base64String = playerData.audio.replace(/^data:audio\/\w+;base64,/, '');
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
                    playerData.name,
                    playerData.description || '',
                    playerData.image || 'https://via.placeholder.com/200x200?text=选手',
                    voiceFile,
                    hasVoice
                ]
            );
            return result.rows[0];
        } catch (error) {
            console.error('添加选手失败:', error);
            return null;
        }
    } else {
        const data = await readFileData();
        if (data) {
            const newPlayer = {
                id: data.players.length + 1,
                name: playerData.name,
                description: playerData.description || '',
                image: playerData.image || 'https://via.placeholder.com/200x200?text=选手',
                voice_file: '',
                has_voice: false,
                created_at: new Date().toISOString()
            };
            
            // 处理语音文件
            if (playerData.audio && playerData.audio.trim() !== '') {
                try {
                    const base64String = playerData.audio.replace(/^data:audio\/\w+;base64,/, '');
                    const timestamp = Date.now();
                    const filename = `voice_${timestamp}.webm`;
                    const filepath = path.join(VOICE_DIR, filename);
                    
                    await fs.writeFile(filepath, base64String, 'base64');
                    newPlayer.voice_file = `/api/voices/${filename}`;
                    newPlayer.has_voice = true;
                    console.log(`✅ 语音文件保存成功: ${filename}`);
                } catch (error) {
                    console.error('保存语音文件失败:', error);
                }
            }
            
            data.players.push(newPlayer);
            await saveFileData(data);
            return newPlayer;
        }
        return null;
    }
}

async function deletePlayer(playerId) {
    if (useDatabase) {
        try {
            // 获取选手信息以删除语音文件
            const playerResult = await pool.query('SELECT * FROM players WHERE id = $1', [playerId]);
            
            if (playerResult.rowCount === 0) {
                return false;
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
            const result = await pool.query('DELETE FROM players WHERE id = $1 RETURNING *', [playerId]);
            return result.rowCount > 0;
        } catch (error) {
            console.error('删除选手失败:', error);
            return false;
        }
    } else {
        const data = await readFileData();
        if (data) {
            const index = data.players.findIndex(p => p.id == playerId);
            if (index !== -1) {
                const player = data.players[index];
                
                // 删除语音文件
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
                
                data.players.splice(index, 1);
                await saveFileData(data);
                return true;
            }
        }
        return false;
    }
}

// 5. 客服相关
async function getCustomerService() {
    if (useDatabase) {
        try {
            const result = await pool.query(
                'SELECT * FROM customer_service WHERE enabled = true ORDER BY sort_order'
            );
            return result.rows;
        } catch (error) {
            console.error('获取客服信息失败:', error);
            return [];
        }
    } else {
        const data = await readFileData();
        if (data && data.customer_service) {
            return data.customer_service.filter(service => service.enabled !== false);
        }
        return [];
    }
}

async function updateCustomerService(links) {
    if (useDatabase) {
        try {
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
            
            return true;
        } catch (error) {
            console.error('更新客服信息失败:', error);
            return false;
        }
    } else {
        const data = await readFileData();
        if (data) {
            data.customer_service = links.map((link, index) => ({
                id: index + 1,
                icon: link.icon || '💬',
                name: link.name || `客服${index + 1}`,
                description: link.description || '',
                url: link.url || '',
                enabled: link.enabled !== false,
                sort_order: index,
                updated_at: new Date().toISOString()
            }));
            await saveFileData(data);
            return true;
        }
        return false;
    }
}

// 6. 设置相关
async function getSettings() {
    if (useDatabase) {
        try {
            const result = await pool.query('SELECT * FROM settings LIMIT 1');
            return result.rows[0] || null;
        } catch (error) {
            console.error('获取设置失败:', error);
            return null;
        }
    } else {
        const data = await readFileData();
        return data ? data.settings : null;
    }
}

async function updateSettings(settings) {
    if (useDatabase) {
        try {
            const existing = await getSettings();
            if (existing) {
                const result = await pool.query(
                    `UPDATE settings 
                     SET store_name = $1, kuaishou_link = $2, contact_info = $3, 
                         welcome_message = $4, banner_image = $5, updated_at = CURRENT_TIMESTAMP 
                     RETURNING *`,
                    [
                        settings.store_name || existing.store_name,
                        settings.kuaishou_link || existing.kuaishou_link,
                        settings.contact_info || existing.contact_info,
                        settings.welcome_message || existing.welcome_message,
                        settings.banner_image || existing.banner_image
                    ]
                );
                return result.rows[0];
            } else {
                const result = await pool.query(
                    `INSERT INTO settings (store_name, kuaishou_link, contact_info, welcome_message, banner_image) 
                     VALUES ($1, $2, $3, $4, $5) 
                     RETURNING *`,
                    [
                        settings.store_name || 'CPMCY商城',
                        settings.kuaishou_link || '',
                        settings.contact_info || '',
                        settings.welcome_message || '',
                        settings.banner_image || ''
                    ]
                );
                return result.rows[0];
            }
        } catch (error) {
            console.error('更新设置失败:', error);
            return null;
        }
    } else {
        const data = await readFileData();
        if (data) {
            data.settings = {
                ...data.settings,
                ...settings,
                updated_at: new Date().toISOString()
            };
            await saveFileData(data);
            return data.settings;
        }
        return null;
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
        storage: useDatabase ? 'PostgreSQL' : 'File',
        database: useDatabase ? 'Connected' : 'Not used'
    });
});

// 2. 用户认证相关API
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log(`🔐 登录请求: ${username}`);
        
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: '用户名和密码不能为空'
            });
        }
        
        const user = await authenticateUser(username, password);
        
        if (user) {
            const { password: _, ...userWithoutPassword } = user;
            console.log(`✅ 用户 ${username} 登录成功`);
            res.json({
                success: true,
                data: userWithoutPassword,
                message: '登录成功'
            });
        } else {
            console.log(`❌ 用户 ${username} 登录失败`);
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
    try {
        const { username, password } = req.body;
        console.log(`📝 注册请求: ${username}`);
        
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
        
        const user = await registerUser(username, password);
        
        if (user) {
            const { password: _, ...userWithoutPassword } = user;
            console.log(`✅ 用户 ${username} 注册成功`);
            res.json({
                success: true,
                data: userWithoutPassword,
                message: '注册成功'
            });
        } else {
            res.status(400).json({
                success: false,
                error: '用户名已存在'
            });
        }
    } catch (error) {
        console.error('注册失败:', error);
        res.status(500).json({
            success: false,
            error: '服务器内部错误: ' + error.message
        });
    }
});

// 3. 商品相关API
app.get('/api/products', async (req, res) => {
    try {
        console.log('📦 获取商品列表请求');
        const products = await getProducts();
        console.log(`✅ 返回 ${products.length} 个商品`);
        res.json({
            success: true,
            data: products,
            count: products.length
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
    try {
        console.log('➕ 添加商品请求');
        const { name, price, description, image } = req.body;
        
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
        
        const product = await addProduct({ name, price: priceNum, description, image });
        
        if (product) {
            console.log(`✅ 商品添加成功: ${name} (ID: ${product.id})`);
            res.json({
                success: true,
                data: product,
                message: '商品添加成功'
            });
        } else {
            res.status(500).json({
                success: false,
                error: '添加商品失败'
            });
        }
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
        console.log(`🗑️ 删除商品请求: ID=${productId}`);
        
        const success = await deleteProduct(productId);
        
        if (success) {
            console.log(`✅ 商品删除成功: ID=${productId}`);
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
        console.error('删除商品失败:', error);
        res.status(500).json({
            success: false,
            error: '删除商品失败: ' + error.message
        });
    }
});

// 4. 订单相关API
app.get('/api/orders', async (req, res) => {
    try {
        console.log('📋 获取订单列表请求');
        const orders = await getOrders();
        console.log(`✅ 返回 ${orders.length} 个订单`);
        res.json({
            success: true,
            data: orders,
            count: orders.length
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
    try {
        console.log('🛒 创建订单请求');
        const order = req.body;
        
        const savedOrder = await addOrder(order);
        
        if (savedOrder) {
            console.log(`✅ 订单创建成功: ${savedOrder.order_number}`);
            res.json({
                success: true,
                data: savedOrder,
                message: '订单创建成功'
            });
        } else {
            res.status(500).json({
                success: false,
                error: '创建订单失败'
            });
        }
    } catch (error) {
        console.error('创建订单失败:', error);
        res.status(500).json({
            success: false,
            error: '创建订单失败: ' + error.message
        });
    }
});

app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const orderId = req.params.id;
        const { status } = req.body;
        console.log(`🔄 更新订单状态: ID=${orderId}, 状态=${status}`);
        
        const success = await updateOrderStatus(orderId, status);
        
        if (success) {
            console.log(`✅ 订单状态更新成功: ID=${orderId} -> ${status}`);
            res.json({
                success: true,
                message: '订单状态更新成功'
            });
        } else {
            res.status(404).json({
                success: false,
                error: '订单不存在'
            });
        }
    } catch (error) {
        console.error('更新订单状态失败:', error);
        res.status(500).json({
            success: false,
            error: '更新订单状态失败: ' + error.message
        });
    }
});

// 5. 选手相关API - 新增功能
app.get('/api/players', async (req, res) => {
    try {
        console.log('👥 获取选手列表请求');
        const players = await getPlayers();
        console.log(`✅ 返回 ${players.length} 个选手`);
        res.json({
            success: true,
            data: players,
            count: players.length
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
    try {
        console.log('➕ 添加选手请求');
        const { name, description, image, audio } = req.body;
        
        if (!name) {
            return res.status(400).json({
                success: false,
                error: '选手名称不能为空'
            });
        }
        
        const player = await addPlayer({ name, description, image, audio });
        
        if (player) {
            console.log(`✅ 选手添加成功: ${name} (ID: ${player.id})`);
            res.json({
                success: true,
                data: player,
                message: '选手添加成功'
            });
        } else {
            res.status(500).json({
                success: false,
                error: '添加选手失败'
            });
        }
    } catch (error) {
        console.error('添加选手失败:', error);
        res.status(500).json({
            success: false,
            error: '添加选手失败: ' + error.message
        });
    }
});

app.delete('/api/players/:id', async (req, res) => {
    try {
        const playerId = req.params.id;
        console.log(`🗑️ 删除选手请求: ID=${playerId}`);
        
        const success = await deletePlayer(playerId);
        
        if (success) {
            console.log(`✅ 选手删除成功: ID=${playerId}`);
            res.json({
                success: true,
                message: '选手删除成功'
            });
        } else {
            res.status(404).json({
                success: false,
                error: '选手不存在'
            });
        }
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
    try {
        const filename = req.params.filename;
        console.log(`🔊 获取语音文件: ${filename}`);
        
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

// 7. 客服相关API - 新增功能
app.get('/api/customer-service', async (req, res) => {
    try {
        console.log('💬 获取客服链接请求');
        const services = await getCustomerService();
        console.log(`✅ 返回 ${services.length} 个客服链接`);
        res.json({
            success: true,
            data: services,
            count: services.length,
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
        console.log('💾 更新客服链接请求');
        const { links } = req.body;
        
        if (!Array.isArray(links)) {
            return res.status(400).json({
                success: false,
                error: '客服链接数据格式不正确'
            });
        }
        
        const success = await updateCustomerService(links);
        
        if (success) {
            const updatedServices = await getCustomerService();
            console.log(`✅ 客服链接保存成功: ${updatedServices.length} 个链接`);
            res.json({
                success: true,
                data: updatedServices,
                message: '客服链接保存成功',
                updatedAt: new Date().toISOString()
            });
        } else {
            res.status(500).json({
                success: false,
                error: '保存客服链接失败'
            });
        }
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
        console.log('⚙️ 获取设置请求');
        const settings = await getSettings();
        
        if (settings) {
            // 统一字段格式
            const formattedSettings = {
                store_name: settings.store_name || settings.storeName || 'CPMCY商城',
                kuaishou_link: settings.kuaishou_link || settings.kuaishouLink || '',
                contact_info: settings.contact_info || settings.contactInfo || '',
                welcome_message: settings.welcome_message || settings.welcomeMessage || '',
                banner_image: settings.banner_image || settings.bannerImage || ''
            };
            
            res.json({
                success: true,
                data: formattedSettings
            });
        } else {
            res.json({
                success: true,
                data: {
                    store_name: 'CPMCY商城',
                    kuaishou_link: 'https://v.kuaishou.com/JGv00n48',
                    contact_info: 'FB账号GH Tree',
                    welcome_message: '欢迎选购！点击购买扫码完成付款',
                    banner_image: ''
                }
            });
        }
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
        console.log('💾 更新设置请求');
        const settings = req.body;
        const updated = await updateSettings(settings);
        
        if (updated) {
            res.json({
                success: true,
                data: updated,
                message: '设置更新成功'
            });
        } else {
            res.status(500).json({
                success: false,
                error: '更新设置失败'
            });
        }
    } catch (error) {
        console.error('更新设置失败:', error);
        res.status(500).json({
            success: false,
            error: '更新设置失败'
        });
    }
});

// 9. 数据备份API
app.get('/api/backup', async (req, res) => {
    try {
        console.log('💾 数据备份请求');
        const [users, products, orders, players, services] = await Promise.all([
            getUsers(),
            getProducts(),
            getOrders(),
            getPlayers(),
            getCustomerService()
        ]);
        
        const settings = await getSettings();
        
        const backupData = {
            timestamp: new Date().toISOString(),
            version: '2.0.0',
            storage: useDatabase ? 'PostgreSQL' : 'File',
            users,
            products,
            orders,
            players,
            customer_service: services,
            settings: settings || {},
            note: 'CPMCY商城数据备份'
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

// 10. 系统状态API
app.get('/api/status', async (req, res) => {
    try {
        const [products, orders, players, services] = await Promise.all([
            getProducts(),
            getOrders(),
            getPlayers(),
            getCustomerService()
        ]);
        
        res.json({
            success: true,
            data: {
                status: 'running',
                serverTime: new Date().toISOString(),
                uptime: process.uptime(),
                port: PORT,
                storage: useDatabase ? 'PostgreSQL' : 'File',
                database: useDatabase ? 'Connected' : 'Not used',
                productsCount: products.length,
                ordersCount: orders.length,
                playersCount: players.length,
                servicesCount: services.length,
                environment: process.env.NODE_ENV || 'development'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: '获取状态失败'
        });
    }
});

// 11. 数据统计API
app.get('/api/stats', async (req, res) => {
    try {
        const [orders, products] = await Promise.all([
            getOrders(),
            getProducts()
        ]);
        
        const today = new Date().toDateString();
        const todayOrders = orders.filter(order => 
            new Date(order.created_at || order.createdAt).toDateString() === today
        );
        
        const stats = {
            totalProducts: products.length,
            totalOrders: orders.length,
            todayOrders: todayOrders.length,
            todayRevenue: todayOrders.reduce((sum, order) => sum + (order.total_amount || order.totalAmount || 0), 0),
            pendingOrders: orders.filter(o => (o.status || 'pending') === 'pending').length,
            paidOrders: orders.filter(o => (o.status || 'pending') === 'paid').length,
            completedOrders: orders.filter(o => (o.status || 'pending') === 'completed').length,
            totalRevenue: orders.reduce((sum, order) => sum + (order.total_amount || order.totalAmount || 0), 0),
            storage: useDatabase ? 'PostgreSQL' : 'File',
            lastUpdated: new Date().toISOString()
        };
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: '获取统计失败'
        });
    }
});

// 12. 首页服务
app.get('/', (req, res) => {
    console.log('🏠 首页请求');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 13. 静态文件服务（语音文件）
app.use('/voices', express.static(VOICE_DIR));

// 14. 处理404错误
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
        
        // 初始化语音目录
        await fs.mkdir(VOICE_DIR, { recursive: true });
        console.log('✅ 语音目录创建完成');
        
        // 如果是数据库模式，初始化数据库
        if (useDatabase) {
            await initializeDatabase();
        } else {
            await initializeFileStorage();
        }
        
        // 启动服务器
        app.listen(PORT, () => {
            console.log(`
=========================================================
🎉 CPMCY商城服务器已启动!
=========================================================

📡 服务器地址: http://localhost:${PORT}
🌐 局域网访问: http://[您的IP地址]:${PORT}

💾 存储模式: ${useDatabase ? 'PostgreSQL数据库' : '文件存储'}
👨‍💼 管理员账户:
   用户名: admin
   密码: admin123

📋 API端点:
   /api/health       - 健康检查
   /api/login        - 用户登录
   /api/register     - 用户注册
   /api/products     - 商品管理
   /api/orders       - 订单管理
   /api/players      - 选手管理 (新增)
   /api/customer-service - 客服管理 (新增)
   /api/settings     - 系统设置
   /api/backup       - 数据备份
   /api/stats        - 数据统计

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
    if (useDatabase && pool) {
        pool.end();
    }
    process.exit(0);
});

// 启动服务器
startServer();
