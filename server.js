// server.js - PostgreSQL 完整版 v5.0（积分制 + 竞标 + 充值审核）
const express = require('express');
const path = require('path');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static('public'));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
        ? false
        : { rejectUnauthorized: false }
});

pool.on('error', (err) => {
    console.error('❌ PostgreSQL 连接池错误:', err.message);
});

// ========== 初始化数据库 ==========
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

        await client.query(`
            CREATE TABLE IF NOT EXISTS wallets (
                user_id VARCHAR(50) PRIMARY KEY,
                balance NUMERIC(12,2) DEFAULT 0,
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS recharge_requests (
                id BIGSERIAL PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL,
                amount NUMERIC(12,2) NOT NULL,
                payment_method VARCHAR(20) DEFAULT 'tng',
                proof_image TEXT DEFAULT '',
                remark TEXT DEFAULT '',
                status VARCHAR(20) DEFAULT 'pending',
                admin_note TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT NOW(),
                reviewed_at TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS bids (
                id BIGINT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                image TEXT DEFAULT '',
                start_price NUMERIC(10,2) NOT NULL DEFAULT 0,
                end_time TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS bid_records (
                id BIGSERIAL PRIMARY KEY,
                bid_id BIGINT NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
                user_id VARCHAR(50) NOT NULL,
                price NUMERIC(10,2) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_bid_records_bid_id ON bid_records(bid_id);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_recharge_user ON recharge_requests(user_id);`);

        const userCount = await client.query('SELECT COUNT(*) FROM users');
        if (parseInt(userCount.rows[0].count) === 0) {
            await client.query(`
                INSERT INTO users (username, password, is_admin) VALUES
                ('admin', 'admin123', TRUE),
                ('xiaoyi', 'xiaoyi123', TRUE)
            `);
            console.log('✅ 已创建默认管理员账户');
        }

        const serviceCount = await client.query('SELECT COUNT(*) FROM services');
        if (parseInt(serviceCount.rows[0].count) === 0) {
            await client.query(`
                INSERT INTO services (id, type, name, link, enabled) VALUES
                (1, 'whatsapp', '官方客服', 'https://wa.me/60123456789', TRUE),
                (2, 'wechat', '微信客服', 'https://weixin.qq.com/', TRUE)
            `);
            console.log('✅ 已创建默认客服');
        }

        const settingsCount = await client.query('SELECT COUNT(*) FROM settings');
        if (parseInt(settingsCount.rows[0].count) === 0) {
            await client.query(`
                INSERT INTO settings (id, store_name, kuaishou_link, contact_info, welcome_message, enable_service)
                VALUES (1, 'XIAOYI卖涂装和外挂服务', 'https://v.kuaishou.com/JGv00n48', 'FB账号GH Tree', '欢迎选购！点击购买扫码完成付款', TRUE)
            `);
            console.log('✅ 已创建默认设置');
        }

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

// ========== 商品 API ==========
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
        res.status(500).json({ success: false, error: '获取商品失败' });
    }
});

app.post('/api/products/add', async (req, res) => {
    try {
        const { name, price, description, image, category } = req.body;
        if (!name || !price) return res.status(400).json({ success: false, error: '商品名称和价格是必填项' });
        const id = Date.now();
        const result = await pool.query(
            `INSERT INTO products (id, name, price, description, image, category)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [id, name, parseFloat(price), description || '', image || '', category || '热门']
        );
        res.json({ success: true, data: result.rows[0], message: '商品添加成功' });
    } catch (error) {
        res.status(500).json({ success: false, error: '添加商品失败' });
    }
});

app.post('/api/products/delete', async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ success: false, error: '商品ID是必填项' });
        const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0) return res.status(404).json({ success: false, error: '商品不存在' });
        res.json({ success: true, message: '商品删除成功' });
    } catch (error) {
        res.status(500).json({ success: false, error: '删除商品失败' });
    }
});

app.post('/api/products/sync', async (req, res) => {
    const client = await pool.connect();
    try {
        const { products } = req.body;
        if (!Array.isArray(products)) return res.status(400).json({ success: false, error: '商品数据格式不正确' });
        await client.query('BEGIN');
        await client.query('DELETE FROM products');
        for (const p of products) {
            await client.query(
                `INSERT INTO products (id, name, price, description, image, category)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [p.id || Date.now() + Math.floor(Math.random() * 1000), p.name, parseFloat(p.price) || 0, p.description || '', p.image || '', p.category || '热门']
            );
        }
        await client.query('COMMIT');
        res.json({ success: true, message: '同步成功' });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: '同步商品失败' });
    } finally {
        client.release();
    }
});

// ========== 订单 API ==========
app.get('/api/orders', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
        const orders = result.rows.map(o => ({
            id: Number(o.id),
            orderNumber: o.order_number,
            userId: o.user_id,
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
        res.json({ success: true, data: orders });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取订单失败' });
    }
});

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
            [id, finalOrderNumber, userId || '', productId || 0, productName || '', parseFloat(productPrice) || 0, parseFloat(totalAmount) || 0, paymentMethod || 'tng', status || 'pending', gameName || '', gameRegion || '', specifiedPlayer || '', orderRemark || '']
        );
        res.json({ success: true, data: result.rows[0], message: '订单创建成功' });
    } catch (error) {
        res.status(500).json({ success: false, error: '添加订单失败' });
    }
});

app.delete('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM orders WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0) return res.status(404).json({ success: false, error: '订单不存在' });
        res.json({ success: true, message: '订单删除成功' });
    } catch (error) {
        res.status(500).json({ success: false, error: '删除订单失败' });
    }
});

app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const validStatuses = ['pending', 'paid', 'completed'];
        if (!validStatuses.includes(status)) return res.status(400).json({ success: false, error: '无效的状态值' });
        const result = await pool.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [status, id]);
        if (result.rowCount === 0) return res.status(404).json({ success: false, error: '订单不存在' });
        res.json({ success: true, data: result.rows[0], message: '订单状态更新成功' });
    } catch (error) {
        res.status(500).json({ success: false, error: '更新订单状态失败' });
    }
});

// ========== 用户 API ==========
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
        if (result.rowCount > 0) {
            const user = result.rows[0];
            await pool.query('INSERT INTO wallets (user_id, balance) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING', [user.username]);
            res.json({
                success: true,
                data: { id: user.id, username: user.username, isAdmin: user.is_admin, createdAt: user.created_at },
                message: '登录成功'
            });
        } else {
            res.status(401).json({ success: false, error: '用户名或密码错误' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '登录失败' });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, error: '用户名和密码是必填项' });
        if (password.length < 6) return res.status(400).json({ success: false, error: '密码长度至少6位' });
        const exists = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (exists.rowCount > 0) return res.status(400).json({ success: false, error: '用户名已存在' });
        const result = await pool.query('INSERT INTO users (username, password, is_admin) VALUES ($1, $2, FALSE) RETURNING *', [username, password]);
        const user = result.rows[0];
        await pool.query('INSERT INTO wallets (user_id, balance) VALUES ($1, 0) ON CONFLICT DO NOTHING', [user.username]);
        res.json({
            success: true,
            data: { id: user.id, username: user.username, isAdmin: user.is_admin, createdAt: user.created_at },
            message: '注册成功'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '注册失败' });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, is_admin, created_at FROM users ORDER BY id');
        res.json({ success: true, data: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取用户失败' });
    }
});

// ========== 设置 API ==========
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
                enableService: s.enable_service
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取设置失败' });
    }
});

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
        res.status(500).json({ success: false, error: '更新设置失败' });
    }
});

// ========== 客服 API ==========
app.get('/api/services', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM services WHERE enabled = TRUE ORDER BY id');
        res.json({ success: true, data: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取客服失败' });
    }
});

app.get('/api/services/all', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM services ORDER BY id');
        res.json({ success: true, data: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取客服失败' });
    }
});

app.post('/api/services/add', async (req, res) => {
    try {
        const { type, name, link, enabled } = req.body;
        if (!type || !name || !link) return res.status(400).json({ success: false, error: '客服类型、名称和链接是必填项' });
        const id = Date.now();
        const result = await pool.query(
            `INSERT INTO services (id, type, name, link, enabled) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [id, type, name, link, enabled !== undefined ? enabled : true]
        );
        res.json({ success: true, data: result.rows[0], message: '客服添加成功' });
    } catch (error) {
        res.status(500).json({ success: false, error: '添加客服失败' });
    }
});

app.post('/api/services/delete', async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ success: false, error: '客服ID是必填项' });
        const result = await pool.query('DELETE FROM services WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0) return res.status(404).json({ success: false, error: '客服不存在' });
        res.json({ success: true, message: '客服删除成功' });
    } catch (error) {
        res.status(500).json({ success: false, error: '删除客服失败' });
    }
});

app.delete('/api/services/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM services WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0) return res.status(404).json({ success: false, error: '客服不存在' });
        res.json({ success: true, message: '客服删除成功' });
    } catch (error) {
        res.status(500).json({ success: false, error: '删除客服失败' });
    }
});

app.put('/api/services/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;
        const { enabled } = req.body;
        const result = await pool.query('UPDATE services SET enabled = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [enabled, id]);
        if (result.rowCount === 0) return res.status(404).json({ success: false, error: '客服不存在' });
        res.json({ success: true, data: result.rows[0], message: `客服已${enabled ? '启用' : '禁用'}` });
    } catch (error) {
        res.status(500).json({ success: false, error: '更新客服状态失败' });
    }
});

app.post('/api/services/update', async (req, res) => {
    try {
        const { id, name, link, enabled } = req.body;
        if (!id) return res.status(400).json({ success: false, error: '客服ID是必填项' });
        const result = await pool.query(
            `UPDATE services SET name = COALESCE($1, name), link = COALESCE($2, link), enabled = COALESCE($3, enabled), updated_at = NOW() WHERE id = $4 RETURNING *`,
            [name, link, enabled, id]
        );
        if (result.rowCount === 0) return res.status(404).json({ success: false, error: '客服不存在' });
        res.json({ success: true, data: result.rows[0], message: '客服信息已更新' });
    } catch (error) {
        res.status(500).json({ success: false, error: '更新客服信息失败' });
    }
});

// ========== 轮播图 API ==========
app.get('/api/carousels', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM carousels ORDER BY sort_order ASC, id ASC');
        res.json({
            success: true,
            data: result.rows.map(c => ({
                id: Number(c.id),
                imageUrl: c.image_url,
                link: c.link,
                sortOrder: c.sort_order
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取轮播图失败' });
    }
});

app.post('/api/carousels/update', async (req, res) => {
    const client = await pool.connect();
    try {
        const { carousels } = req.body;
        if (!Array.isArray(carousels)) return res.status(400).json({ success: false, error: '轮播图数据格式不正确' });
        await client.query('BEGIN');
        await client.query('DELETE FROM carousels');
        const limited = carousels.slice(0, 5);
        for (let i = 0; i < limited.length; i++) {
            const c = limited[i];
            await client.query(
                'INSERT INTO carousels (id, image_url, link, sort_order) VALUES ($1, $2, $3, $4)',
                [c.id || Date.now() + i, c.imageUrl || c.image_url, c.link || '', i]
            );
        }
        await client.query('COMMIT');
        res.json({ success: true, data: limited, message: '轮播图更新成功' });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: '更新轮播图失败' });
    } finally {
        client.release();
    }
});

// ========== 宫格按钮 API ==========
app.get('/api/grid-buttons', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM grid_buttons WHERE id = 1');
        if (result.rowCount === 0) return res.json({ success: true, data: { left: {}, right: {} } });
        const g = result.rows[0];
        res.json({
            success: true,
            data: {
                left: { img: g.left_img, link: g.left_link, label: g.left_label },
                right: { img: g.right_img, link: g.right_link, label: g.right_label }
            }
        });
    } catch (error) {
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
            [left?.img || '', left?.link || '', left?.label || '热门推荐', right?.img || '', right?.link || '', right?.label || '限时优惠']
        );
        res.json({ success: true, data: result.rows[0], message: '宫格按钮更新成功' });
    } catch (error) {
        res.status(500).json({ success: false, error: '更新宫格按钮失败' });
    }
});

// ========== 积分 / 钱包 API ==========
app.get('/api/wallet/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query('SELECT * FROM wallets WHERE user_id = $1', [userId]);
        if (result.rowCount === 0) {
            await pool.query('INSERT INTO wallets (user_id, balance) VALUES ($1, 0) ON CONFLICT DO NOTHING', [userId]);
            return res.json({ success: true, data: { userId, balance: 0 } });
        }
        res.json({ success: true, data: { userId: result.rows[0].user_id, balance: parseFloat(result.rows[0].balance) } });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取钱包失败' });
    }
});

app.post('/api/recharge/submit', async (req, res) => {
    try {
        const { userId, amount, paymentMethod, proofImage, remark } = req.body;
        if (!userId || !amount || !proofImage) {
            return res.status(400).json({ success: false, error: '用户、金额和付款截图必填' });
        }
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            return res.status(400).json({ success: false, error: '充值金额必须大于0' });
        }
        const result = await pool.query(
            `INSERT INTO recharge_requests (user_id, amount, payment_method, proof_image, remark, status)
             VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
            [userId, amountNum, paymentMethod || 'tng', proofImage, remark || '']
        );
        res.json({ success: true, data: result.rows[0], message: '充值申请已提交，等待管理员审核' });
    } catch (error) {
        console.error('提交充值申请失败:', error);
        res.status(500).json({ success: false, error: '提交充值申请失败' });
    }
});

app.get('/api/recharge/my/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query(
            'SELECT * FROM recharge_requests WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取充值记录失败' });
    }
});

app.get('/api/recharge/all', async (req, res) => {
    try {
        const { status } = req.query;
        let result;
        if (status && ['pending', 'approved', 'rejected'].includes(status)) {
            result = await pool.query('SELECT * FROM recharge_requests WHERE status = $1 ORDER BY created_at DESC', [status]);
        } else {
            result = await pool.query('SELECT * FROM recharge_requests ORDER BY created_at DESC');
        }
        res.json({ success: true, data: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取充值申请失败' });
    }
});

app.post('/api/recharge/review', async (req, res) => {
    const client = await pool.connect();
    try {
        const { requestId, action, adminNote } = req.body;
        if (!requestId || !['approve', 'reject'].includes(action)) {
            return res.status(400).json({ success: false, error: '参数不正确' });
        }
        await client.query('BEGIN');
        const reqResult = await client.query('SELECT * FROM recharge_requests WHERE id = $1 FOR UPDATE', [requestId]);
        if (reqResult.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: '充值申请不存在' });
        }
        const recharge = reqResult.rows[0];
        if (recharge.status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, error: '该申请已审核过' });
        }

        if (action === 'approve') {
            await client.query(
                `INSERT INTO wallets (user_id, balance) VALUES ($1, $2)
                 ON CONFLICT (user_id) DO UPDATE SET balance = wallets.balance + $2, updated_at = NOW()`,
                [recharge.user_id, parseFloat(recharge.amount)]
            );
            await client.query(
                `UPDATE recharge_requests SET status = 'approved', admin_note = $1, reviewed_at = NOW() WHERE id = $2`,
                [adminNote || '', requestId]
            );
        } else {
            await client.query(
                `UPDATE recharge_requests SET status = 'rejected', admin_note = $1, reviewed_at = NOW() WHERE id = $2`,
                [adminNote || '', requestId]
            );
        }

        await client.query('COMMIT');
        res.json({ success: true, message: action === 'approve' ? '已通过，积分已到账' : '已拒绝该充值申请' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('审核充值失败:', error);
        res.status(500).json({ success: false, error: '审核充值失败' });
    } finally {
        client.release();
    }
});

// ========== 竞标 API ==========
app.get('/api/bids', async (req, res) => {
    try {
        const bidsResult = await pool.query('SELECT * FROM bids ORDER BY created_at DESC');
        const bids = [];
        for (const b of bidsResult.rows) {
            const recordsResult = await pool.query(
                'SELECT user_id, price FROM bid_records WHERE bid_id = $1 ORDER BY price DESC, created_at ASC',
                [b.id]
            );
            const records = recordsResult.rows;
            const highestPrice = records.length > 0 ? parseFloat(records[0].price) : parseFloat(b.start_price);
            const topBids = records.slice(0, 5).map(r => ({ user: r.user_id, price: parseFloat(r.price) }));
            const ended = new Date(b.end_time).getTime() <= Date.now();
            bids.push({
                id: Number(b.id),
                name: b.name,
                image: b.image,
                startPrice: parseFloat(b.start_price),
                endTime: b.end_time,
                highestPrice,
                topBids,
                status: ended ? 'ended' : 'active'
            });
        }
        res.json({ success: true, data: bids });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取竞标商品失败' });
    }
});

app.post('/api/bids/add', async (req, res) => {
    try {
        const { name, image, startPrice, endTime } = req.body;
        if (!name || !startPrice || !endTime) return res.status(400).json({ success: false, error: '名称、起拍价和结束时间必填' });
        const id = Date.now();
        const result = await pool.query(
            `INSERT INTO bids (id, name, image, start_price, end_time)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [id, name, image || '', parseFloat(startPrice), new Date(endTime)]
        );
        res.json({ success: true, data: result.rows[0], message: '竞标商品添加成功' });
    } catch (error) {
        res.status(500).json({ success: false, error: '添加竞标商品失败' });
    }
});

app.delete('/api/bids/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM bids WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0) return res.status(404).json({ success: false, error: '竞标商品不存在' });
        res.json({ success: true, message: '竞标商品删除成功' });
    } catch (error) {
        res.status(500).json({ success: false, error: '删除竞标商品失败' });
    }
});

app.post('/api/bids/:id/bid', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { userId, price } = req.body;
        if (!userId || !price) return res.status(400).json({ success: false, error: '用户和出价金额必填' });
        const priceNum = parseFloat(price);
        if (isNaN(priceNum) || priceNum <= 0) return res.status(400).json({ success: false, error: '出价金额必须大于0' });

        await client.query('BEGIN');
        const bidResult = await client.query('SELECT * FROM bids WHERE id = $1 FOR UPDATE', [id]);
        if (bidResult.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: '竞标商品不存在' });
        }
        const bid = bidResult.rows[0];
        if (new Date(bid.end_time).getTime() <= Date.now()) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, error: '竞标已结束，无法出价' });
        }

        const highestResult = await client.query('SELECT MAX(price) AS max_price FROM bid_records WHERE bid_id = $1', [id]);
        const currentHighest = highestResult.rows[0].max_price !== null ? parseFloat(highestResult.rows[0].max_price) : parseFloat(bid.start_price);
        if (priceNum <= currentHighest) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, error: `出价必须高于当前最高价 ${currentHighest.toFixed(2)} 积分` });
        }

        const walletResult = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
        if (walletResult.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, error: '用户钱包不存在，请先充值' });
        }
        const balance = parseFloat(walletResult.rows[0].balance);
        if (balance < priceNum) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, error: `积分不足，当前余额 ${balance.toFixed(2)} 积分` });
        }

        await client.query('UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE user_id = $2', [priceNum, userId]);

        const insertResult = await client.query(
            'INSERT INTO bid_records (bid_id, user_id, price) VALUES ($1, $2, $3) RETURNING *',
            [id, userId, priceNum]
        );

        await client.query('COMMIT');
        res.json({ success: true, data: insertResult.rows[0], message: '出价成功，已扣除相应积分' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('出价失败:', error);
        res.status(500).json({ success: false, error: '出价失败' });
    } finally {
        client.release();
    }
});

// ========== 状态 / 测试 ==========
app.get('/api/status', async (req, res) => {
    try {
        const [p, o, u, s, b] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM products'),
            pool.query('SELECT COUNT(*) FROM orders'),
            pool.query('SELECT COUNT(*) FROM users'),
            pool.query('SELECT COUNT(*) FROM services'),
            pool.query('SELECT COUNT(*) FROM bids')
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
                bidsCount: parseInt(b.rows[0].count),
                uptime: process.uptime(),
                version: '5.0 (PostgreSQL + Points + Bids)'
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取状态失败' });
    }
});

app.get('/api/test', (req, res) => {
    res.json({ success: true, message: 'API测试成功', timestamp: new Date().toISOString(), version: '5.0' });
});

app.use((req, res) => {
    res.status(404).json({ success: false, error: 'API不存在' });
});

app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({ success: false, error: '服务器内部错误', message: err.message });
});

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
            ║   🚀 商城后端 v5.0（积分 + 竞标 + 充值审核） ║
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
