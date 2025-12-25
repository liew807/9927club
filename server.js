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
const CPM_BASE_URL = process.env.CPM_BASE_URL || 'https://us-central1-cp-multiplayer.cloudfunctions.net';

if (!API_KEY) {
  console.error('❌ 缺失环境变量：FIREBASE_API_KEY');
  process.exit(1);
}
if (!FIREBASE_INSTANCE_ID_TOKEN) {
  console.error('❌ 缺失环境变量：FIREBASE_INSTANCE_ID_TOKEN');
  process.exit(1);
}
if (!process.env.CPM_BASE_URL) {
  console.warn('⚠️  未配置CPM_BASE_URL，使用默认值');
}

console.log('✅ 环境变量配置:');
console.log(`   FIREBASE_API_KEY: ${API_KEY ? '已配置' : '未配置'}`);
console.log(`   FIREBASE_INSTANCE_ID_TOKEN: ${FIREBASE_INSTANCE_ID_TOKEN ? '已配置' : '未配置'}`);
console.log(`   CPM_BASE_URL: ${CPM_BASE_URL}`);
console.log(`   PORT: ${PORT}`);
if (process.env.CLIENT_ORIGIN) {
  console.log(`   CLIENT_ORIGIN: ${process.env.CLIENT_ORIGIN}`);
}

// 中间件配置
app.use(cors({ 
  origin: process.env.CLIENT_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// 日志中间件
app.use((req, res, next) => {
  console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log('请求IP:', req.ip);
  console.log('用户代理:', req.headers['user-agent']);
  
  const logBody = { ...req.body };
  if (logBody.password) logBody.password = '***';
  if (logBody.targetPassword) logBody.targetPassword = '***';
  if (logBody.authToken) logBody.authToken = logBody.authToken.substring(0, 20) + '...';
  
  console.log('请求参数:', JSON.stringify(logBody, null, 2));
  next();
});

// 通用请求函数
const sendRequest = async (url, payload, headers, params = {}) => {
  try {
    const fullUrl = url + (Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '');
    console.log(`📤 发送请求: ${fullUrl}`);
    
    // 特殊处理SavePlayerRecordsIOS接口
    let requestData;
    if (url.includes('SavePlayerRecordsIOS')) {
      if (typeof payload === 'string') {
        requestData = payload;
      } else if (payload && typeof payload === 'object' && payload.data) {
        requestData = payload.data;
      } else {
        requestData = JSON.stringify(payload);
      }
      console.log('SavePlayerRecordsIOS数据格式:', typeof requestData, '长度:', requestData.length);
    } else {
      requestData = payload;
    }
    
    console.log('请求头:', headers);
    
    const response = await axios({
      method: 'POST',
      url: fullUrl,
      data: requestData,
      headers: headers,
      timeout: 30000,
      validateStatus: (status) => status < 500
    });
    
    console.log(`📥 响应状态: ${response.status}`);
    console.log('响应数据:', JSON.stringify(response.data, null, 2));
    return response.data;
    
  } catch (error) {
    console.error(`❌ 请求失败: ${error.message}`);
    if (error.response) {
      console.error('错误状态:', error.response.status);
      console.error('错误数据:', error.response.data);
    }
    return null;
  }
};

// 错误码映射
function getErrorCode(errorMsg) {
  const errorMap = {
    "EMAIL_NOT_FOUND": 100,
    "INVALID_PASSWORD": 101,
    "WEAK_PASSWORD": 102,
    "INVALID_ID_TOKEN": 103,
    "EMAIL_EXISTS": 105,
    "MISSING_PASSWORD": 106,
    "INVALID_EMAIL": 107,
    "MISSING_EMAIL": 108,
    "USER_DISABLED": 109
  };
  return errorMap[errorMsg] || 404;
}

// 1. 账号登录（唯一使用Firebase API的接口）
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
    
    const headers = {
      "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 12; SM-A025F Build/SP1A.210812.016)",
      "Content-Type": "application/json",
      "Accept": "application/json"
    };
    
    const data = await sendRequest(url, payload, headers, { key: API_KEY });
    
    if (data?.idToken) {
      res.json({
        ok: true, 
        error: 0, 
        message: "SUCCESSFUL",
        authToken: data.idToken, 
        localId: data.localId, 
        email: data.email,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn
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

// 2. 获取账号信息（使用CPM_BASE_URL）
app.post('/api/account-info', async (req, res) => {
  try {
    const { authToken } = req.body;
    if (!authToken) {
      return res.json({ ok: false, error: 401, message: "NO_AUTH_TOKEN" });
    }
    
    // 获取玩家详细数据
    const playerDataUrl = `${CPM_BASE_URL}/GetPlayerRecords2`;
    const playerData = await sendRequest(playerDataUrl, { data: null }, {
      "User-Agent": "okhttp/3.12.13",
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    });
    
    let parsedPlayerData = {};
    if (playerData?.result) {
      try {
        parsedPlayerData = typeof playerData.result === 'string' ? 
          JSON.parse(playerData.result) : playerData.result;
      } catch (e) {
        console.error('解析玩家数据失败:', e.message);
      }
    }
    
    // 获取车辆数量
    const carsUrl = `${CPM_BASE_URL}/TestGetAllCars`;
    const carsData = await sendRequest(carsUrl, { data: null }, {
      "User-Agent": "okhttp/3.12.13",
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    });
    
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
        email: parsedPlayerData.email || "",
        localId: parsedPlayerData.localID || "",
        nickname: parsedPlayerData.Name || "未设置",
        gold: parsedPlayerData.coin || 0,
        money: parsedPlayerData.money || 0,
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

// 3. 修改LocalID（使用CPM_BASE_URL）
app.post('/api/modify-localid', async (req, res) => {
  try {
    const { authToken, customLocalId } = req.body;
    if (!authToken || !customLocalId) {
      return res.json({ ok: false, error: 400, message: "MISSING_PARAMS" });
    }
    
    console.log('🚀 开始修改LocalID...');
    
    // 获取当前账号数据
    const playerDataUrl = `${CPM_BASE_URL}/GetPlayerRecords2`;
    const playerData = await sendRequest(playerDataUrl, { data: null }, {
      "User-Agent": "okhttp/3.12.13",
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    });
    
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
    
    // 更新LocalID
    parsedPlayerData.localID = customLocalId;
    
    // 清理不需要的字段
    const unwantedFields = ['_id', 'id', 'createdAt', 'updatedAt', '__v', '_v'];
    unwantedFields.forEach(field => {
      if (parsedPlayerData[field]) {
        delete parsedPlayerData[field];
      }
    });
    
    // 保存账号数据
    const updateUrl = `${CPM_BASE_URL}/SavePlayerRecordsIOS`;
    let saveSuccess = false;
    let saveResult;
    
    // 尝试格式1: 直接传递JSON字符串
    console.log('🔵 尝试保存账号数据...');
    saveResult = await sendRequest(updateUrl, JSON.stringify(parsedPlayerData), {
      "User-Agent": "okhttp/3.12.13",
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    });
    
    // 检查保存结果
    if (saveResult) {
      const resultStr = typeof saveResult === 'object' ? saveResult.result : saveResult;
      if (resultStr && (resultStr === 1 || resultStr === "1" || resultStr === '{"result":1}' || 
          (typeof resultStr === 'string' && resultStr.includes('"result":1')))) {
        saveSuccess = true;
        console.log('✅ 账号数据保存成功');
      }
    }
    
    if (!saveSuccess) {
      console.error('❌ 保存账号数据失败:', saveResult);
      return res.json({ 
        ok: false, 
        error: 500, 
        message: "SAVE_ACCOUNT_DATA_FAILED",
        debug: saveResult 
      });
    }
    
    // 更新车辆数据
    let carsUpdatedCount = 0;
    try {
      const carsUrl = `${CPM_BASE_URL}/TestGetAllCars`;
      const carsData = await sendRequest(carsUrl, { data: null }, {
        "User-Agent": "okhttp/3.12.13",
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      });
      
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
          const saveCarsUrl = `${CPM_BASE_URL}/SaveCars`;
          
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
              
              // 保存车辆
              const carSaveRes = await sendRequest(saveCarsUrl, JSON.stringify(updatedCar), {
                "Authorization": `Bearer ${authToken}`,
                "firebase-instance-id-token": FIREBASE_INSTANCE_ID_TOKEN,
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": generateCarUserAgent()
              });
              
              if (carSaveRes) {
                const carResultStr = typeof carSaveRes === 'object' ? carSaveRes.result : carSaveRes;
                if (carResultStr && (carResultStr === 1 || carResultStr === "1" || 
                    carResultStr === '{"result":1}' || 
                    (typeof carResultStr === 'string' && carResultStr.includes('"result":1')))) {
                  carsUpdatedCount++;
                  console.log(`✅ 车辆 ${i+1} 更新成功`);
                } else {
                  console.log(`❌ 车辆 ${i+1} 更新失败:`, carSaveRes);
                }
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
      carsUpdated: carsUpdatedCount
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

// 4. 克隆账号（使用CPM_BASE_URL）
app.post('/api/clone-account', async (req, res) => {
  try {
    const { sourceAuth, targetEmail, targetPassword } = req.body;
    if (!sourceAuth || !targetEmail || !targetPassword) {
      return res.json({ ok: false, error: 400, message: "MISSING_PARAMS" });
    }
    
    // 步骤1: 登录目标账号（唯一使用Firebase API的地方）
    console.log('步骤1: 登录目标账号', targetEmail);
    const targetLoginUrl = "https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword";
    const targetLoginRes = await sendRequest(targetLoginUrl, {
      email: targetEmail, 
      password: targetPassword,
      returnSecureToken: true, 
      clientType: "CLIENT_TYPE_ANDROID"
    }, {
      "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 12; SM-A025F Build/SP1A.210812.016)",
      "Content-Type": "application/json",
      "Accept": "application/json"
    }, { key: API_KEY });
    
    if (!targetLoginRes?.idToken) {
      const errorMsg = targetLoginRes?.error?.message || "TARGET_LOGIN_FAILED";
      return res.json({ 
        ok: false, 
        error: getErrorCode(errorMsg), 
        message: errorMsg 
      });
    }
    
    const targetAuth = targetLoginRes.idToken;
    const targetLocalId = strtoupper(substr(str_shuffle(md5(microtime())), 0, 10));
    console.log('生成的targetLocalId:', targetLocalId);
    
    // 步骤2: 获取源账号数据
    console.log('步骤2: 获取源账号数据');
    const sourceDataUrl = `${CPM_BASE_URL}/GetPlayerRecords2`;
    const sourceDataRes = await sendRequest(sourceDataUrl, { data: null }, {
      "Authorization": `Bearer ${sourceAuth}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "okhttp/3.12.13"
    });
    
    if (!sourceDataRes?.result) {
      return res.json({ ok: false, error: 404, message: "GET_SOURCE_DATA_FAILED" });
    }
    
    let sourceData;
    try {
      sourceData = typeof sourceDataRes.result === 'string' ? 
        JSON.parse(sourceDataRes.result) : sourceDataRes.result;
    } catch (e) {
      return res.json({ 
        ok: false, 
        error: 500, 
        message: `PARSE_SOURCE_DATA_FAILED: ${e.message}` 
      });
    }
    
    if (!sourceData?.localID) {
      return res.json({ ok: false, error: 404, message: "SOURCE_LOCALID_NOT_FOUND" });
    }
    
    const sourceLocalId = sourceData.localID;
    
    // 步骤3: 准备目标账号数据
    console.log(`步骤3: 替换LocalID ${sourceLocalId} → ${targetLocalId}`);
    const targetData = { ...sourceData };
    targetData.localID = targetLocalId;
    targetData.Name = "TELMunn";
    delete targetData._id;
    delete targetData.id;
    delete targetData.createdAt;
    delete targetData.updatedAt;
    delete targetData.__v;
    delete targetData.allData;
    
    // 步骤4: 保存目标账号数据
    console.log('步骤4: 保存目标账号数据');
    const saveTargetDataUrl = `${CPM_BASE_URL}/SavePlayerRecordsIOS`;
    const saveTargetRes = await sendRequest(saveTargetDataUrl, JSON.stringify(targetData), {
      "Authorization": `Bearer ${targetAuth}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "okhttp/3.12.13"
    });
    
    if (!saveTargetRes) {
      return res.json({ ok: false, error: 500, message: "SAVE_TARGET_DATA_FAILED" });
    }
    
    const resultStr = typeof saveTargetRes === 'object' ? saveTargetRes.result : saveTargetRes;
    if (!resultStr || !(resultStr === 1 || resultStr === "1" || resultStr === '{"result":1}' || 
        (typeof resultStr === 'string' && resultStr.includes('"result":1')))) {
      console.error('保存目标账号数据失败:', saveTargetRes);
      return res.json({ ok: false, error: 500, message: "SAVE_TARGET_DATA_FAILED" });
    }
    
    // 步骤5: 克隆车辆数据
    console.log('步骤5: 克隆车辆数据');
    const sourceCarsUrl = `${CPM_BASE_URL}/TestGetAllCars`;
    const sourceCarsRes = await sendRequest(sourceCarsUrl, { data: null }, {
      "Authorization": `Bearer ${sourceAuth}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "okhttp/3.12.13"
    });
    
    let carsClonedCount = 0;
    if (sourceCarsRes?.result) {
      let sourceCars;
      try {
        sourceCars = typeof sourceCarsRes.result === 'string' ? 
          JSON.parse(sourceCarsRes.result) : sourceCarsRes.result;
      } catch (e) {
        console.error('解析源车辆数据失败:', e.message);
        sourceCars = [];
      }
      
      if (sourceCars.length > 0) {
        const saveCarsUrl = `${CPM_BASE_URL}/SaveCars`;
        
        for (let i = 0; i < sourceCars.length; i++) {
          const car = sourceCars[i];
          console.log(`克隆车辆 ${i+1}/${sourceCars.length}`);
          
          try {
            const carCopy = JSON.parse(JSON.stringify(car));
            const carStr = JSON.stringify(carCopy);
            const newCarStr = carStr.replace(new RegExp(sourceLocalId, 'g'), targetLocalId);
            const updatedCar = JSON.parse(newCarStr);
            
            delete updatedCar._id;
            delete updatedCar.createdAt;
            delete updatedCar.updatedAt;
            delete updatedCar.__v;
            
            const carSaveRes = await sendRequest(saveCarsUrl, JSON.stringify(updatedCar), {
              "Authorization": `Bearer ${targetAuth}`,
              "firebase-instance-id-token": FIREBASE_INSTANCE_ID_TOKEN,
              "Content-Type": "application/json",
              "Accept": "application/json",
              "User-Agent": generateCarUserAgent()
            });
            
            if (carSaveRes) {
              const carResultStr = typeof carSaveRes === 'object' ? carSaveRes.result : carSaveRes;
              if (carResultStr && (carResultStr === 1 || carResultStr === "1" || 
                  carResultStr === '{"result":1}' || 
                  (typeof carResultStr === 'string' && carResultStr.includes('"result":1')))) {
                carsClonedCount++;
                console.log(`✅ 车辆 ${i+1} 克隆成功`);
              } else {
                console.log(`❌ 车辆 ${i+1} 克隆失败:`, carSaveRes);
              }
            }
          } catch (error) {
            console.error(`处理车辆克隆时出错:`, error.message);
          }
        }
      }
    }
    
    res.json({
      ok: true, 
      error: 0, 
      message: "SUCCESSFUL",
      targetEmail, 
      targetLocalId, 
      carsCloned: carsClonedCount
    });
  } catch (error) {
    console.error('克隆账号错误:', error);
    res.json({ 
      ok: false, 
      error: 500, 
      message: `SERVER_ERROR: ${error.message}` 
    });
  }
});

// 5. 修改金币（使用CPM_BASE_URL）
app.post('/api/modify-gold', async (req, res) => {
  try {
    const { authToken, goldAmount } = req.body;
    if (!authToken || goldAmount === undefined) {
      return res.json({ ok: false, error: 400, message: "MISSING_PARAMS" });
    }
    
    const gold = parseInt(goldAmount, 10);
    if (isNaN(gold)) {
      return res.json({ ok: false, error: 400, message: "INVALID_GOLD_AMOUNT" });
    }
    
    // 获取当前数据
    const playerDataUrl = `${CPM_BASE_URL}/GetPlayerRecords2`;
    const playerData = await sendRequest(playerDataUrl, { data: null }, {
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "okhttp/3.12.13"
    });
    
    if (!playerData?.result) {
      return res.json({ ok: false, error: 404, message: "GET_ACCOUNT_DATA_FAILED" });
    }
    
    let parsedData;
    try {
      parsedData = typeof playerData.result === 'string' ? 
        JSON.parse(playerData.result) : playerData.result;
    } catch (e) {
      return res.json({ 
        ok: false, 
        error: 500, 
        message: `PARSE_DATA_FAILED: ${e.message}` 
      });
    }
    
    // 更新金币
    parsedData.coin = gold;
    
    // 清理字段
    const unwantedFields = ['_id', 'id', 'createdAt', 'updatedAt', '__v', '_v'];
    unwantedFields.forEach(field => {
      if (parsedData[field]) delete parsedData[field];
    });
    
    // 保存
    const updateUrl = `${CPM_BASE_URL}/SavePlayerRecordsIOS`;
    const saveResult = await sendRequest(updateUrl, JSON.stringify(parsedData), {
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "okhttp/3.12.13"
    });
    
    // 检查结果
    const success = saveResult && (
      saveResult === 1 || 
      saveResult === "1" || 
      saveResult === '{"result":1}' || 
      (typeof saveResult === 'object' && saveResult.result && (
        saveResult.result === 1 || 
        saveResult.result === "1" || 
        saveResult.result === '{"result":1}'
      )) ||
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

// 6. 修改绿钞（使用CPM_BASE_URL）
app.post('/api/modify-money', async (req, res) => {
  try {
    const { authToken, moneyAmount } = req.body;
    if (!authToken || moneyAmount === undefined) {
      return res.json({ ok: false, error: 400, message: "MISSING_PARAMS" });
    }
    
    const money = parseInt(moneyAmount, 10);
    if (isNaN(money)) {
      return res.json({ ok: false, error: 400, message: "INVALID_MONEY_AMOUNT" });
    }
    
    // 获取当前数据
    const playerDataUrl = `${CPM_BASE_URL}/GetPlayerRecords2`;
    const playerData = await sendRequest(playerDataUrl, { data: null }, {
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "okhttp/3.12.13"
    });
    
    if (!playerData?.result) {
      return res.json({ ok: false, error: 404, message: "GET_ACCOUNT_DATA_FAILED" });
    }
    
    let parsedData;
    try {
      parsedData = typeof playerData.result === 'string' ? 
        JSON.parse(playerData.result) : playerData.result;
    } catch (e) {
      return res.json({ 
        ok: false, 
        error: 500, 
        message: `PARSE_DATA_FAILED: ${e.message}` 
      });
    }
    
    // 更新绿钞
    parsedData.money = money;
    
    // 清理字段
    const unwantedFields = ['_id', 'id', 'createdAt', 'updatedAt', '__v', '_v'];
    unwantedFields.forEach(field => {
      if (parsedData[field]) delete parsedData[field];
    });
    
    // 保存
    const updateUrl = `${CPM_BASE_URL}/SavePlayerRecordsIOS`;
    const saveResult = await sendRequest(updateUrl, JSON.stringify(parsedData), {
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "okhttp/3.12.13"
    });
    
    // 检查结果
    const success = saveResult && (
      saveResult === 1 || 
      saveResult === "1" || 
      saveResult === '{"result":1}' || 
      (typeof saveResult === 'object' && saveResult.result && (
        saveResult.result === 1 || 
        saveResult.result === "1" || 
        saveResult.result === '{"result":1}'
      )) ||
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

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    apiKeyConfigured: !!API_KEY,
    instanceTokenConfigured: !!FIREBASE_INSTANCE_ID_TOKEN,
    cpmBaseUrl: CPM_BASE_URL,
    version: '2.0.0'
  });
});

// 404处理
app.use((req, res) => {
  console.log(`404 请求: ${req.method} ${req.path}`);
  res.status(404).json({ 
    ok: false, 
    error: 404, 
    message: "API_NOT_FOUND" 
  });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('全局错误:', err.stack);
  res.status(500).json({ 
    ok: false, 
    error: 500, 
    message: `INTERNAL_SERVER_ERROR: ${err.message}` 
  });
});

// 启动服务
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log('🚀 CPM 账号管理服务启动成功！');
  console.log('='.repeat(50));
  console.log(`📍 端口: ${PORT}`);
  console.log(`🌐 访问地址: http://localhost:${PORT}`);
  console.log(`🏥 健康检查: http://localhost:${PORT}/health`);
  console.log(`🔑 Firebase API Key: ${API_KEY ? '✅ 已配置' : '❌ 未配置'}`);
  console.log(`🔑 Firebase Instance Token: ${FIREBASE_INSTANCE_ID_TOKEN ? '✅ 已配置' : '❌ 未配置'}`);
  console.log(`🌐 CPM Base URL: ${CPM_BASE_URL}`);
  console.log('📋 可用接口:');
  console.log('  POST /api/login          - 账号登录');
  console.log('  POST /api/account-info   - 获取账号信息');
  console.log('  POST /api/modify-localid - 修改LocalID');
  console.log('  POST /api/clone-account  - 克隆账号');
  console.log('  POST /api/modify-gold    - 修改金币');
  console.log('  POST /api/modify-money   - 修改绿钞');
  console.log('  GET  /health             - 健康检查');
  console.log('='.repeat(50));
});
