const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ========== 数据库初始化 ==========
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
  } else {
    console.log('✅ 数据库连接成功');
    // 创建商品表
    db.run(`
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
    db.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orderData TEXT NOT NULL,
        total REAL NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ 数据表创建成功');
  }
});

// ========== API 路由 ==========

// 获取所有商品
app.get('/api/items', (req, res) => {
  db.all('SELECT * FROM items ORDER BY id', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    // 解析 addons JSON
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
  });
});

// 添加商品
app.post('/api/items', (req, res) => {
  const { name, price, oldPrice, category, image, note, imgIcon, addons, soldOut } = req.body;
  if (!name || !price || !category) {
    return res.status(400).json({ error: '缺少必要字段' });
  }
  const addonsStr = JSON.stringify(addons || []);
  db.run(
    `INSERT INTO items (name, price, oldPrice, category, image, note, imgIcon, addons, soldOut)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, price, oldPrice, category, image || '', note || '', imgIcon || 'fa-utensils', addonsStr, soldOut ? 1 : 0],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, message: '商品添加成功' });
    }
  );
});

// 更新商品（售罄状态/完整更新）
app.put('/api/items/:id', (req, res) => {
  const { id } = req.params;
  const { name, price, oldPrice, category, image, note, imgIcon, addons, soldOut } = req.body;
  
  const addonsStr = JSON.stringify(addons || []);
  db.run(
    `UPDATE items SET 
      name = COALESCE(?, name),
      price = COALESCE(?, price),
      oldPrice = ?,
      category = COALESCE(?, category),
      image = COALESCE(?, image),
      note = COALESCE(?, note),
      imgIcon = COALESCE(?, imgIcon),
      addons = COALESCE(?, addons),
      soldOut = COALESCE(?, soldOut)
     WHERE id = ?`,
    [name, price, oldPrice || null, category, image || '', note || '', imgIcon || 'fa-utensils', addonsStr, soldOut !== undefined ? (soldOut ? 1 : 0) : null, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: '商品不存在' });
      }
      res.json({ message: '商品更新成功' });
    }
  );
});

// 切换售罄状态
app.patch('/api/items/:id/toggle-soldout', (req, res) => {
  const { id } = req.params;
  db.get('SELECT soldOut FROM items WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: '商品不存在' });
    }
    const newStatus = row.soldOut === 1 ? 0 : 1;
    db.run('UPDATE items SET soldOut = ? WHERE id = ?', [newStatus, id], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: parseInt(id), soldOut: newStatus === 1, message: '状态更新成功' });
    });
  });
});

// 删除商品
app.delete('/api/items/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM items WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: '商品不存在' });
    }
    res.json({ message: '商品删除成功' });
  });
});

// ========== 订单API ==========

// 提交订单
app.post('/api/orders', (req, res) => {
  const { orderData, total } = req.body;
  if (!orderData) {
    return res.status(400).json({ error: '缺少订单数据' });
  }
  db.run(
    'INSERT INTO orders (orderData, total) VALUES (?, ?)',
    [JSON.stringify(orderData), total],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, message: '订单提交成功' });
    }
  );
});

// 获取所有订单（商家查看）
app.get('/api/orders', (req, res) => {
  db.all('SELECT * FROM orders ORDER BY createdAt DESC', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    rows.forEach(row => {
      try {
        row.orderData = JSON.parse(row.orderData);
      } catch {
        row.orderData = [];
      }
    });
    res.json(rows);
  });
});

// ========== 初始化数据（首次启动时插入示例数据） ==========
db.get('SELECT COUNT(*) as count FROM items', (err, row) => {
  if (err) return;
  if (row.count === 0) {
    const sampleItems = [
      { name: '椰浆饭 Nasi Lemak', price: 12.90, oldPrice: 15.90, category: '主食', image: '', note: '可选辣度 (小/中/大)', imgIcon: 'fa-utensils', addons: [{ name: '加炸鸡', price: 4.50 }, { name: '加蛋', price: 2.00 }] },
      { name: '槟城炒粿条', price: 11.50, oldPrice: 13.50, category: '主食', image: '', note: '含虾、腊肠', imgIcon: 'fa-utensil-spoon', addons: [{ name: '加虾', price: 3.00 }, { name: 'ik加蛋', price: 2. 00 }] },
      { name: '沙爹串 (10支)', price: 18.00, oldPrice: 22.00, category: '小吃', image: '', note: '附花生酱', imgIcon: 'fa-drumstick-bite', addons: [{ name: '加鸡肉串', price: 3.50 }] },
      { name: 'Teh Tar拉茶', price: 4.50, oldPrice: null, category: '饮品', image: '', note: '热饮/冷饮', imgIcon: 'fa-mug-hot', addons: [{ name: '加炼奶', price: 1.00 }] },
    ];
    const stmt = db.prepare(`INSERT INTO items (name, price, oldPrice, category, image, note, imgIcon, addons, soldOut) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    sampleItems.forEach(item => {
      stmt.run(item.name, item.price, item.oldPrice, item.category, item.image, item.note, item.imgIcon, JSON.stringify(item.addons), 0);
    });
    stmt.finalize();
    console.log('✅ 示例数据已插入');
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
});
