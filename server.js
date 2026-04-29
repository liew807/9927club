const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = 3000;

// 基础中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 跨域
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

// 托管图片
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(uploadDir));

// 允许直接访问根目录html文件
app.use(express.static(__dirname));

// 初始化数据库
const dbPath = path.join(__dirname, 'data.json');
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({
    goods: [],
    category: [
      {id:"hot",name:"🔥 热销零食"},
      {id:"moyu",name:"魔芋爽"},
      {id:"latiao",name:"辣条"},
      {id:"luosifen",name:"螺蛳粉"},
      {id:"qqcandy",name:"QQ糖果"}
    ]
  },null,2))
}

const DB = {
  read(){return JSON.parse(fs.readFileSync(dbPath,'utf-8'))},
  write(d){fs.writeFileSync(dbPath,JSON.stringify(d,null,2))}
}

// 上传配置
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_,f,cb)=>cb(null,Date.now()+"_"+f.originalname)
})
const upload = multer({storage});

// 商品
app.get('/api/goods',(req,res)=>res.json(DB.read().goods))
app.post('/api/goods/save',upload.single('img'),(req,res)=>{
  let db = DB.read();
  let b = req.body;
  let img = req.file ? `/uploads/${req.file.filename}` : b.oldImg;
  let obj = {
    id:b.id||Date.now()+"",
    code:b.code,
    name:b.name,
    cateId:b.cateId,
    cateName:b.cateName,
    price:Number(b.price),
    stock:Number(b.stock),
    img
  }
  if(b.id){
    let i = db.goods.findIndex(x=>x.id===b.id);
    if(i>-1) db.goods[i]=obj;
  }else{
    db.goods.push(obj);
  }
  DB.write(db);
  res.json({ok:true})
})
app.post('/api/goods/del',(req,res)=>{
  let db = DB.read();
  db.goods = db.goods.filter(x=>x.id!==req.body.id);
  DB.write(db);
  res.json({ok:true})
})

// 分类
app.get('/api/category',(req,res)=>res.json(DB.read().category))
app.post('/api/category/add',(req,res)=>{
  let db = DB.read();
  db.category.push({id:"cate_"+Date.now(),name:req.body.name});
  DB.write(db);
  res.json({ok:true})
})
app.post('/api/category/del',(req,res)=>{
  let db = DB.read();
  db.category = db.category.filter(x=>x.id!==req.body.id);
  DB.write(db);
  res.json({ok:true})
})

app.listen(PORT,()=>{
  console.log("✅ 后端启动成功");
  console.log("🔗 网址：http://localhost:3000")
})
