const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ========== 数据库初始化 ==========
const db = new Database('./database.db');

// 创建商品表
db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    oldPrice REAL,
    category TEXT NOT NULL,
    image TEXT,
    note TEXT,
    imgIcon TEXT,
    soldOut INTEGER DEFAULT 0,
    addons TEXT
  )
`);

// 创建订单表
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orderData TEXT NOT NULL,
    total REAL NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

console.log('✅ 数据库初始化成功');

// ========== API 路由 ==========

// 获取所有商品
app.get('/api/items', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM items ORDER BY id').all();
    rows.forEach(row => {
      if (row.addons) {
        try {
          row.addons = JSON.parse(row.addons);
        } catch {
          row.addons = [];
        }
      } else {
        row.addons = [];
      }
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 添加商品
app.post('/api/items', (req, res) => {
  const { name, price, oldPrice, category, image, note, imgIcon, addons, soldOut } = req.body;
  if (!name || !price || !category) {
    return res.status(400).json({ error: '缺少必要字段' });
  }
  try {
    const addonsStr = JSON.stringify(addons || []);
    const stmt = db.prepare(`
      INSERT INTO items (name, price, oldPrice, category, image, note, imgIcon, addons, soldOut)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(name, price, oldPrice || null, category, image || '', note || '', imgIcon || 'fa-utensils', addonsStr, soldOut ? 1 : 0);
    res.json({ id: info.lastInsertRowid, message: '商品添加成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 更新商品
app.put('/api/items/:id', (req, res) => {
  const { id } = req.params;
  const { name, price, oldPrice, category, image, note, imgIcon, addons, soldOut } = req.body;
  try {
    const addonsStr = JSON.stringify(addons || []);
    const stmt = db.prepare(`
      UPDATE items SET 
        name = COALESCE(?, name),
        price = COALESCE(?, price),
        oldPrice = ?,
        category = COALESCE(?, category),
        image = COALESCE(?, image),
        note = COALESCE(?, note),
        imgIcon = COALESCE(?, imgIcon),
        addons = COALESCE(?, addons),
        soldOut = COALESCE(?, soldOut)
      WHERE id = ?
    `);
    const result = stmt.run(name, price, oldPrice || null, category, image || '', note || '', imgIcon || 'fa-utensils', addonsStr, soldOut !== undefined ? (soldOut ? 1 : 0) : null, id);
    if (result.changes === 0) {
      return res.status(404).json({ error: '商品不存在' });
    }
    res.json({ message: '商品更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 切换售罄状态
app.patch('/api/items/:id/toggle-soldout', (req, res) => {
  const { id } = req.params;
  try {
    const row = db.prepare('SELECT soldOut FROM items WHERE id = ?').get(id);
    if (!row) {
      return res.status(404).json({ error: '商品不存在' });
    }
    const newStatus = row.soldOut === 1 ? 0 : 1;
    db.prepare('UPDATE items SET soldOut = ? WHERE id = ?').run(newStatus, id);
    res.json({ id: parseInt(id), soldOut: newStatus === 1, message: '状态更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除商品
app.delete('/api/items/:id', (req, res) => {
  const { id } = req.params;
  try {
    const result = db.prepare('DELETE FROM items WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: '商品不存在' });
    }
    res.json({ message: '商品删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 提交订单
app.post('/api/orders', (req, res) => {
  const { orderData, total } = req.body;
  if (!orderData) {
    return res.status(400).json({ error: '缺少订单数据' });
  }
  try {
    const stmt = db.prepare('INSERT INTO orders (orderData, total) VALUES (?, ?)');
    const info = stmt.run(JSON.stringify(orderData), total);
    res.json({ id: info.lastInsertRowid, message: '订单提交成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取所有订单
app.get('/api/orders', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM orders ORDER BY createdAt DESC').all();
    rows.forEach(row => {
      try {
        row.orderData = JSON.parse(row.orderData);
      } catch {
        row.orderData = [];
      }
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 初始化示例数据 ==========
const count = db.prepare('SELECT COUNT(*) as count FROM items').get();
if (count.count === 0) {
  const sampleItems = [
    { name: '椰浆饭 Nasi Lemak', price: 12.90, oldPrice: 15.90, category: '主食', image: '', note: '可选辣度 (小/中/大)', imgIcon: 'fa-utensils', addons: [{ name: '加炸鸡', price: 4.50 }, { name: '加蛋', price: 2.00 }] },
    { name: '槟城炒粿条', price: 11.50, oldPrice: 13.50, category: '主食', image: '', note: '含虾、腊肠', imgIcon: 'fa-utensil-spoon', addons: [{ name: '加虾', price: 3.00 }, { name: '加蛋', price: 2.00 }] },
    { name: '沙爹串 (10支)', price: 18.00, oldPrice: 22.00, category: '小吃', image: '', note: '附花生酱', imgIcon: 'fa-drumstick-bite', addons: [{ name: '加鸡肉串', price: 3.50 }] },
    { name: 'Teh Tarik 拉茶', price: 4.50, oldPrice: null, category: '饮品', image: '', note: '热饮/冷饮', imgIcon: 'fa-mug-hot', addons: [{ name: '加炼奶', price: 1.00 }] },
  ];
  const stmt = db.prepare(`INSERT INTO items (name, price, oldPrice, category, image, note, imgIcon, addons, soldOut) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  sampleItems.forEach(item => {
    stmt.run(item.name, item.price, item.oldPrice, item.category, item.image, item.note, item.imgIcon, JSON.stringify(item.addons), 0);
  });
  console.log('✅ 示例数据已插入');
}

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 服务器运行在 http://0.0.0.0:${PORT}`);
});
