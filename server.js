// server.js - PostgreSQL 完整版 v4.0
// 使用 DATABASE_URL 连接 PostgreSQL
const express = require('express');
const path = require('path');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// ========== 数据库连接 ==========
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
        ? false
        : { rejectUnauthorized: false }
});

pool.on('error', (err) => {
    console.error('❌ PostgreSQL 连接池错误:', err.message);
});

// ========== 初始化数据库表 ==========
async function initDB() {
    const client = await pool.connect();
    try {
        console.log('🔄 初始化数据库表...');

        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                is_admin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS products (
                id BIGINT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                price NUMERIC(10,2) NOT NULL,
                description TEXT DEFAULT '',
                image TEXT DEFAULT '',
                category VARCHAR(255) DEFAULT '热门',
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id BIGINT PRIMARY KEY,
                order_number VARCHAR(50) UNIQUE NOT NULL,
                user_id VARCHAR(50),
                product_id BIGINT,
                product_name TEXT,
                product_price NUMERIC(10,2),
                total_amount NUMERIC(10,2),
                payment_method VARCHAR(20) DEFAULT 'tng',
                status VARCHAR(20) DEFAULT 'pending',
                game_name VARCHAR(255) DEFAULT '',
                game_region VARCHAR(255) DEFAULT '',
                specified_player VARCHAR(255) DEFAULT '',
                order_remark TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS services (
                id BIGINT PRIMARY KEY,
                type VARCHAR(20) NOT NULL,
                name VARCHAR(255) NOT NULL,
                link TEXT NOT NULL,
                enabled BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY DEFAULT 1,
                store_name VARCHAR(255) DEFAULT 'XIAOYI卖涂装和外挂服务',
                kuaishou_link TEXT DEFAULT '',
                contact_info TEXT DEFAULT '',
                welcome_message TEXT DEFAULT '',
                enable_service BOOLEAN DEFAULT TRUE,
                updated_at TIMESTAMP DEFAULT NOW(),
                CONSTRAINT settings_single_row CHECK (id = 1)
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS carousels (
                id BIGINT PRIMARY KEY,
                image_url TEXT NOT NULL,
                link TEXT DEFAULT '',
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS grid_buttons (
                id INTEGER PRIMARY KEY DEFAULT 1,
                left_img TEXT DEFAULT '',
                left_link TEXT DEFAULT '',
                left_label VARCHAR(100) DEFAULT '热门推荐',
                right_img TEXT DEFAULT '',
                right_link TEXT DEFAULT '',
                right_label VARCHAR(100) DEFAULT '限时优惠',
                updated_at TIMESTAMP DEFAULT NOW(),
                CONSTRAINT grid_buttons_single_row CHECK (id = 1)
            );
        `);

        // 默认用户
        const userCount = await client.query('SELECT COUNT(*) FROM users');
        if (parseInt(userCount.rows[0].count) === 0) {
            await client.query(`
                INSERT INTO users (username, password, is_admin) VALUES
                ('admin', 'admin123', TRUE),
                ('xiaoyi', 'xiaoyi123', TRUE)
            `);
            console.log('✅ 已创建默认管理员账户');
        }

        // 默认客服
        const serviceCount = await client.query('SELECT COUNT(*) FROM services');
        if (parseInt(serviceCount.rows[0].count) === 0) {
            await client.query(`
                INSERT INTO services (id, type, name, link, enabled) VALUES
                (1, 'whatsapp', '官方客服', 'https://wa.me/60123456789', TRUE),
                (2, 'wechat', '微信客服', 'https://weixin.qq.com/', TRUE)
            `);
            console.log('✅ 已创建默认客服');
        }

        // 默认设置
        const settingsCount = await client.query('SELECT COUNT(*) FROM settings');
        if (parseInt(settingsCount.rows[0].count) === 0) {
            await client.query(`
                INSERT INTO settings (id, store_name, kuaishou_link, contact_info, welcome_message, enable_service)
                VALUES (1, 'XIAOYI卖涂装和外挂服务', 'https://v.kuaishou.com/JGv00n48', 'FB账号GH Tree', '欢迎选购！点击购买扫码完成付款', TRUE)
            `);
            console.log('✅ 已创建默认设置');
        }

        // 默认宫格
        const gridCount = await client.query('SELECT COUNT(*) FROM grid_buttons');
        if (parseInt(gridCount.rows[0].count) === 0) {
            await client.query('INSERT INTO grid_buttons (id) VALUES (1)');
        }

        console.log('✅ 数据库初始化完成');
    } catch (error) {
        console.error('❌ 数据库初始化失败:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

// ========== API 路由 ==========

// 1. 获取商品列表
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
        const products = result.rows.map(p => ({
            id: Number(p.id),
            name: p.name,
            price: parseFloat(p.price),
            description: p.description,
            image: p.image,
            category: p.category,
            createdAt: p.created_at
        }));
        res.json({ success: true, data: products, total: products.length });
    } catch (error) {
        console.error('获取商品失败:', error);
        res.status(500).json({ success: false, error: '获取商品失败' });
    }
});

// 2. 添加商品
app.post('/api/products/add', async (req, res) => {
    try {
        const { name, price, description, image, category } = req.body;
        console.log('📦 添加商品:', { name, price, category });

        if (!name || !price) {
            return res.status(400).json({ success: false, error: '商品名称和价格是必填项' });
        }

        const id = Date.now();
        const result = await pool.query(
            `INSERT INTO products (id, name, price, description, image, category)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [
                id,
                name,
                parseFloat(price),
                description || '',
                image || 'https://via.placeholder.com/300x250.png?text=商品',
                category || '热门'
            ]
        );

        const p = result.rows[0];
        res.json({
            success: true,
            data: {
                id: Number(p.id),
                name: p.name,
                price: parseFloat(p.price),
                description: p.description,
                image: p.image,
                category: p.category,
                createdAt: p.created_at
            },
            message: '商品添加成功'
        });
    } catch (error) {
        console.error('添加商品失败:', error);
        res.status(500).json({ success: false, error: '添加商品失败' });
    }
});

// 3. 删除商品
app.post('/api/products/delete', async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ success: false, error: '商品ID是必填项' });

        const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, error: '商品不存在' });
        }
        res.json({ success: true, message: '商品删除成功', deletedId: Number(id) });
    } catch (error) {
        console.error('删除商品失败:', error);
        res.status(500).json({ success: false, error: '删除商品失败' });
    }
});

// 4. 批量同步商品
app.post('/api/products/sync', async (req, res) => {
    const client = await pool.connect();
    try {
        const { products } = req.body;
        if (!Array.isArray(products)) {
            return res.status(400).json({ success: false, error: '商品数据格式不正确' });
        }

        await client.query('BEGIN');
        await client.query('DELETE FROM products');

        for (const p of products) {
            await client.query(
                `INSERT INTO products (id, name, price, description, image, category)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    p.id || Date.now() + Math.floor(Math.random() * 1000),
                    p.name,
                    parseFloat(p.price) || 0,
                    p.description || '',
                    p.image || '',
                    p.category || '热门'
                ]
            );
        }
        await client.query('COMMIT');

        const result = await client.query('SELECT * FROM products ORDER BY created_at DESC');
        res.json({ success: true, data: result.rows, message: '同步成功' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('同步商品失败:', error);
        res.status(500).json({ success: false, error: '同步商品失败' });
    } finally {
        client.release();
    }
});

// 5. 获取订单列表
app.get('/api/orders', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
        const orders = result.rows.map(o => ({
            id: Number(o.id),
            orderNumber: o.order_number,
            userId: o.user_id,
            productId: Number(o.product_id),
            productName: o.product_name,
            productPrice: parseFloat(o.product_price),
            totalAmount: parseFloat(o.total_amount),
            paymentMethod: o.payment_method,
            status: o.status,
            gameName: o.game_name,
            gameRegion: o.game_region,
            specifiedPlayer: o.specified_player,
            orderRemark: o.order_remark,
            createdAt: o.created_at,
            updatedAt: o.updated_at
        }));
        res.json({ success: true, data: orders, total: orders.length });
    } catch (error) {
        console.error('获取订单失败:', error);
        res.status(500).json({ success: false, error: '获取订单失败' });
    }
});

// 6. 添加订单
app.post('/api/orders/add', async (req, res) => {
    try {
        const {
            orderNumber, userId, productId, productName, productPrice,
            totalAmount, paymentMethod, status,
            gameName, gameRegion, specifiedPlayer, orderRemark
        } = req.body;

        const id = Date.now();
        const finalOrderNumber = orderNumber || `DD${id.toString().slice(-8)}`;

        const result = await pool.query(
            `INSERT INTO orders 
             (id, order_number, user_id, product_id, product_name, product_price, 
              total_amount, payment_method, status, game_name, game_region, 
              specified_player, order_remark)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
            [
                id,
                finalOrderNumber,
                userId || '',
                productId || 0,
                productName || '',
                parseFloat(productPrice) || 0,
                parseFloat(totalAmount) || 0,
                paymentMethod || 'tng',
                status || 'pending',
                gameName || '',
                gameRegion || '',
                specifiedPlayer || '',
                orderRemark || ''
            ]
        );

        res.json({ success: true, data: result.rows[0], message: '订单创建成功' });
    } catch (error) {
        console.error('添加订单失败:', error);
        res.status(500).json({ success: false, error: '添加订单失败' });
    }
});

// 7. 删除订单
app.delete('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM orders WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, error: '订单不存在' });
        }
        res.json({ success: true, message: '订单删除成功', deletedId: Number(id) });
    } catch (error) {
        console.error('删除订单失败:', error);
        res.status(500).json({ success: false, error: '删除订单失败' });
    }
});

// 8. 更新订单状态
app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['pending', 'paid', 'completed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, error: '无效的状态值' });
        }

        const result = await pool.query(
            'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
            [status, id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, error: '订单不存在' });
        }
        res.json({ success: true, data: result.rows[0], message: '订单状态更新成功' });
    } catch (error) {
        console.error('更新订单状态失败:', error);
        res.status(500).json({ success: false, error: '更新订单状态失败' });
    }
});

// 9. 用户登录
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log(`🔐 登录尝试: ${username}`);

        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1 AND password = $2',
            [username, password]
        );

        if (result.rowCount > 0) {
            const user = result.rows[0];
            res.json({
                success: true,
                data: {
                    id: user.id,
                    username: user.username,
                    isAdmin: user.is_admin,
                    createdAt: user.created_at
                },
                message: '登录成功'
            });
        } else {
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

// 10. 用户注册
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, error: '用户名和密码是必填项' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, error: '密码长度至少6位' });
        }

        const exists = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (exists.rowCount > 0) {
            return res.status(400).json({ success: false, error: '用户名已存在' });
        }

        const result = await pool.query(
            'INSERT INTO users (username, password, is_admin) VALUES ($1, $2, FALSE) RETURNING *',
            [username, password]
        );
        const user = result.rows[0];

        res.json({
            success: true,
            data: {
                id: user.id,
                username: user.username,
                isAdmin: user.is_admin,
                createdAt: user.created_at
            },
            message: '注册成功'
        });
    } catch (error) {
        console.error('注册失败:', error);
        res.status(500).json({ success: false, error: '注册失败' });
    }
});

// 11. 获取用户列表
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, is_admin, created_at FROM users ORDER BY id');
        res.json({ success: true, data: result.rows, total: result.rowCount });
    } catch (error) {
        console.error('获取用户失败:', error);
        res.status(500).json({ success: false, error: '获取用户失败' });
    }
});

// 12. 获取系统设置
app.get('/api/settings', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM settings WHERE id = 1');
        if (result.rowCount === 0) return res.json({ success: true, data: {} });
        const s = result.rows[0];
        res.json({
            success: true,
            data: {
                storeName: s.store_name,
                kuaishouLink: s.kuaishou_link,
                contactInfo: s.contact_info,
                welcomeMessage: s.welcome_message,
                enableService: s.enable_service,
                updatedAt: s.updated_at
            }
        });
    } catch (error) {
        console.error('获取设置失败:', error);
        res.status(500).json({ success: false, error: '获取设置失败' });
    }
});

// 13. 更新系统设置
app.post('/api/settings/update', async (req, res) => {
    try {
        const { storeName, kuaishouLink, contactInfo, welcomeMessage, enableService } = req.body;

        const result = await pool.query(
            `UPDATE settings SET
                store_name = COALESCE($1, store_name),
                kuaishou_link = COALESCE($2, kuaishou_link),
                contact_info = COALESCE($3, contact_info),
                welcome_message = COALESCE($4, welcome_message),
                enable_service = COALESCE($5, enable_service),
                updated_at = NOW()
             WHERE id = 1 RETURNING *`,
            [storeName, kuaishouLink, contactInfo, welcomeMessage, enableService]
        );

        res.json({ success: true, data: result.rows[0], message: '设置更新成功' });
    } catch (error) {
        console.error('更新设置失败:', error);
        res.status(500).json({ success: false, error: '更新设置失败' });
    }
});

// 14. 获取启用的客服
app.get('/api/services', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM services WHERE enabled = TRUE ORDER BY id');
        res.json({ success: true, data: result.rows, total: result.rowCount });
    } catch (error) {
        console.error('获取客服失败:', error);
        res.status(500).json({ success: false, error: '获取客服失败' });
    }
});

// 15. 获取所有客服
app.get('/api/services/all', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM services ORDER BY id');
        res.json({ success: true, data: result.rows, total: result.rowCount });
    } catch (error) {
        console.error('获取所有客服失败:', error);
        res.status(500).json({ success: false, error: '获取客服失败' });
    }
});

// 16. 添加客服
app.post('/api/services/add', async (req, res) => {
    try {
        const { type, name, link, enabled } = req.body;
        if (!type || !name || !link) {
            return res.status(400).json({ success: false, error: '客服类型、名称和链接是必填项' });
        }

        const id = Date.now();
        const result = await pool.query(
            `INSERT INTO services (id, type, name, link, enabled)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [id, type, name, link, enabled !== undefined ? enabled : true]
        );
        res.json({ success: true, data: result.rows[0], message: '客服添加成功' });
    } catch (error) {
        console.error('添加客服失败:', error);
        res.status(500).json({ success: false, error: '添加客服失败' });
    }
});

// 17. 删除客服 (POST)
app.post('/api/services/delete', async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ success: false, error: '客服ID是必填项' });

        const result = await pool.query('DELETE FROM services WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, error: '客服不存在' });
        }
        res.json({ success: true, message: '客服删除成功', deletedId: Number(id) });
    } catch (error) {
        console.error('删除客服失败:', error);
        res.status(500).json({ success: false, error: '删除客服失败' });
    }
});

// 18. 删除客服 (DELETE)
app.delete('/api/services/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM services WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, error: '客服不存在' });
        }
        res.json({ success: true, message: '客服删除成功', deletedId: Number(id) });
    } catch (error) {
        console.error('删除客服失败:', error);
        res.status(500).json({ success: false, error: '删除客服失败' });
    }
});

// 19. 更新客服状态
app.put('/api/services/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;
        const { enabled } = req.body;
        const result = await pool.query(
            'UPDATE services SET enabled = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
            [enabled, id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, error: '客服不存在' });
        }
        res.json({ success: true, data: result.rows[0], message: `客服已${enabled ? '启用' : '禁用'}` });
    } catch (error) {
        console.error('更新客服状态失败:', error);
        res.status(500).json({ success: false, error: '更新客服状态失败' });
    }
});

// 20. 更新客服信息
app.post('/api/services/update', async (req, res) => {
    try {
        const { id, name, link, enabled } = req.body;
        if (!id) return res.status(400).json({ success: false, error: '客服ID是必填项' });

        const result = await pool.query(
            `UPDATE services SET
                name = COALESCE($1, name),
                link = COALESCE($2, link),
                enabled = COALESCE($3, enabled),
                updated_at = NOW()
             WHERE id = $4 RETURNING *`,
            [name, link, enabled, id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, error: '客服不存在' });
        }
        res.json({ success: true, data: result.rows[0], message: '客服信息已更新' });
    } catch (error) {
        console.error('更新客服信息失败:', error);
        res.status(500).json({ success: false, error: '更新客服信息失败' });
    }
});

// ========== 轮播图 ==========
app.get('/api/carousels', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM carousels ORDER BY sort_order ASC, id ASC');
        const carousels = result.rows.map(c => ({
            id: Number(c.id),
            imageUrl: c.image_url,
            link: c.link,
            sortOrder: c.sort_order
        }));
        res.json({ success: true, data: carousels });
    } catch (error) {
        console.error('获取轮播图失败:', error);
        res.status(500).json({ success: false, error: '获取轮播图失败' });
    }
});

app.post('/api/carousels/update', async (req, res) => {
    const client = await pool.connect();
    try {
        const { carousels } = req.body;
        if (!Array.isArray(carousels)) {
            return res.status(400).json({ success: false, error: '轮播图数据格式不正确' });
        }

        await client.query('BEGIN');
        await client.query('DELETE FROM carousels');

        const limited = carousels.slice(0, 5);
        for (let i = 0; i < limited.length; i++) {
            const c = limited[i];
            await client.query(
                'INSERT INTO carousels (宫id, image_url, link, sort_order) VALUES格 ($1, $2, $3, $4)',
                [c.id || Date.now() + i, c.imageUrl || c.image_url, c.link || '', i]
            );
        }
        await client.query('COMMIT');

        res.json({ success: true, data: limited, message: '轮播图更新成功' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('更新轮播图失败:', error);
        res.status(500).json({ success: false, error: '更新轮播图失败' });
    } finally {
        client.release();
    }
});

// ========== 按钮 ==========
app.get('/api/grid-buttons', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM grid_buttons WHERE id = 1');
        if (result.rowCount === 0) {
            return res.json({ success: true, data: { left: {}, right: {} } });
        }
        const g = result.rows[0];
        res.json({
            success: true,
            data: {
                left: { img: g.left_img, link: g.left_link, label: g.left_label },
                right: { img: g.right_img, link: g.right_link, label: g.right_label }
            }
        });
    } catch (error) {
        console.error('获取宫格按钮失败:', error);
        res.status(500).json({ success: false, error: '获取宫格按钮失败' });
    }
});

app.post('/api/grid-buttons/update', async (req, res) => {
    try {
        const { left, right } = req.body;
        const result = await pool.query(
            `UPDATE grid_buttons SET
                left_img = $1, left_link = $2, left_label = $3,
                right_img = $4, right_link = $5, right_label = $6,
                updated_at = NOW()
             WHERE id = 1 RETURNING *`,
            [
                left?.img || '', left?.link || '', left?.label || '热门推荐',
                right?.img || '', right?.link || '', right?.label || '限时优惠'
            ]
        );
        res.json({ success: true, data: result.rows[0], message: '宫格按钮更新成功' });
    } catch (error) {
        console.error('更新宫格按钮失败:', error);
        res.status(500).json({ success: false, error: '更新宫格按钮失败' });
    }
});

// 状态接口
app.get('/api/status', async (req, res) => {
    try {
        const [p, o, u, s] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM products'),
            pool.query('SELECT COUNT(*) FROM orders'),
            pool.query('SELECT COUNT(*) FROM users'),
            pool.query('SELECT COUNT(*) FROM services')
        ]);
        res.json({
            success: true,
            data: {
                status: 'running',
                database: 'PostgreSQL',
                productsCount: parseInt(p.rows[0].count),
                ordersCount: parseInt(o.rows[0].count),
                usersCount: parseInt(u.rows[0].count),
                servicesCount: parseInt(s.rows[0].count),
                uptime: process.uptime(),
                version: '4.0 (PostgreSQL)'
            }
        });
    } catch (error) {
        console.error('获取状态失败:', error);
        res.status(500).json({ success: false, error: '获取状态失败' });
    }
});

app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'API测试成功',
        database: 'PostgreSQL',
        timestamp: new Date().toISOString(),
        version: '4.0'
    });
});

// 404
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'API不存在' });
});

// 错误处理
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({ success: false, error: '服务器内部错误', message: err.message });
});

// 启动
async function startServer() {
    try {
        if (!process.env.DATABASE_URL) {
            console.error('❌ 缺少环境变量 DATABASE_URL');
            process.exit(1);
        }
        await initDB();
        app.listen(PORT, () => {
            console.log(`
            ╔══════════════════════════════════════════════╗
            ║   🚀 XIAOYI卖涂装和外挂服务 后端 v4.0        ║
            ║   🗄️  数据库: PostgreSQL                    ║
            ╠══════════════════════════════════════════════╣
            ║  📍 端口: ${PORT}                              ║
            ║  🔑 默认管理员: admin / admin123             ║
            ╚══════════════════════════════════════════════╝
            `);
        });
    } catch (error) {
        console.error('❌ 服务器启动失败:', error);
        process.exit(1);
    }
}

startServer();
