const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ========== 从环境变量读取数据库连接 ==========
// Render 会自动注入 DATABASE_URL
// 您只需要在 Render 面板设置环境变量即可
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ========== 初始化数据库 ==========
async function initDatabase() {
  try {
    // 创建商品表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        oldPrice DECIMAL(10,2),
        category TEXT NOT NULL,
        image TEXT,
        note TEXT,
        imgIcon TEXT,
        soldOut BOOLEAN DEFAULT FALSE,
        addons JSONB DEFAULT '[]'::jsonb,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建订单表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        orderData JSONB NOT NULL,
        total DECIMAL(10,2) NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 检查是否有数据
    const result = await pool.query('SELECT COUNT(*) FROM items');
    if (parseInt(result.rows[0].count) === 0) {
      const sampleItems = [
        ['椰浆饭 Nasi Lemak', 12.90, 15.90, '主食', '', '可选辣度 (小/中/大)', 'fa-utensils', JSON.stringify([{ name: '加炸鸡', price: 4.50 }, { name: '加蛋', price: 2.00 }])],
        ['槟城炒粿条', 11.50, 13.50, '主食', '', '含虾、腊肠', 'fa-utensil-spoon', JSON.stringify([{ name: '加虾', price: 3.00 }, { name: '加蛋', price: 2.00 }])],
        ['沙爹串 (10支)', 18.00, 22.00, '小吃', '', '附花生酱', 'fa-drumstick-bite', JSON.stringify([{ name: '加鸡肉串', price: 3.50 }])],
        ['Teh Tarik 拉茶', 4.50, null, '饮品', '', '热饮/冷饮', 'fa-mug-hot', JSON.stringify([{ name: '加炼奶', price: 1.00 }])]
      ];

      for (const item of sampleItems) {
        await pool.query(
          `INSERT INTO items (name, price, oldPrice, category, image, note, imgIcon, addons) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
          item
        );
      }
      console.log('✅ 示例数据已插入');
    }

    console.log('✅ 数据库初始化成功');
  } catch (err) {
    console.error('❌ 数据库初始化失败:', err);
    throw err;
  }
}

// ========== API 路由 ==========

// 获取所有商品
app.get('/api/items', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM items ORDER BY id');
    const items = result.rows.map(row => ({
      ...row,
      addons: row.addons || []
    }));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 添加商品
app.post('/api/items', async (req, res) => {
  const { name, price, oldPrice, category, image, note, imgIcon, addons, soldOut } = req.body;
  
  if (!name || !price || !category) {
    return res.status(400).json({ error: '缺少必要字段' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO items (name, price, oldPrice, category, image, note, imgIcon, addons, soldOut)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
       RETURNING id`,
      [name, price, oldPrice || null, category, image || '', note || '', imgIcon || 'fa-utensils', JSON.stringify(addons || []), soldOut || false]
    );
    res.json({ id: result.rows[0].id, message: '商品添加成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 更新商品
app.put('/api/items/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, price, oldPrice, category, image, note, imgIcon, addons, soldOut } = req.body;

  try {
    await pool.query(
      `UPDATE items SET 
        name = COALESCE($1, name),
        price = COALESCE($2, price),
        oldPrice = $3,
        category = COALESCE($4, category),
        image = COALESCE($5, image),
        note = COALESCE($6, note),
        imgIcon = COALESCE($7, imgIcon),
        addons = COALESCE($8::jsonb, addons),
        soldOut = COALESCE($9, soldOut)
       WHERE id = $10`,
      [name, price, oldPrice || null, category, image || '', note || '', imgIcon || 'fa-utensils', JSON.stringify(addons || []), soldOut, id]
    );
    res.json({ message: '商品更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 切换售罄状态
app.patch('/api/items/:id/toggle-soldout', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const result = await pool.query('SELECT soldOut FROM items WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '商品不存在' });
    }
    const newStatus = !result.rows[0].soldout;
    await pool.query('UPDATE items SET soldOut = $1 WHERE id = $2', [newStatus, id]);
    res.json({ id, soldOut: newStatus, message: '状态更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除商品
app.delete('/api/items/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await pool.query('DELETE FROM items WHERE id = $1', [id]);
    res.json({ message: '商品删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 提交订单
app.post('/api/orders', async (req, res) => {
  const { orderData, total } = req.body;
  if (!orderData) {
    return res.status(400).json({ error: '缺少订单数据' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO orders (orderData, total) VALUES ($1::jsonb, $2) RETURNING id',
      [JSON.stringify(orderData), total]
    );
    res.json({ id: result.rows[0].id, message: '订单提交成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取所有订单
app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY createdAt DESC');
    const orders = result.rows.map(row => ({
      ...row,
      orderData: row.orderdata || []
    }));
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 启动服务器 ==========
initDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 服务器运行在 http://0.0.0.0:${PORT}`);
  });
}).catch(err => {
  console.error('❌ 启动失败:', err);
  process.exit(1);
});
