require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// PHP字符串函数
function strtoupper(str) {
  return str.toUpperCase();
}

function substr(str, start, length) {
  if (start < 0) start = str.length + start;
  return str.substr(start, length);
}

function str_shuffle(str) {
  const arr = str.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

function microtime() {
  return Date.now().toString();
}

// 生成PHP同款动态User-Agent
const generateCarUserAgent = () => {
  const randomNum = Math.floor(Math.random() * (888889 - 111111) + 111111);
  return `Dalvik/2.1.0 (Linux; U; Android 8.1.0; ASUS_X00TD MIUI/16.2017.2009.087-20${randomNum})`;
};

// 环境变量验证
const API_KEY = process.env.FIREBASE_API_KEY;
const FIREBASE_INSTANCE_ID_TOKEN = process.env.FIREBASE_INSTANCE_ID_TOKEN;
if (!API_KEY || !FIREBASE_INSTANCE_ID_TOKEN) {
  console.error('❌ 缺失环境变量！请配置 FIREBASE_API_KEY 和 FIREBASE_INSTANCE_ID_TOKEN');
  process.exit(1);
}

// 中间件
app.use(cors({ 
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// 日志中间件
app.use((req, res, next) => {
  console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.path} | IP: ${req.ip}`);
  const logBody = { ...req.body };
  if (logBody.password) logBody.password = '***';
  if (logBody.targetPassword) logBody.targetPassword = '***';
  console.log('请求参数:', JSON.stringify(logBody, null, 2));
  next();
});

// 修复：完全模拟PHP的请求方式
const sendPHPRequest = async (url, payload, authToken = null, isCarRequest = false) => {
  try {
    console.log(`\n🔵 发送PHP请求到: ${url}`);
    console.log('请求类型:', isCarRequest ? '车辆请求' : '账号请求');
    
    // 构建请求头 - 完全模拟PHP的curl请求
    let headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Connection': 'Keep-Alive',
      'Accept-Encoding': 'gzip'
    };
    
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    if (isCarRequest) {
      // 车辆请求的特殊头
      headers['firebase-instance-id-token'] = FIREBASE_INSTANCE_ID_TOKEN;
      headers['User-Agent'] = generateCarUserAgent();
      headers['Host'] = 'us-central1-cp-multiplayer.cloudfunctions.net';
    } else {
      headers['User-Agent'] = 'okhttp/3.12.13';
    }
    
    console.log('请求头:', headers);
    
    // 特殊处理SavePlayerRecordsIOS接口
    let requestData;
    if (url.includes('SavePlayerRecordsIOS')) {
      // PHP版本是直接传递JSON字符串
      if (typeof payload === 'string') {
        // 如果已经是字符串，直接使用
        requestData = payload;
      } else if (payload && typeof payload === 'object' && payload.data) {
        // 如果有data属性，使用它
        requestData = payload.data;
      } else {
        // 否则字符串化整个对象
        requestData = JSON.stringify(payload);
      }
      console.log('SavePlayerRecordsIOS数据长度:', requestData.length);
      console.log('数据前200字符:', requestData.substring(0, 200));
    } else {
      requestData = payload;
    }
    
    // 发送请求
    const response = await axios({
      method: 'POST',
      url: url,
      data: requestData,
      headers: headers,
      timeout: 15000,
      decompress: true,
      maxRedirects: 0
    });
    
    console.log(`响应状态: ${response.status} ${response.statusText}`);
    
    // 解析响应
    let responseData;
    if (typeof response.data === 'string') {
      try {
        responseData = JSON.parse(response.data);
      } catch (e) {
        responseData = response.data;
      }
    } else {
      responseData = response.data;
    }
    
    console.log('响应数据:', typeof responseData === 'string' ? 
      responseData.substring(0, 300) : 
      JSON.stringify(responseData, null, 2));
    
    return responseData;
    
  } catch (error) {
    console.error(`❌ 请求失败: ${error.message}`);
    if (error.response) {
      console.error('错误状态:', error.response.status);
      console.error('错误头:', error.response.headers);
      console.error('错误数据:', error.response.data);
    } else if (error.request) {
      console.error('无响应:', error.code);
    }
    return null;
  }
};

// 错误码映射
function getErrorCode(errorMsg) {
  switch (errorMsg) {
    case "EMAIL_NOT_FOUND": return 100;
    case "INVALID_PASSWORD": return 101;
    case "WEAK_PASSWORD": return 102;
    case "INVALID_ID_TOKEN": return 103;
    case "EMAIL_EXISTS": return 105;
    case "MISSING_PASSWORD": return 106;
    case "INVALID_EMAIL": return 107;
    case "MISSING_EMAIL": return 108;
    default: return 404;
  }
}

// 1. 账号登录
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.json({ ok: false, error: 400, message: "MISSING_EMAIL_OR_PASSWORD" });
    }
    
    const url = "https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword";
    const payload = { 
      email, 
      password, 
      returnSecureToken: true, 
      clientType: "CLIENT_TYPE_ANDROID" 
    };
    
    const data = await sendPHPRequest(url, payload, null, false);
    
    if (data?.idToken) {
      res.json({
        ok: true, error: 0, message: "SUCCESSFUL",
        authToken: data.idToken, 
        localId: data.localId, 
        email: data.email,
        refreshToken: data.refreshToken
      });
    } else {
      const errorMsg = data?.error?.message || "UNKNOWN_ERROR";
      const errorCode = getErrorCode(errorMsg);
      res.json({ 
        ok: false, 
        error: errorCode, 
        message: errorMsg, 
        authToken: null 
      });
    }
  } catch (error) {
    console.error('登录接口错误:', error);
    res.json({ 
      ok: false, 
      error: 500, 
      message: `SERVER_ERROR: ${error.message}` 
    });
  }
});

// 2. 获取账号信息
app.post('/api/account-info', async (req, res) => {
  try {
    const { authToken } = req.body;
    if (!authToken) {
      return res.json({ ok: false, error: 401, message: "NO_AUTH_TOKEN" });
    }
    
    // 获取玩家数据
    const playerDataUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/GetPlayerRecords2";
    const playerData = await sendPHPRequest(playerDataUrl, { data: null }, authToken, false);
    
    let parsedPlayerData = {};
    if (playerData?.result) {
      try {
        parsedPlayerData = typeof playerData.result === 'string' ? 
          JSON.parse(playerData.result) : playerData.result;
      } catch (e) {
        console.error('解析玩家数据失败:', e.message);
      }
    }
    
    // 获取基础信息
    const infoUrl = "https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo";
    const infoData = await sendPHPRequest(infoUrl, { idToken: authToken }, null, false);
    
    // 获取车辆
    const carsUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/TestGetAllCars";
    const carsData = await sendPHPRequest(carsUrl, { data: null }, authToken, false);
    
    let carsList = [];
    if (carsData?.result) {
      try {
        carsList = typeof carsData.result === 'string' ? 
          JSON.parse(carsData.result) : carsData.result;
      } catch (e) {
        console.error('解析车辆数据失败:', e.message);
      }
    }
    
    res.json({
      ok: true, 
      error: 0, 
      message: "SUCCESSFUL",
      data: {
        email: infoData?.users?.[0]?.email || "",
        localId: parsedPlayerData?.localID || infoData?.users?.[0]?.localId || "",
        nickname: parsedPlayerData?.Name || "未设置",
        gold: parsedPlayerData?.coin || 0,
        money: parsedPlayerData?.money || 0,
        carCount: carsList.length,
        allData: parsedPlayerData
      }
    });
  } catch (error) {
    console.error('获取账号信息错误:', error);
    res.json({ 
      ok: false, 
      error: 500, 
      message: `SERVER_ERROR: ${error.message}` 
    });
  }
});

// 3. 修改LocalID - 完全重写
app.post('/api/modify-localid', async (req, res) => {
  try {
    const { authToken, customLocalId } = req.body;
    if (!authToken || !customLocalId) {
      return res.json({ ok: false, error: 400, message: "MISSING_PARAMS" });
    }
    
    console.log(`🚀 开始修改LocalID: ${customLocalId}`);
    
    // 1. 获取当前账号数据
    const playerDataUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/GetPlayerRecords2";
    const playerData = await sendPHPRequest(playerDataUrl, { data: null }, authToken, false);
    
    if (!playerData?.result) {
      console.error('获取账号数据失败:', playerData);
      return res.json({ 
        ok: false, 
        error: 404, 
        message: "GET_ACCOUNT_DATA_FAILED" 
      });
    }
    
    let parsedPlayerData;
    try {
      parsedPlayerData = typeof playerData.result === 'string' ? 
        JSON.parse(playerData.result) : playerData.result;
    } catch (e) {
      console.error('解析数据失败:', e);
      return res.json({ 
        ok: false, 
        error: 500, 
        message: `PARSE_DATA_FAILED: ${e.message}` 
      });
    }
    
    if (!parsedPlayerData?.localID) {
      console.error('localID不存在:', parsedPlayerData);
      return res.json({ 
        ok: false, 
        error: 404, 
        message: "LOCALID_NOT_FOUND" 
      });
    }
    
    const oldLocalId = parsedPlayerData.localID;
    console.log(`🔄 替换LocalID: ${oldLocalId} -> ${customLocalId}`);
    
    // 2. 更新LocalID
    parsedPlayerData.localID = customLocalId;
    
    // 清理不需要的字段
    const unwantedFields = ['_id', 'id', 'createdAt', 'updatedAt', '__v', '_v', 'allData'];
    unwantedFields.forEach(field => {
      if (parsedPlayerData[field]) {
        delete parsedPlayerData[field];
      }
    });
    
    // 3. 保存账号数据 - 尝试多种格式
    const updateUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/SavePlayerRecordsIOS";
    let saveSuccess = false;
    let saveResult;
    
    // 格式1: 直接传递JSON字符串（最可能成功）
    console.log('\n🔵 尝试格式1: 直接传递JSON字符串');
    saveResult = await sendPHPRequest(updateUrl, JSON.stringify(parsedPlayerData), authToken, false);
    
    if (saveResult && (saveResult === '{"result":1}' || 
        (typeof saveResult === 'object' && saveResult.result === '{"result":1}') ||
        (typeof saveResult === 'string' && saveResult.includes('"result":1')))) {
      saveSuccess = true;
      console.log('✅ 格式1成功');
    } else {
      // 格式2: 使用{data: jsonString}格式
      console.log('\n🔵 尝试格式2: {data: jsonString}');
      saveResult = await sendPHPRequest(updateUrl, { data: JSON.stringify(parsedPlayerData) }, authToken, false);
      
      if (saveResult && (saveResult === '{"result":1}' || 
          (typeof saveResult === 'object' && saveResult.result === '{"result":1}') ||
          (typeof saveResult === 'string' && saveResult.includes('"result":1')))) {
        saveSuccess = true;
        console.log('✅ 格式2成功');
      }
    }
    
    if (!saveSuccess) {
      console.error('❌ 所有保存格式都失败:', saveResult);
      return res.json({ 
        ok: false, 
        error: 500, 
        message: "SAVE_ACCOUNT_DATA_FAILED",
        debug: saveResult 
      });
    }
    
    console.log('✅ 账号数据保存成功');
    
    // 4. 更新车辆数据
    let carsUpdatedCount = 0;
    try {
      const carsUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/TestGetAllCars";
      const carsData = await sendPHPRequest(carsUrl, { data: null }, authToken, false);
      
      if (carsData?.result) {
        let carsList;
        try {
          carsList = typeof carsData.result === 'string' ? 
            JSON.parse(carsData.result) : carsData.result;
        } catch (e) {
          console.error('解析车辆数据失败:', e.message);
          carsList = [];
        }
        
        console.log(`找到 ${carsList.length} 辆车辆`);
        
        if (carsList.length > 0) {
          const saveCarsUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/SaveCars";
          
          for (let i = 0; i < carsList.length; i++) {
            const car = carsList[i];
            console.log(`处理车辆 ${i+1}/${carsList.length}`);
            
            try {
              const carCopy = JSON.parse(JSON.stringify(car));
              const carStr = JSON.stringify(carCopy);
              
              // 替换LocalID
              const newCarStr = carStr.replace(new RegExp(oldLocalId, 'g'), customLocalId);
              const updatedCar = JSON.parse(newCarStr);
              
              // 清理字段
              delete updatedCar._id;
              delete updatedCar.createdAt;
              delete updatedCar.updatedAt;
              delete updatedCar.__v;
              
              // 保存车辆 - 使用车辆专用请求
              const carSaveRes = await sendPHPRequest(
                saveCarsUrl, 
                JSON.stringify(updatedCar), 
                authToken, 
                true // isCarRequest = true
              );
              
              if (carSaveRes && 
                  (carSaveRes === '{"result":1}' || 
                   (typeof carSaveRes === 'object' && carSaveRes.result === '{"result":1}') ||
                   (typeof carSaveRes === 'string' && carSaveRes.includes('"result":1')))) {
                carsUpdatedCount++;
                console.log(`✅ 车辆 ${i+1} 更新成功`);
              } else {
                console.log(`❌ 车辆 ${i+1} 更新失败:`, carSaveRes);
              }
              
            } catch (carError) {
              console.error(`处理车辆 ${i+1} 出错:`, carError.message);
            }
          }
        }
      }
    } catch (carsError) {
      console.error('更新车辆数据时出错:', carsError);
    }
    
    res.json({
      ok: true, 
      error: 0, 
      message: "SUCCESSFUL",
      oldLocalId, 
      newLocalId: customLocalId,
      carsUpdated: carsUpdatedCount,
      note: carsUpdatedCount === 0 ? "账号数据已更新，车辆数据可能未完全同步" : "全部更新完成"
    });
    
  } catch (error) {
    console.error('修改LocalID错误:', error);
    res.json({ 
      ok: false, 
      error: 500, 
      message: `SERVER_ERROR: ${error.message}` 
    });
  }
});

// 4. 修改金币 - 简化版本
app.post('/api/modify-gold', async (req, res) => {
  try {
    const { authToken, goldAmount } = req.body;
    if (!authToken || goldAmount === undefined) {
      return res.json({ ok: false, error: 400, message: "MISSING_PARAMS" });
    }
    
    const gold = parseInt(goldAmount, 10);
    if (isNaN(gold) || gold < 0) {
      return res.json({ ok: false, error: 400, message: "INVALID_GOLD_AMOUNT" });
    }
    
    console.log(`💰 修改金币到: ${gold}`);
    
    // 获取当前数据
    const playerDataUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/GetPlayerRecords2";
    const playerData = await sendPHPRequest(playerDataUrl, { data: null }, authToken, false);
    
    if (!playerData?.result) {
      return res.json({ ok: false, error: 404, message: "GET_ACCOUNT_DATA_FAILED" });
    }
    
    let parsedData;
    try {
      parsedData = typeof playerData.result === 'string' ? 
        JSON.parse(playerData.result) : playerData.result;
    } catch (e) {
      return res.json({ ok: false, error: 500, message: `PARSE_DATA_FAILED: ${e.message}` });
    }
    
    // 更新金币
    parsedData.coin = gold;
    
    // 清理字段
    const unwantedFields = ['_id', 'id', 'createdAt', 'updatedAt', '__v', '_v'];
    unwantedFields.forEach(field => {
      if (parsedData[field]) delete parsedData[field];
    });
    
    // 保存
    const updateUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/SavePlayerRecordsIOS";
    const saveResult = await sendPHPRequest(updateUrl, JSON.stringify(parsedData), authToken, false);
    
    // 检查结果
    const success = saveResult && (
      saveResult === '{"result":1}' || 
      (typeof saveResult === 'object' && saveResult.result === '{"result":1}') ||
      (typeof saveResult === 'string' && saveResult.includes('"result":1'))
    );
    
    if (success) {
      res.json({ 
        ok: true, 
        error: 0, 
        message: "SUCCESSFUL",
        goldAmount: gold,
        data: { coin: gold }
      });
    } else {
      console.error('修改金币失败:', saveResult);
      res.json({ 
        ok: false, 
        error: 500, 
        message: "SAVE_GOLD_FAILED",
        debug: saveResult 
      });
    }
    
  } catch (error) {
    console.error('修改金币错误:', error);
    res.json({ 
      ok: false, 
      error: 500, 
      message: `SERVER_ERROR: ${error.message}` 
    });
  }
});

// 5. 修改绿钞 - 与金币相同逻辑
app.post('/api/modify-money', async (req, res) => {
  try {
    const { authToken, moneyAmount } = req.body;
    if (!authToken || moneyAmount === undefined) {
      return res.json({ ok: false, error: 400, message: "MISSING_PARAMS" });
    }
    
    const money = parseInt(moneyAmount, 10);
    if (isNaN(money) || money < 0) {
      return res.json({ ok: false, error: 400, message: "INVALID_MONEY_AMOUNT" });
    }
    
    console.log(`💵 修改绿钞到: ${money}`);
    
    // 获取当前数据
    const playerDataUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/GetPlayerRecords2";
    const playerData = await sendPHPRequest(playerDataUrl, { data: null }, authToken, false);
    
    if (!playerData?.result) {
      return res.json({ ok: false, error: 404, message: "GET_ACCOUNT_DATA_FAILED" });
    }
    
    let parsedData;
    try {
      parsedData = typeof playerData.result === 'string' ? 
        JSON.parse(playerData.result) : playerData.result;
    } catch (e) {
      return res.json({ ok: false, error: 500, message: `PARSE_DATA_FAILED: ${e.message}` });
    }
    
    // 更新绿钞
    parsedData.money = money;
    
    // 清理字段
    const unwantedFields = ['_id', 'id', 'createdAt', 'updatedAt', '__v', '_v'];
    unwantedFields.forEach(field => {
      if (parsedData[field]) delete parsedData[field];
    });
    
    // 保存
    const updateUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/SavePlayerRecordsIOS";
    const saveResult = await sendPHPRequest(updateUrl, JSON.stringify(parsedData), authToken, false);
    
    // 检查结果
    const success = saveResult && (
      saveResult === '{"result":1}' || 
      (typeof saveResult === 'object' && saveResult.result === '{"result":1}') ||
      (typeof saveResult === 'string' && saveResult.includes('"result":1'))
    );
    
    if (success) {
      res.json({ 
        ok: true, 
        error: 0, 
        message: "SUCCESSFUL",
        moneyAmount: money,
        data: { money: money }
      });
    } else {
      console.error('修改绿钞失败:', saveResult);
      res.json({ 
        ok: false, 
        error: 500, 
        message: "SAVE_MONEY_FAILED",
        debug: saveResult 
      });
    }
    
  } catch (error) {
    console.error('修改绿钞错误:', error);
    res.json({ 
      ok: false, 
      error: 500, 
      message: `SERVER_ERROR: ${error.message}` 
    });
  }
});

// 新增：直接测试SavePlayerRecordsIOS接口
app.post('/api/debug-save', async (req, res) => {
  try {
    const { authToken, testData } = req.body;
    
    if (!authToken) {
      return res.json({ ok: false, error: 401, message: "NO_AUTH_TOKEN" });
    }
    
    // 如果没有提供测试数据，获取当前数据
    let dataToTest;
    if (testData) {
      dataToTest = testData;
    } else {
      const playerDataUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/GetPlayerRecords2";
      const playerData = await sendPHPRequest(playerDataUrl, { data: null }, authToken, false);
      
      if (!playerData?.result) {
        return res.json({ ok: false, error: 404, message: "GET_DATA_FAILED" });
      }
      
      let parsedData;
      try {
        parsedData = typeof playerData.result === 'string' ? 
          JSON.parse(playerData.result) : playerData.result;
      } catch (e) {
        return res.json({ ok: false, error: 500, message: `PARSE_FAILED: ${e.message}` });
      }
      
      // 清理数据
      const unwantedFields = ['_id', 'id', 'createdAt', 'updatedAt', '__v', '_v'];
      unwantedFields.forEach(field => {
        if (parsedData[field]) delete parsedData[field];
      });
      
      dataToTest = JSON.stringify(parsedData);
    }
    
    const updateUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/SavePlayerRecordsIOS";
    
    // 测试不同格式
    const results = {
      format1: null,
      format2: null,
      format3: null
    };
    
    // 格式1: 直接JSON字符串
    console.log('\n=== 测试格式1: 直接JSON字符串 ===');
    results.format1 = await sendPHPRequest(updateUrl, dataToTest, authToken, false);
    
    // 格式2: {data: jsonString}
    console.log('\n=== 测试格式2: {data: jsonString} ===');
    results.format2 = await sendPHPRequest(updateUrl, { data: dataToTest }, authToken, false);
    
    // 格式3: PHP原始格式 {data: "jsonString"}
    console.log('\n=== 测试格式3: PHP原始格式 ===');
    results.format3 = await sendPHPRequest(updateUrl, { data: `"${dataToTest.replace(/"/g, '\\"')}"` }, authToken, false);
    
    res.json({
      ok: true,
      message: "测试完成",
      dataLength: dataToTest.length,
      results: results
    });
    
  } catch (error) {
    console.error('调试接口错误:', error);
    res.json({ 
      ok: false, 
      error: 500, 
      message: `DEBUG_ERROR: ${error.message}` 
    });
  }
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    apiKeyConfigured: !!API_KEY,
    instanceTokenConfigured: !!FIREBASE_INSTANCE_ID_TOKEN
  });
});

// 404处理
app.use((req, res) => {
  console.log(`404 请求: ${req.method} ${req.path}`);
  res.status(404).json({ ok: false, error: 404, message: "API_NOT_FOUND" });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('全局错误:', err.stack);
  res.status(500).json({ ok: false, error: 500, message: `INTERNAL_SERVER_ERROR: ${err.message}` });
});

// 启动服务
app.listen(PORT, () => {
  console.log(`
  🚀 服务启动成功！
  📍 端口: ${PORT}
  🌐 访问地址: http://localhost:${PORT}
  🔑 API Key: ${API_KEY ? '✅ 已配置' : '❌ 未配置'}
  🔑 Firebase Token: ${FIREBASE_INSTANCE_ID_TOKEN ? '✅ 已配置' : '❌ 未配置'}
  
  📋 可用接口:
  POST /api/login                    - 账号登录
  POST /api/account-info             - 获取账号信息
  POST /api/modify-localid           - 修改LocalID
  POST /api/modify-gold              - 修改金币
  POST /api/modify-money             - 修改绿钞
  POST /api/debug-save               - 调试保存接口
  
  🐛 调试建议:
  1. 先运行 /api/debug-save 查看哪种格式能成功
  2. 根据成功格式调整其他接口
  3. 检查环境变量是否正确
  `);
});
