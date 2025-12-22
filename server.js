const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 详细的CORS配置
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// 环境变量检查
const REQUIRED_ENV_VARS = ['FIREBASE_API_KEY', 'CPM_BASE_URL'];
REQUIRED_ENV_VARS.forEach(varName => {
    if (!process.env[varName]) {
        console.error(`❌ 缺少必要环境变量: ${varName}`);
        process.exit(1);
    }
});

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const CPM_BASE_URL = process.env.CPM_BASE_URL;

// ==================== 系统配置 ====================
// 管理员密钥（硬编码在代码中）
const ADMIN_KEY = 'Liew1201';

// 内存数据库
let keysDatabase = [];
let usersDatabase = [];
let logsDatabase = [];

// 请求日志中间件
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// 生成10位随机大写字母+数字的密钥
function generateRandomKey(type = 'hour', days = null) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomPart = '';
    
    for (let i = 0; i < 10; i++) {
        randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    const prefix = type === 'hour' ? 'CPM-HOUR' : 'CPM-FULL';
    const key = `${prefix}-${randomPart}`;
    
    return {
        key: key,
        type: type,
        days: type === 'hour' ? '1小时' : `${days || 30}天`,
        status: 'unused',
        created: new Date().toLocaleString('zh-CN'),
        note: '',
        bindTime: null,
        boundUser: null
    };
}

// 初始化测试数据
function initializeTestData() {
    if (keysDatabase.length === 0) {
        // 生成测试密钥
        keysDatabase.push(generateRandomKey('hour'));
        keysDatabase.push(generateRandomKey('full', 30));
        
        console.log('✅ 初始化测试密钥完成');
    }
}

// 初始化
initializeTestData();

// 添加日志
function addLog(user, action, content, ip = '127.0.0.1') {
    const log = {
        time: new Date().toLocaleString('zh-CN'),
        user: user,
        action: action,
        content: content,
        ip: ip
    };
    
    logsDatabase.push(log);
    
    // 只保留最近的1000条日志
    if (logsDatabase.length > 1000) {
        logsDatabase = logsDatabase.slice(-1000);
    }
    
    console.log(`📝 日志: ${log.time} | ${user} | ${action} | ${content}`);
}

// ==================== 验证API ====================
app.post('/api/verify', (req, res) => {
    const { accessKey, username, email, password } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    console.log(`🔐 验证请求: 用户=${username}, 密钥=${accessKey}, IP=${clientIp}`);
    
    if (!accessKey || !username) {
        return res.json({ 
            success: false, 
            message: '请填写完整的验证信息' 
        });
    }
    
    // 检查是否是管理员密钥
    if (accessKey === ADMIN_KEY && username === 'admin') {
        addLog('admin', '管理员登录', `管理员登录系统`, clientIp);
        
        return res.json({
            success: true,
            message: '管理员验证成功',
            userType: 'admin',
            cardType: 'admin',
            username: username,
            email: 'admin@cpmcy.com',
            verified: true
        });
    }
    
    // 检查密钥是否有效
    const keyData = keysDatabase.find(k => k.key === accessKey);
    
    if (!keyData) {
        addLog(username, '验证失败', `密钥不存在: ${accessKey}`, clientIp);
        return res.json({ 
            success: false, 
            message: '密钥不存在' 
        });
    }
    
    // 检查密钥状态
    if (keyData.status === 'used') {
        // 密钥已绑定，检查是否是绑定用户
        if (keyData.boundUser === username) {
            // 已有用户登录
            const user = usersDatabase.find(u => u.username === username);
            
            addLog(username, '用户登录', `使用${keyData.type === 'hour' ? '小时卡' : '全功能卡'}登录`, clientIp);
            
            return res.json({
                success: true,
                message: '用户登录成功',
                userType: 'user',
                cardType: keyData.type,
                username: username,
                email: user?.email || '',
                verified: true
            });
        } else {
            addLog(username, '验证失败', `密钥已绑定其他用户: ${keyData.boundUser}`, clientIp);
            return res.json({ 
                success: false, 
                message: '此密钥已绑定其他账号' 
            });
        }
    } else {
        // 新密钥，需要注册
        if (!email || !password) {
            return res.json({
                success: true,
                message: '需要注册信息',
                requireRegister: true,
                key: accessKey,
                username: username
            });
        }
        
        // 检查用户名是否已存在
        if (usersDatabase.find(u => u.username === username)) {
            return res.json({ 
                success: false, 
                message: '用户名已存在' 
            });
        }
        
        // 检查邮箱是否已存在
        if (usersDatabase.find(u => u.email === email)) {
            return res.json({ 
                success: false, 
                message: '邮箱已注册' 
            });
        }
        
        // 绑定密钥并创建用户
        keyData.status = 'used';
        keyData.bindTime = new Date().toISOString();
        keyData.boundUser = username;
        
        const newUser = {
            username: username,
            email: email,
            password: password,
            key: accessKey,
            cardType: keyData.type,
            created: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
            status: 'active'
        };
        
        usersDatabase.push(newUser);
        
        addLog(username, '用户注册', `注册并绑定${keyData.type === 'hour' ? '小时卡' : '全功能卡'}`, clientIp);
        
        console.log(`✅ 新用户注册: ${username} 绑定 ${keyData.type === 'hour' ? '小时卡' : '全功能卡'} ${accessKey}`);
        
        return res.json({
            success: true,
            message: '用户注册成功',
            userType: 'user',
            cardType: keyData.type,
            username: username,
            email: email,
            verified: true
        });
    }
});

// ==================== 密钥管理API ====================
// 生成密钥
app.post('/api/keys/generate', (req, res) => {
    const { keyType, days, note } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    if (!keyType || (keyType !== 'hour' && keyType !== 'full')) {
        return res.json({ success: false, message: '无效的密钥类型' });
    }
    
    if (keyType === 'full' && (!days || days < 1 || days > 365)) {
        return res.json({ success: false, message: '全功能卡需要有效天数(1-365)' });
    }
    
    // 生成密钥
    const newKey = generateRandomKey(keyType, days);
    if (note) {
        newKey.note = note;
    }
    keysDatabase.push(newKey);
    
    addLog('admin', '生成密钥', `生成${keyType === 'hour' ? '小时卡' : '全功能卡'} ${newKey.key}`, clientIp);
    
    console.log(`🔑 生成密钥: ${newKey.key} - ${keyType === 'hour' ? '小时卡' : '全功能卡'} ${keyType === 'full' ? `(${days}天)` : ''}`);
    
    return res.json({
        success: true,
        message: '密钥生成成功',
        key: newKey.key,
        type: newKey.type,
        days: newKey.days,
        note: newKey.note
    });
});

// 获取密钥列表
app.get('/api/keys', (req, res) => {
    return res.json({
        success: true,
        keys: keysDatabase
    });
});

// 获取用户列表
app.get('/api/users', (req, res) => {
    return res.json({
        success: true,
        users: usersDatabase
    });
});

// 获取操作日志
app.get('/api/logs', (req, res) => {
    return res.json({
        success: true,
        logs: logsDatabase
    });
});

// 删除密钥
app.delete('/api/keys/:key', (req, res) => {
    const { key } = req.params;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    const keyIndex = keysDatabase.findIndex(k => k.key === key);
    
    if (keyIndex === -1) {
        return res.json({ success: false, message: '密钥不存在' });
    }
    
    const deletedKey = keysDatabase[keyIndex];
    keysDatabase.splice(keyIndex, 1);
    
    addLog('admin', '删除密钥', `删除密钥 ${key}`, clientIp);
    
    return res.json({
        success: true,
        message: '密钥删除成功',
        key: key
    });
});

// ==================== 以下是你的原代码 ====================
function removeColorCodes(text) {
    if (!text || typeof text !== 'string') return text;
    return text.replace(/\[[0-9A-F]{6}\]/g, '');
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 通用请求函数
async function sendCPMRequest(url, payload, headers, params = {}) {
    try {
        const fullUrl = url + (Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '');
        
        const response = await axios({
            method: 'post',
            url: fullUrl,
            data: payload,
            headers: headers,
            timeout: 60000,
            validateStatus: function (status) {
                return status >= 200 && status < 600;
            }
        });
        
        return response.data;
    } catch (error) {
        console.error('Request error:', error.message);
        return null;
    }
}

// 1. 账号登录
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    console.log('🔐 CPM登录尝试:', { email: email, IP: clientIp });
    
    if (!email || !password) {
        return res.json({
            ok: false,
            error: 400,
            message: "Missing email or password"
        });
    }

    const url = "https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword";
    const payload = {
        email: email,
        password: password,
        returnSecureToken: true,
        clientType: "CLIENT_TYPE_ANDROID"
    };
    
    const headers = {
        "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 12; SM-A025F Build/SP1A.210812.016)",
        "Content-Type": "application/json",
        "Accept": "application/json"
    };
    
    const params = { key: FIREBASE_API_KEY };
    
    try {
        const response = await sendCPMRequest(url, payload, headers, params);
        
        if (response && response.idToken) {
            addLog(email, 'CPM登录成功', `CPM账号登录成功`, clientIp);
            console.log('✅ CPM登录成功:', email);
            
            res.json({
                ok: true,
                error: 0,
                message: "SUCCESSFUL",
                auth: response.idToken,
                refreshToken: response.refreshToken,
                expiresIn: response.expiresIn,
                localId: response.localId,
                email: email
            });
        } else {
            const error = response?.error?.message || "UNKNOWN_ERROR";
            addLog(email, 'CPM登录失败', `登录失败: ${error}`, clientIp);
            console.log('❌ CPM登录失败:', error);
            
            res.json({
                ok: false,
                error: 401,
                message: error,
                auth: null
            });
        }
    } catch (error) {
        console.error('Login server error:', error);
        addLog(email, 'CPM登录错误', `服务器错误: ${error.message}`, clientIp);
        
        res.json({
            ok: false,
            error: 500,
            message: "Server error: " + error.message
        });
    }
});

// 2. 获取账号数据
app.post('/api/get-account-data', async (req, res) => {
    const { authToken } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    if (!authToken) {
        return res.json({ ok: false, error: 401, message: "Missing auth token" });
    }
    
    const url = `${CPM_BASE_URL}/GetPlayerRecords2`;
    const payload = { data: null };
    const headers = {
        "User-Agent": "okhttp/3.12.13",
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json"
    };
    
    try {
        const response = await sendCPMRequest(url, payload, headers);
        
        if (response?.result) {
            let data;
            try { data = JSON.parse(response.result); } catch (e) { data = response.result; }
            
            addLog('system', '获取账号数据', `成功获取账号数据`, clientIp);
            res.json({ ok: true, error: 0, message: "SUCCESSFUL", data: data });
        } else {
            addLog('system', '获取账号数据失败', `获取数据失败`, clientIp);
            res.json({ ok: false, error: 404, message: "UNKNOWN_ERROR", data: [] });
        }
    } catch (error) {
        console.error('Get account data error:', error);
        addLog('system', '获取账号数据错误', `服务器错误: ${error.message}`, clientIp);
        res.json({ ok: false, error: 500, message: "Server error" });
    }
});

// 3. 获取所有车辆
app.post('/api/get-all-cars', async (req, res) => {
    const { authToken } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    if (!authToken) return res.json({ ok: false, error: 401, message: "Missing auth token" });
    
    const url = `${CPM_BASE_URL}/TestGetAllCars`;
    const payload = { data: null };
    const headers = {
        "User-Agent": "okhttp/3.12.13",
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json"
    };
    
    try {
        const response = await sendCPMRequest(url, payload, headers);
        if (response?.result) {
            let data;
            try { data = JSON.parse(response.result); } catch (e) { data = response.result; }
            
            const carCount = Array.isArray(data) ? data.length : 0;
            addLog('system', '获取车辆数据', `成功获取${carCount}辆车`, clientIp);
            
            res.json({ ok: true, error: 0, message: "SUCCESSFUL", data: data });
        } else {
            addLog('system', '获取车辆数据失败', `获取数据失败`, clientIp);
            res.json({ ok: false, error: 404, message: "UNKNOWN_ERROR", data: [] });
        }
    } catch (error) {
        console.error('Get cars error:', error);
        addLog('system', '获取车辆数据错误', `服务器错误: ${error.message}`, clientIp);
        res.json({ ok: false, error: 500, message: "Server error" });
    }
});

// 4. 修改当前账号ID
app.post('/api/change-localid', async (req, res) => {
    const { sourceEmail, sourcePassword, newLocalId, authToken: providedToken } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    console.log('🔄 修改Local ID请求收到:', { newLocalId, IP: clientIp });
    addLog('system', '修改ID开始', `开始修改ID为: ${newLocalId}`, clientIp);
    
    if (!newLocalId) {
        addLog('system', '修改ID失败', `缺少新Local ID`, clientIp);
        return res.json({ ok: false, result: 0, message: "Missing new local ID" });
    }
    
    let authToken = providedToken;
    let loginNeeded = !authToken;

    try {
        // 步骤 1: 验证或获取 Token
        console.log('步骤 1: 验证身份...');
        addLog('system', '修改ID', `步骤1: 验证身份`, clientIp);
        
        if (authToken) {
            const checkUrl = `${CPM_BASE_URL}/GetPlayerRecords2`;
            const checkRes = await sendCPMRequest(checkUrl, { data: null }, {
                "User-Agent": "okhttp/3.12.13",
                "Authorization": `Bearer ${authToken}`,
                "Content-Type": "application/json"
            });
            if (!checkRes || !checkRes.result) {
                console.log('提供的Token无效或过期，使用凭据重新登录');
                addLog('system', '修改ID', `Token无效，重新登录`, clientIp);
                loginNeeded = true;
            } else {
                console.log('Token有效，跳过重新登录');
                addLog('system', '修改ID', `Token验证成功`, clientIp);
            }
        }

        if (loginNeeded) {
            if (!sourceEmail || !sourcePassword) {
                addLog('system', '修改ID失败', `Token过期且未提供凭据`, clientIp);
                return res.json({ ok: false, result: 0, message: "Token expired and no credentials provided" });
            }
            
            addLog('system', '修改ID', `使用邮箱登录: ${sourceEmail}`, clientIp);
            const loginUrl = "https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword";
            const loginPayload = {
                email: sourceEmail,
                password: sourcePassword,
                returnSecureToken: true,
                clientType: "CLIENT_TYPE_ANDROID"
            };
            const loginParams = { key: FIREBASE_API_KEY };
            const loginResponse = await sendCPMRequest(loginUrl, loginPayload, {
                "Content-Type": "application/json"
            }, loginParams);
            
            if (!loginResponse?.idToken) {
                addLog(sourceEmail, '修改ID失败', `登录失败`, clientIp);
                return res.json({ ok: false, result: 0, message: "Login failed. Check credentials." });
            }
            authToken = loginResponse.idToken;
            addLog(sourceEmail, '修改ID', `重新登录成功`, clientIp);
            console.log('重新登录成功');
        }
        
        // 步骤 2: 获取账号数据
        console.log('步骤 2: 获取账号数据');
        addLog('system', '修改ID', `步骤2: 获取账号数据`, clientIp);
        
        const url1 = `${CPM_BASE_URL}/GetPlayerRecords2`;
        const headers1 = {
            "User-Agent": "okhttp/3.12.13",
            "Authorization": `Bearer ${authToken}`,
            "Content-Type": "application/json"
        };
        
        const accountResponse = await sendCPMRequest(url1, { data: null }, headers1);
        if (!accountResponse?.result) {
            addLog('system', '修改ID失败', `获取账号数据失败`, clientIp);
            return res.json({ ok: false, result: 0, message: "Failed to get account data" });
        }
        
        let accountData;
        try { accountData = JSON.parse(accountResponse.result); } catch (e) { accountData = accountResponse.result; }
        
        let oldLocalId = accountData.localID || accountData.localId;
        const cleanOldLocalId = removeColorCodes(oldLocalId);
        
        if (newLocalId === cleanOldLocalId) {
            addLog('system', '修改ID失败', `新ID与旧ID相同`, clientIp);
            return res.json({ ok: false, result: 0, message: "New ID is same as old ID" });
        }
        
        // 步骤 3: 获取所有车辆
        console.log('步骤 3: 获取所有车辆');
        addLog('system', '修改ID', `步骤3: 获取车辆数据`, clientIp);
        
        const url2 = `${CPM_BASE_URL}/TestGetAllCars`;
        const carsResponse = await sendCPMRequest(url2, { data: null }, headers1);
        let carsData = [];
        if (carsResponse?.result) {
            try { carsData = JSON.parse(carsResponse.result); } catch (e) { carsData = carsResponse.result; }
        }
        
        const carCount = Array.isArray(carsData) ? carsData.length : 0;
        console.log(`账号有 ${carCount} 辆车`);
        addLog('system', '修改ID', `找到${carCount}辆车`, clientIp);
        
        // 步骤 4: 更新账号ID
        console.log('步骤 4: 更新账号数据');
        addLog('system', '修改ID', `步骤4: 更新账号ID`, clientIp);
        
        accountData.localID = newLocalId;
        if (accountData.localId) accountData.localId = newLocalId;
        
        delete accountData._id;
        delete accountData.id;
        delete accountData.createdAt;
        delete accountData.updatedAt;
        delete accountData.__v;
        
        const url3 = `${CPM_BASE_URL}/SavePlayerRecordsIOS`;
        const payload3 = { data: JSON.stringify(accountData) };
        
        const saveAccountResponse = await sendCPMRequest(url3, payload3, headers1);
        console.log('保存账号数据响应:', saveAccountResponse);
        
        if (!saveAccountResponse || 
            (saveAccountResponse.result !== "1" && 
             saveAccountResponse.result !== 1 && 
             saveAccountResponse.result !== '{"result":1}')) {
            addLog('system', '修改ID失败', `保存账号数据失败`, clientIp);
            return res.json({
                ok: false,
                result: 0,
                message: `Failed to save account data (Result: ${saveAccountResponse?.result}). Verify data integrity.`
            });
        }
        
        addLog('system', '修改ID', `账号数据保存成功`, clientIp);
        
        // 步骤 5: 更新车辆
        let updatedCars = 0;
        let failedCars = 0;
        
        if (Array.isArray(carsData) && carsData.length > 0) {
            console.log(`更新 ${carsData.length} 辆车...`);
            addLog('system', '修改ID', `开始更新${carsData.length}辆车`, clientIp);
            
            const batchSize = 5;
            for (let i = 0; i < carsData.length; i += batchSize) {
                const batch = carsData.slice(i, Math.min(i + batchSize, carsData.length));
                
                const batchPromises = batch.map(async (car) => {
                    try {
                        let carCopy = JSON.parse(JSON.stringify(car));
                        
                        if (oldLocalId && cleanOldLocalId) {
                            const carStr = JSON.stringify(carCopy);
                            let newCarStr = carStr.replace(new RegExp(escapeRegExp(oldLocalId), 'g'), newLocalId);
                            newCarStr = newCarStr.replace(new RegExp(escapeRegExp(cleanOldLocalId), 'g'), newLocalId);
                            try { carCopy = JSON.parse(newCarStr); } catch (e) {}
                        }
                        
                        delete carCopy._id;
                        delete carCopy.createdAt;
                        delete carCopy.updatedAt;
                        delete carCopy.__v;

                        const url4 = `${CPM_BASE_URL}/SaveCars`;
                        const randomNum = Math.floor(Math.random() * (888889 - 111111) + 111111);
                        const payload4 = { data: JSON.stringify(carCopy) };
                        const headers4 = {
                            "Host": "us-central1-cp-multiplayer.cloudfunctions.net",
                            "Authorization": `Bearer ${authToken}`,
                            "firebase-instance-id-token": "fdEMFcKoR2iSrZAzViyFkh:APA91bEQsP8kAGfBuPTL_ATg25AmnqpssGTkc7IAS2CgLiILjBbneFuSEzOJr2a97eDvQOPGxlphSIV7gCk2k4Wl0UxMK5x298LrJYa5tJmVRqdyz0j3KDSKLCtCbldkRFwNnjU3lwfP",
                            "Content-Type": "application/json; charset=utf-8",
                            "User-Agent": `Dalvik/2.1.0 (Linux; U; Android 8.1.0; ASUS_X00TD MIUI/16.2017.2009.087-20${randomNum})`
                        };
                        
                        const saveCarResponse = await sendCPMRequest(url4, payload4, headers4);
                        if (saveCarResponse && (saveCarResponse.success || saveCarResponse.result)) {
                            updatedCars++;
                            return true;
                        } else {
                            failedCars++;
                            return false;
                        }
                    } catch (e) {
                        failedCars++;
                        return false;
                    }
                });
                
                await Promise.all(batchPromises);
                if (i + batchSize < carsData.length) await new Promise(r => setTimeout(r, 500));
            }
        }
        
        addLog('system', '修改ID成功', `ID修改完成! 旧ID: ${cleanOldLocalId}, 新ID: ${newLocalId}, 更新车辆: ${updatedCars}`, clientIp);
        
        res.json({
            ok: true,
            result: 1,
            message: "Local ID changed successfully!",
            details: {
                oldLocalId: cleanOldLocalId,
                newLocalId: newLocalId,
                carsUpdated: updatedCars,
                carsFailed: failedCars
            }
        });
        
    } catch (error) {
        console.error('修改Local ID过程错误:', error);
        addLog('system', '修改ID错误', `过程失败: ${error.message}`, clientIp);
        res.json({ ok: false, result: 0, message: `Process failed: ${error.message}` });
    }
});

// 5. 克隆账号功能
app.post('/api/clone-account', async (req, res) => {
    const { sourceAuth, targetEmail, targetPassword, customLocalId } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    console.log('🔄 克隆账号请求收到:', { targetEmail, IP: clientIp });
    addLog('system', '克隆开始', `开始克隆到: ${targetEmail}`, clientIp);
    
    if (!sourceAuth || !targetEmail || !targetPassword) {
        addLog('system', '克隆失败', `缺少必要参数`, clientIp);
        return res.json({
            ok: false,
            error: 400,
            message: "Missing required parameters"
        });
    }
    
    try {
        addLog('system', '克隆', `步骤1: 获取源账号数据`, clientIp);
        console.log('步骤 1: 获取源账号数据');
        
        const url1 = `${CPM_BASE_URL}/GetPlayerRecords2`;
        const accountResponse = await sendCPMRequest(url1, { data: null }, {
            "User-Agent": "okhttp/3.12.13",
            "Authorization": `Bearer ${sourceAuth}`,
            "Content-Type": "application/json"
        });
        
        if (!accountResponse?.result) {
            addLog('system', '克隆失败', `获取源账号数据失败`, clientIp);
            return res.json({
                ok: false,
                error: 404,
                message: "Failed to get source account data"
            });
        }
        
        let sourceData;
        try { sourceData = JSON.parse(accountResponse.result); } catch (e) { sourceData = accountResponse.result; }
        
        let from_id = sourceData.localID || sourceData.localId;
        console.log(`源账号 localID (原始): ${from_id}`);
        
        const clean_from_id = removeColorCodes(from_id);
        console.log(`源账号 localID (清理后): ${clean_from_id}`);
        
        addLog('system', '克隆', `步骤2: 获取源账号车辆`, clientIp);
        console.log('步骤 2: 获取源账号车辆');
        
        const url2 = `${CPM_BASE_URL}/TestGetAllCars`;
        const carsResponse = await sendCPMRequest(url2, { data: null }, {
            "User-Agent": "okhttp/3.12.13",
            "Authorization": `Bearer ${sourceAuth}`,
            "Content-Type": "application/json"
        });
        
        if (!carsResponse?.result) {
            addLog('system', '克隆失败', `获取源账号车辆失败`, clientIp);
            return res.json({
                ok: false,
                error: 404,
                message: "Failed to get source cars"
            });
        }
        
        let sourceCars;
        try { sourceCars = JSON.parse(carsResponse.result); } catch (e) { sourceCars = carsResponse.result; }
        
        const carCount = Array.isArray(sourceCars) ? sourceCars.length : 0;
        console.log(`源账号有 ${carCount} 辆车`);
        addLog('system', '克隆', `源账号有${carCount}辆车`, clientIp);
        
        addLog('system', '克隆', `步骤3: 登录目标账号`, clientIp);
        console.log('步骤 3: 登录目标账号');
        
        const url3 = "https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword";
        const loginResponse = await sendCPMRequest(url3, {
            email: targetEmail,
            password: targetPassword,
            returnSecureToken: true,
            clientType: "CLIENT_TYPE_ANDROID"
        }, {
            "Content-Type": "application/json"
        }, { key: FIREBASE_API_KEY });
        
        if (!loginResponse?.idToken) {
            const error = loginResponse?.error?.message || "UNKNOWN_ERROR";
            addLog(targetEmail, '克隆失败', `目标账号登录失败: ${error}`, clientIp);
            return res.json({
                ok: false,
                error: 401,
                message: `Failed to login to target account: ${error}`
            });
        }
        
        const targetAuth = loginResponse.idToken;
        const targetLocalId = loginResponse.localId;
        console.log(`目标账号登录成功, localId: ${targetLocalId}`);
        addLog(targetEmail, '克隆', `目标账号登录成功`, clientIp);
        
        addLog('system', '克隆', `步骤4: 准备目标账号数据`, clientIp);
        console.log('步骤 4: 准备目标账号数据');
        
        let to_id;
        if (customLocalId && customLocalId.trim() !== '') {
            to_id = customLocalId.trim();
            console.log(`使用自定义 localID: ${to_id}`);
        } else {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            to_id = '';
            for (let i = 0; i < 10; i++) {
                to_id += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            console.log(`生成随机 localID: ${to_id}`);
        }
        
        const targetAccountData = {
            ...sourceData,
            localID: to_id,
            Name: sourceData.Name || "TELMunn",
            money: sourceData.money || 500000000,
            allData: sourceData.allData || {},
            platesData: sourceData.platesData || {}
        };
        
        delete targetAccountData._id;
        delete targetAccountData.id;
        delete targetAccountData.createdAt;
        delete targetAccountData.updatedAt;
        delete targetAccountData.__v;
        
        addLog('system', '克隆', `步骤5: 保存目标账号数据`, clientIp);
        console.log('步骤 5: 保存目标账号数据');
        
        const url5 = `${CPM_BASE_URL}/SavePlayerRecordsIOS`;
        const saveDataResponse = await sendCPMRequest(url5, { data: JSON.stringify(targetAccountData) }, {
            "User-Agent": "okhttp/3.12.13",
            "Authorization": `Bearer ${targetAuth}`,
            "Content-Type": "application/json"
        });
        
        console.log('保存账号数据响应:', saveDataResponse);
        
        if (!saveDataResponse || 
            (saveDataResponse.result !== "1" && 
             saveDataResponse.result !== 1 && 
             saveDataResponse.result !== '{"result":1}')) {
            addLog(targetEmail, '克隆失败', `保存目标账号数据失败`, clientIp);
            return res.json({
                ok: false,
                error: 500,
                message: `Failed to save target account data. Response: ${JSON.stringify(saveDataResponse)}`
            });
        }
        
        addLog(targetEmail, '克隆', `目标账号数据保存成功`, clientIp);
        
        addLog('system', '克隆', `步骤6: 克隆车辆`, clientIp);
        console.log('步骤 6: 克隆车辆');
        
        let clonedCars = 0;
        let failedCars = 0;
        
        if (Array.isArray(sourceCars) && sourceCars.length > 0) {
            console.log(`克隆 ${sourceCars.length} 辆车...`);
            
            const batchSize = 3;
            for (let i = 0; i < sourceCars.length; i += batchSize) {
                const batch = sourceCars.slice(i, Math.min(i + batchSize, sourceCars.length));
                
                const batchPromises = batch.map(async (car, index) => {
                    try {
                        let carCopy = JSON.parse(JSON.stringify(car));
                        
                        if (from_id && clean_from_id) {
                            const carStr = JSON.stringify(carCopy);
                            let newCarStr = carStr.replace(new RegExp(escapeRegExp(from_id), 'g'), to_id);
                            newCarStr = newCarStr.replace(new RegExp(escapeRegExp(clean_from_id), 'g'), to_id);
                            try { carCopy = JSON.parse(newCarStr); } catch (parseError) {}
                        }
                        
                        delete carCopy._id;
                        delete carCopy.createdAt;
                        delete carCopy.updatedAt;
                        delete carCopy.__v;
                        
                        if (carCopy.CarID && typeof carCopy.CarID === 'string') {
                            if (carCopy.CarID.includes(from_id)) {
                                carCopy.CarID = carCopy.CarID.replace(new RegExp(escapeRegExp(from_id), 'g'), to_id);
                            } else if (carCopy.CarID.includes(clean_from_id)) {
                                carCopy.CarID = carCopy.CarID.replace(new RegExp(escapeRegExp(clean_from_id), 'g'), to_id);
                            }
                        }
                        
                        const url6 = `${CPM_BASE_URL}/SaveCars`;
                        const randomNum = Math.floor(Math.random() * (888889 - 111111) + 111111);
                        const saveCarResponse = await sendCPMRequest(url6, { data: JSON.stringify(carCopy) }, {
                            "Host": "us-central1-cp-multiplayer.cloudfunctions.net",
                            "Authorization": `Bearer ${targetAuth}`,
                            "firebase-instance-id-token": "fdEMFcKoR2iSrZAzViyFkh:APA91bEQsP8kAGfBuPTL_ATg25AmnqpssGTkc7IAS2CgLiILjBbneFuSEzOJr2a97eDvQOPGxlphSIV7gCk2k4Wl0UxMK5x298LrJYa5tJmVRqdyz0j3KDSKLCtCbldkRFwNnjU3lwfP",
                            "Content-Type": "application/json; charset=utf-8",
                            "User-Agent": `Dalvik/2.1.0 (Linux; U; Android 8.1.0; ASUS_X00TD MIUI/16.2017.2009.087-20${randomNum})`
                        });
                        
                        if (saveCarResponse && (saveCarResponse.success || saveCarResponse.result)) {
                            clonedCars++;
                            return true;
                        } else {
                            failedCars++;
                            return false;
                        }
                    } catch (carError) {
                        console.error(`处理车辆 ${i + index + 1} 错误:`, carError.message);
                        failedCars++;
                        return false;
                    }
                });
                
                await Promise.all(batchPromises);
                if (i + batchSize < sourceCars.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            console.log(`成功克隆 ${clonedCars} 辆车, 失败: ${failedCars}`);
            addLog(targetEmail, '克隆成功', `克隆完成! 成功: ${clonedCars}, 失败: ${failedCars}, 新ID: ${to_id}`, clientIp);
            
            res.json({
                ok: true,
                error: 0,
                message: "Account cloned successfully!",
                details: {
                    targetAccount: targetEmail,
                    carsCloned: clonedCars,
                    carsFailed: failedCars,
                    newLocalId: to_id,
                    totalCars: sourceCars.length
                }
            });
            
        } else {
            console.log('没有车辆需要克隆');
            addLog(targetEmail, '克隆成功', `克隆完成 (无车辆), 新ID: ${to_id}`, clientIp);
            
            res.json({
                ok: true,
                error: 0,
                message: "Account cloned successfully (no cars to clone)!",
                details: {
                    targetAccount: targetEmail,
                    carsCloned: 0,
                    carsFailed: 0,
                    newLocalId: to_id,
                    totalCars: 0
                }
            });
        }
        
    } catch (error) {
        console.error('克隆过程错误:', error);
        addLog('system', '克隆错误', `克隆失败: ${error.message}`, clientIp);
        res.json({
            ok: false,
            error: 500,
            message: `Clone failed: ${error.message}`
        });
    }
});

// 测试端点
app.get('/api/test', (req, res) => {
    res.json({
        status: 'ok',
        message: 'cpmcy API is working',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        firebase_key: FIREBASE_API_KEY ? 'Set' : 'Not set',
        total_keys: keysDatabase.length,
        total_users: usersDatabase.length,
        total_logs: logsDatabase.length
    });
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'cpmcy Clone Service',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: '3.0.0',
        stats: {
            keys: keysDatabase.length,
            users: usersDatabase.length,
            logs: logsDatabase.length
        }
    });
});

// 主页
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// 404处理
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found', path: req.path });
});

// 错误处理
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        error: 'Internal Server Error', 
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

app.listen(PORT, () => {
    console.log(`
    🚀 Server running on port ${PORT}
    🌐 Access at: http://localhost:${PORT}
    🏥 Health check: http://localhost:${PORT}/health
    🔑 Firebase API Key: ${FIREBASE_API_KEY ? 'Set ✓' : 'Not set ✗'}
    🌐 CPM Base URL: ${CPM_BASE_URL}
    🔐 Admin Key: ${ADMIN_KEY}
    ⚡ Environment: ${process.env.NODE_ENV || 'development'}
    ✨ Version: 3.0.0 - 完整的验证系统
    📊 初始化数据: ${keysDatabase.length} 个密钥, ${usersDatabase.length} 个用户, ${logsDatabase.length} 条日志
    `);
});
