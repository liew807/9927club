// server.js - 完整修复版（修复横幅上传网络错误和数据格式问题）
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== 关键修复：大幅增加请求限制 ==========
app.use(cors({
    origin: '*',  // 允许所有域名
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// 修复1：增加请求大小限制到100mb
app.use(express.json({ 
    limit: '100mb',
    parameterLimit: 1000000
}));

app.use(express.urlencoded({ 
    extended: true, 
    limit: '100mb',
    parameterLimit: 1000000 
}));

app.use(express.static('public'));

// ========== 数据文件配置 ==========
const DATA_FILE = path.join(__dirname, 'data.json');

// 确保数据文件存在
async function ensureDataFile() {
    try {
        await fs.access(DATA_FILE);
        console.log('✅ 数据文件已存在');
    } catch {
        const initialData = {
            users: [
                { 
                    id: 1,
                    username: 'admin', 
                    password: 'admin123', 
                    isAdmin: true,
                    createdAt: new Date().toISOString()
                }
            ],
            products: [],
            orders: [],
            services: [
                {
                    id: 1,
                    type: 'whatsapp',
                    name: '官方客服',
                    link: 'https://wa.me/60123456789',
                    enabled: true,
                    createdAt: new Date().toISOString()
                },
                {
                    id: 2,
                    type: 'wechat',
                    name: '微信客服',
                    link: 'https://weixin.qq.com/',
                    enabled: true,
                    createdAt: new Date().toISOString()
                }
            ],
            settings: {
                storeName: 'YP俱乐部',
                kuaishouLink: 'https://v.kuaishou.com/JGv00n48',
                contactInfo: 'FB账号GH Tree',
                welcomeMessage: '欢迎选购！点击购买扫码完成付款',
                enableService: true,
                updatedAt: new Date().toISOString()
            },
            banner: null,
            lastUpdated: new Date().toISOString()
        };
        
        await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
        console.log('✅ 创建初始数据文件 data.json');
    }
}

// 读取数据
async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const parsed = JSON.parse(data);
        
        // 确保数据结构完整
        if (!parsed.users) parsed.users = [];
        if (!parsed.products) parsed.products = [];
        if (!parsed.orders) parsed.orders = [];
        if (!parsed.services) parsed.services = [];
        if (!parsed.settings) parsed.settings = {};
        if (!parsed.banner) parsed.banner = null;
        
        // 确保订单有游戏信息字段
        if (parsed.orders) {
            parsed.orders = parsed.orders.map(order => ({
                gameName: '',
                gameRegion: '',
                specifiedPlayer: '',
                orderRemark: '',
                ...order
            }));
        }
        
        return parsed;
    } catch (error) {
        console.error('❌ 读取数据失败:', error.message);
        await ensureDataFile();
        return await readData();
    }
}

// 保存数据
async function saveData(data) {
    try {
        data.lastUpdated = new Date().toISOString();
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
        console.log('💾 数据已保存到 data.json');
        return true;
    } catch (error) {
        console.error('❌ 保存数据失败:', error);
        return false;
    }
}

// ========== 修复2：专门处理横幅上传的路由（放在最前面）==========
app.post('/api/settings/banner', async (req, res) => {
    try {
        console.log('='.repeat(50));
        console.log('📷 接收横幅上传请求');
        console.log('请求方法:', req.method);
        console.log('Content-Type:', req.headers['content-type']);
        
        let bannerData = req.body;
        let rawData = '';
        
        // 修复3：手动解析原始请求体（如果JSON解析失败）
        if (!bannerData || Object.keys(bannerData).length === 0) {
            console.log('⚠️ req.body为空，尝试解析原始数据');
            
            // 获取原始数据
            req.on('data', chunk => {
                rawData += chunk;
            });
            
            await new Promise(resolve => req.on('end', resolve));
            
            if (rawData) {
                try {
                    bannerData = JSON.parse(rawData);
                    console.log('✅ 成功解析原始JSON数据');
                } catch (e) {
                    console.log('📝 原始数据不是JSON格式，尝试作为字符串处理');
                    bannerData = rawData;
                }
            }
        }
        
        console.log('横幅数据类型:', typeof bannerData);
        if (typeof bannerData === 'object') {
            console.log('横幅数据keys:', Object.keys(bannerData));
        }
        
        const data = await readData();
        
        // ========== 修复4：兼容所有可能的横幅数据格式 ==========
        let bannerSaved = false;
        
        // 情况1：直接是base64字符串
        if (typeof bannerData === 'string' && bannerData.startsWith('data:image/')) {
            console.log('📷 格式1: 直接base64字符串');
            data.banner = {
                type: 'base64',
                dataUrl: bannerData,
                filename: 'banner.png',
                size: bannerData.length,
                mimetype: bannerData.split(';')[0].split(':')[1] || 'image/png',
                altText: '商城横幅',
                title: '商城顶部横幅',
                enabled: true,
                uploadedAt: new Date().toISOString()
            };
            bannerSaved = true;
        }
        // 情况2：直接是URL字符串
        else if (typeof bannerData === 'string' && bannerData.startsWith('http')) {
            console.log('📷 格式2: 直接URL字符串');
            data.banner = {
                type: 'url',
                url: bannerData,
                altText: '商城横幅',
                title: '商城顶部横幅',
                enabled: true,
                uploadedAt: new Date().toISOString()
            };
            bannerSaved = true;
        }
        // 情况3：对象中包含dataUrl字段
        else if (bannerData.dataUrl && typeof bannerData.dataUrl === 'string' && bannerData.dataUrl.startsWith('data:image/')) {
            console.log('📷 格式3: 对象中包含dataUrl');
            data.banner = {
                type: 'base64',
                dataUrl: bannerData.dataUrl,
                filename: bannerData.filename || bannerData.file?.name || 'banner.png',
                size: bannerData.size || bannerData.file?.size || bannerData.dataUrl.length,
                mimetype: bannerData.mimetype || bannerData.file?.type || 'image/png',
                altText: bannerData.altText || '商城横幅',
                title: bannerData.title || '商城顶部横幅',
                enabled: bannerData.enabled !== false,
                uploadedAt: new Date().toISOString()
            };
            bannerSaved = true;
        }
        // 情况4：对象中包含url字段
        else if (bannerData.url && typeof bannerData.url === 'string' && bannerData.url.startsWith('http')) {
            console.log('📷 格式4: 对象中包含url');
            data.banner = {
                type: 'url',
                url: bannerData.url,
                altText: bannerData.altText || '商城横幅',
                title: bannerData.title || '商城顶部横幅',
                enabled: bannerData.enabled !== false,
                uploadedAt: new Date().toISOString()
            };
            bannerSaved = true;
        }
        // 情况5：对象中包含file字段（前端预览格式）
        else if (bannerData.file) {
            console.log('📷 格式5: 对象中包含file字段');
            if (bannerData.file.dataUrl && bannerData.file.dataUrl.startsWith('data:image/')) {
                data.banner = {
                    type: 'base64',
                    dataUrl: bannerData.file.dataUrl,
                    filename: bannerData.file.name || 'banner.png',
                    size: bannerData.file.size || 0,
                    mimetype: bannerData.file.type || 'image/png',
                    altText: bannerData.altText || '商城横幅',
                    title: bannerData.title || '商城顶部横幅',
                    enabled: true,
                    uploadedAt: new Date().toISOString()
                };
                bannerSaved = true;
            } else if (bannerData.file.url) {
                data.banner = {
                    type: 'url',
                    url: bannerData.file.url,
                    altText: bannerData.altText || '商城横幅',
                    title: bannerData.title || '商城顶部横幅',
                    enabled: true,
                    uploadedAt: new Date().toISOString()
                };
                bannerSaved = true;
            }
        }
        // 情况6：从FormData上传的格式
        else if (bannerData.image && typeof bannerData.image === 'string' && bannerData.image.startsWith('data:image/')) {
            console.log('📷 格式6: image字段');
            data.banner = {
                type: 'base64',
                dataUrl: bannerData.image,
                filename: 'banner.png',
                size: bannerData.image.length,
                mimetype: bannerData.image.split(';')[0].split(':')[1] || 'image/png',
                altText: bannerData.altText || '商城横幅',
                title: bannerData.title || '商城顶部横幅',
                enabled: true,
                uploadedAt: new Date().toISOString()
            };
            bannerSaved = true;
        }
        
        if (bannerSaved) {
            await saveData(data);
            console.log('✅ 横幅图片保存成功!');
            console.log('横幅数据类型:', data.banner.type);
            console.log('保存时间:', data.banner.uploadedAt);
            
            res.json({
                success: true,
                data: data.banner,
                message: '横幅图片上传成功'
            });
        } else {
            console.warn('❌ 无法识别的横幅数据格式');
            console.log('收到的数据:', JSON.stringify(bannerData).substring(0, 200) + '...');
            
            res.status(400).json({
                success: false,
                error: '横幅数据格式不正确',
                details: '请提供base64图片数据或图片URL',
                receivedType: typeof bannerData,
                sample: '支持的格式: { "dataUrl": "data:image/png;base64,..." } 或 { "url": "https://..." }'
            });
        }
    } catch (error) {
        console.error('❌ 上传横幅失败:', error);
        res.status(500).json({
            success: false,
            error: '上传横幅失败',
            message: error.message
        });
    }
});

// ========== 其他横幅管理API ==========

// 获取横幅图片信息
app.get('/api/settings/banner', async (req, res) => {
    try {
        const data = await readData();
        res.json({
            success: true,
            data: data.banner || null,
            message: data.banner ? '横幅图片存在' : '暂无横幅图片'
        });
    } catch (error) {
        console.error('获取横幅失败:', error);
        res.status(500).json({ success: false, error: '获取横幅失败' });
    }
});

// 更新横幅信息
app.post('/api/settings/banner/update', async (req, res) => {
    try {
        const { url, altText, title, enabled } = req.body;
        console.log('📷 更新横幅图片信息');
        
        const data = await readData();
        
        if (!data.banner) {
            return res.status(404).json({
                success: false,
                error: '没有横幅可更新'
            });
        }
        
        if (url) {
            data.banner.url = url;
            data.banner.type = 'url';
        }
        if (altText !== undefined) data.banner.altText = altText;
        if (title !== undefined) data.banner.title = title;
        if (enabled !== undefined) data.banner.enabled = enabled !== false;
        
        data.banner.updatedAt = new Date().toISOString();
        await saveData(data);
        
        console.log('✅ 横幅信息更新成功');
        
        res.json({
            success: true,
            data: data.banner,
            message: '横幅信息已更新'
        });
    } catch (error) {
        console.error('更新横幅失败:', error);
        res.status(500).json({ success: false, error: '更新横幅失败' });
    }
});

// 删除横幅图片
app.delete('/api/settings/banner', async (req, res) => {
    try {
        const data = await readData();
        
        if (!data.banner) {
            return res.status(404).json({
                success: false,
                error: '当前没有横幅图片'
            });
        }
        
        data.banner = null;
        await saveData(data);
        
        console.log('✅ 横幅图片已移除');
        
        res.json({
            success: true,
            message: '横幅图片已删除'
        });
    } catch (error) {
        console.error('删除横幅失败:', error);
        res.status(500).json({ success: false, error: '删除横幅失败' });
    }
});

// 切换横幅状态
app.put('/api/settings/banner/toggle', async (req, res) => {
    try {
        const { enabled } = req.body;
        console.log(`📷 切换横幅
