const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== 从环境变量读取配置 ==========
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const CHANGE_ID_URL = process.env.CHANGE_ID_URL;

// ========== 验证环境变量 ==========
console.log('🔍 检查环境变量...');
if (!FIREBASE_API_KEY) {
    console.error('❌ 错误：未设置 FIREBASE_API_KEY 环境变量');
    console.error('💡 请在Render控制台添加环境变量：FIREBASE_API_KEY=你的Firebase密钥');
    process.exit(1);
}

if (!CHANGE_ID_URL) {
    console.error('❌ 错误：未设置 CHANGE_ID_URL 环境变量');
    console.error('💡 请在Render控制台添加环境变量：CHANGE_ID_URL=https://jbcacc-6zpo.onrender.com/api/change-localid');
    process.exit(1);
}

console.log('✅ FIREBASE_API_KEY: 已设置');
console.log('✅ CHANGE_ID_URL:', CHANGE_ID_URL);
console.log('✅ 服务器配置完成\n');

// ========== 中间件 ==========
app.use(cors());
app.use(express.json());

// ========== Firebase API配置 ==========
const FIREBASE_AUTH_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;

// ========== API路由 ==========

// 1. 健康检查
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: '游戏ID管理后端',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'production',
        endpoints: {
            login: 'POST /api/login',
            changeId: 'POST /api/change-id'
        }
    });
});

// 2. 用户登录
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_CREDENTIALS',
                message: '邮箱和密码不能为空'
            });
        }
        
        console.log(`🔐 用户登录尝试: ${email}`);
        
        // 调用Firebase认证
        const firebaseResponse = await axios.post(FIREBASE_AUTH_URL, {
            email: email.trim(),
            password: password,
            returnSecureToken: true
        });
        
        const firebaseData = firebaseResponse.data;
        
        res.json({
            success: true,
            message: '登录成功',
            user: {
                email: firebaseData.email,
                userId: firebaseData.localId
            },
            token: {
                idToken: firebaseData.idToken,
                refreshToken: firebaseData.refreshToken,
                expiresIn: firebaseData.expiresIn
            }
        });
        
    } catch (error) {
        console.error('❌ 登录失败:', error.response?.data || error.message);
        
        let errorMessage = '登录失败';
        if (error.response?.data?.error?.message === 'INVALID_PASSWORD' || 
            error.response?.data?.error?.message === 'EMAIL_NOT_FOUND') {
            errorMessage = '邮箱或密码错误';
        }
        
        res.status(401).json({
            success: false,
            error: 'LOGIN_FAILED',
            message: errorMessage
        });
    }
});

// 3. 修改游戏ID
app.post('/api/change-id', async (req, res) => {
    try {
        const { newLocalId, idToken } = req.body;
        
        if (!newLocalId || !idToken) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_PARAMETERS',
                message: '缺少必要参数'
            });
        }
        
        console.log(`🔄 修改ID请求: ${newLocalId}`);
        
        // 直接调用你的游戏API
        const gameResponse = await axios.post(CHANGE_ID_URL, {
            newLocalId: newLocalId
        }, {
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const gameData = gameResponse.data;
        
        console.log(`✅ ID修改成功: ${gameData.newLocalId || newLocalId}`);
        
        res.json({
            success: true,
            message: '游戏ID修改成功',
            gameResponse: gameData
        });
        
    } catch (error) {
        console.error('❌ 修改ID失败:', error.message);
        
        res.status(500).json({
            success: false,
            error: 'CHANGE_ID_FAILED',
            message: '修改游戏ID失败',
            details: error.response?.data || null
        });
    }
});

// 4. 主页
app.get('/', (req, res) => {
    res.json({
        message: '游戏ID管理后端已启动',
        endpoints: [
            'GET  /health',
            'POST /api/login',
            'POST /api/change-id'
        ],
        status: 'running'
    });
});

// ========== 启动服务器 ==========
app.listen(PORT, () => {
    console.log(`
    🚀 游戏ID管理后端已启动!
    📍 端口: ${PORT}
    🌐 本地地址: http://localhost:${PORT}
    
    📋 可用API:
       POST /api/login        - 用户登录
       POST /api/change-id    - 修改游戏ID
       GET  /health           - 健康检查
    
    ⏰ 启动时间: ${new Date().toLocaleString()}
    `);
});
