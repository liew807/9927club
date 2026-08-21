const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ========== 数据库初始化（使用 sql.js） ==========
let db;

// 数据库文件路径
const DB_PATH = path.join(__dirname, 'database.db');

async function initDatabase() {
  const SQL = await initSqlJs();

  // 检查是否已有数据库文件
  let dbData = null;
  if (fs.existsSync(DB_PATH)) {
    dbData = fs.readFileSync(DB_PATH);
  }

  // 创建数据库
  if (dbData) {
    db = new SQL.Database(dbData);
  } else {
    db = new SQL.Database();
  }

  // 创建表
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

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderData TEXT NOT NULL,
      total REAL NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 检查是否有数据，没有则插入示例数据
  const countResult = db.exec('SELECT COUNT(*) as count FROM items');
  if (countResult.length === 0 || countResult[0].values[0][0] === 0) {
    const sampleItems = [
      { name: '椰浆饭 Nasi Lemak', price: 12.90, oldPrice: 15.90, category: '主食', image: '', note: '可选辣度 (小/中/大)', imgIcon: 'fa-utensils', addons: JSON.stringify([{ name: '加炸鸡', price: 4.50 }, { name: '加蛋', price: 2.00 }]) },
      { name: '槟城炒粿条', price: 11.50, oldPrice: 13.50, category: '主食', image: '', note: '含虾、腊肠', imgIcon: 'fa-utensil-spoon', addons: JSON.stringify([{ name: '加虾', price: 3.00 }, { name: '加蛋', price: 2.00 }]) },
      { name: '沙爹串 (10支)', price: 18.00, oldPrice: 22.00, category: '小吃', image: '', note: '附花生酱', imgIcon: 'fa-drumstick-bite', addons: JSON.stringify([{ name: '加鸡肉串', price: 3.50 }]) },
      { name: 'Teh Tarik 拉茶', price: 4.50, oldPrice: null, category: '饮品', image: '', note: '热饮/冷饮', imgIcon: 'fa-mug-hot', addons: JSON.stringify([{ name: '加炼奶', price: 1.00 }]) },
    ];
    const stmt = db.prepare(`INSERT INTO items (name, price, oldPrice, category, image, note, imgIcon, addons, soldOut) VALUES ( item?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    sampleItems.forEach(item => {
      stmt.run(item.name, item.price, item.oldPrice, item.category, item.image,.note, item.imgIcon, item.addons, 0);
    });
    console.log('✅ 示例数据已插入');
  }

  // 定时保存数据库（每10秒）
  setInterval(() => {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }, 10000);

  console.log('✅ 数据库初始化成功');
}

// ========== API 路由 ==========

// 获取所有商品
app.get('/api/items', (req, res) => {
  try {
    const result = db.exec('SELECT * FROM items ORDER BY id');
    let rows = [];
    if (result.length > 0) {
      const columns = result[0].columns;
      rows = result[0].values.map(row => {
        const obj = {};
        columns.forEach((col, i) => {
          obj[col] = row[i];
        });
        if (obj.addons) {
          try {
            obj.addons = JSON.parse(obj.addons);
          } catch {
            obj.addons = [];
          }
        } else {
          obj.addons = [];
        }
        return obj;
      });
    }
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
    stmt.run(name, price, oldPrice || null, category, image || '', note || '', imgIcon || 'fa-utensils', addonsStr, soldOut ? 1 : 0);
    // 获取最后插入的ID
    const lastId = db.exec('SELECT last_insert_rowid() as id');
    const id = lastId[0].values[0][0];
    res.json({ id, message: '商品添加成功' });
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
    res.json({ message: '商品更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 切换售罄状态
app.patch('/api/items/:id/toggle-soldout', (req, res) => {
  const { id } = req.params;
  try {
    const result = db.exec(`SELECT soldOut FROM items WHERE id = ${id}`);
    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(404).json({ error: '商品不存在' });
    }
    const current = result[0].values[0][0];
    const newStatus = current === 1 ? 0 : 1;
    db.run(`UPDATE items SET soldOut = ${newStatus} WHERE id = ${id}`);
    res.json({ id: parseInt(id), soldOut: newStatus === 1, message: '状态更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除商品
app.delete('/api/items/:id', (req, res) => {
  const { id } = req.params;
  try {
    db.run(`DELETE FROM items WHERE id = ${id}`);
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
    stmt.run(JSON.stringify(orderData), total);
    const lastId = db.exec('SELECT last_insert_rowid() as id');
    const id = lastId[0].values[0][0];
    res.json({ id, message: '订单提交成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取所有订单
app0.get('/api/orders', (req, res) => {
)  try {
    const result = db.exec {
('SELECT * FROM orders ORDER BY createdAt DESC');
         let rows = [];
    if (result.length >  const columns = result[0].columns;
      rows = result[0].values.map(row => {
        const obj = {};
        columns.forEach((col, i) => {
          obj[col] = row[i];
        });
        if (obj.orderData) {
          try {
            obj.orderData = JSON.parse(obj.orderData);
          } catch---

 {
            obj.orderData = [];
          }
        }
        return obj;
      });
    }
    res.json(rows);
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
  console.error('❌ 数据库初始化失败:', err);
  process.exit(1);
});
