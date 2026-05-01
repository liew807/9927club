const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 创建必要文件夹
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// 托管静态文件
app.use('/uploads', express.static(uploadDir));
app.use(express.static(__dirname));

// 初始化数据库
const dbPath = path.join(__dirname, 'data.json');
const initData = {
  goods: [],
  category: [
    { id: "hot", name: "🔥 热销零食" },
    { id: "moyu", name: "魔芋爽" },
    { id: "latiao", name: "辣条" },
    { id: "luosifen", name: "螺蛳粉" },
    { id: "qqcandy", name: "QQ糖果" }
  ]
};

if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify(initData, null, 2));
}

const DB = {
  read() {
    return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  },
  write(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  }
};

// 上传配置
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + '_' + file.originalname);
  }
});
const upload = multer({ storage });

// ========== API 路由 ==========

// 商品相关
app.get('/api/goods', (req, res) => {
  res.json(DB.read().goods);
});

app.post('/api/goods/save', upload.single('img'), (req, res) => {
  let db = DB.read();
  let body = req.body;
  let img = req.file ? `/uploads/${req.file.filename}` : body.oldImg;
  
  let obj = {
    id: body.id || Date.now().toString(),
    code: body.code,
    name: body.name,
    cateId: body.cateId,
    cateName: body.cateName,
    price: Number(body.price),
    stock: Number(body.stock),
    img: img
  };
  
  if (body.id) {
    let index = db.goods.findIndex(x => x.id === body.id);
    if (index > -1) db.goods[index] = obj;
  } else {
    db.goods.push(obj);
  }
  
  DB.write(db);
  res.json({ ok: true });
});

app.post('/api/goods/del', (req, res) => {
  let db = DB.read();
  db.goods = db.goods.filter(x => x.id !== req.body.id);
  DB.write(db);
  res.json({ ok: true });
});

// 分类相关
app.get('/api/category', (req, res) => {
  res.json(DB.read().category);
});

app.post('/api/category/add', (req, res) => {
  let db = DB.read();
  db.category.push({
    id: 'cate_' + Date.now(),
    name: req.body.name
  });
  DB.write(db);
  res.json({ ok: true });
});

app.post('/api/category/del', (req, res) => {
  let db = DB.read();
  db.category = db.category.filter(x => x.id !== req.body.id);
  DB.write(db);
  res.json({ ok: true });
});

// 重置数据（可选）
app.post('/api/reset', (req, res) => {
  DB.write(initData);
  res.json({ ok: true, message: '数据已重置' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`✅ 服务器运行在端口 ${PORT}`);
  console.log(`🔗 本地访问: http://localhost:${PORT}`);
});
