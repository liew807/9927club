require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto'); // 添加crypto模块

const app = express();
const PORT = process.env.PORT || 3000;

// 补全PHP同款字符串工具函数
function strtoupper(str) {
  return str.toUpperCase();
}

function substr(str, start, length) {
  if (start < 0) start = str.length + start;
  if (length === undefined) length = str.length - start;
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

// 添加缺失的函数
function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

function microtime() {
  const time = process.hrtime();
  return (time[0] * 1000 + time[1] / 1000000).toString();
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

// 中间件（修复跨域+请求解析）
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

// 改进的请求函数（更好的错误处理和调试）
const sendCPMRequest = async (url, payload, headers, params = {}) => {
  try {
    const fullUrl = url + (Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '');
    console.log(`发送请求到: ${fullUrl}`);
    console.log('请求头:', JSON.stringify(headers, null, 2));
    
    // 处理不同接口的数据格式
    let requestData;
    if (url.includes('SavePlayerRecordsIOS')) {
      requestData = typeof payload === 'string' ? payload : payload.data;
    } else if (typeof payload === 'object' && payload.data && typeof payload.data === 'string') {
      requestData = payload.data;
    } else {
      requestData = payload;
    }
    
    console.log('请求数据:', typeof requestData === 'string' ? requestData.substring(0, 500) + '...' : JSON.stringify(requestData, null, 2));

    const response = await axios({
      method: 'POST',
      url: fullUrl,
      data: requestData,
      headers: headers,
      timeout: 60000,
      validateStatus: (status) => status < 500 // 接受400+的状态码以获取详细错误信息
    });
    
    console.log(`响应状态: ${response.status}`);
    console.log('响应数据:', typeof response.data === 'string' ? response.data.substring(0, 500) + '...' : JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error(`请求失败: ${error.message}`);
    if (error.response) {
      console.error('错误响应状态:', error.response.status);
      console.error('错误响应数据:', error.response.data);
    }
    return { error: true, message: error.message };
  }
};

// 辅助函数：错误码映射
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
    const payload = { email, password, returnSecureToken: true, clientType: "CLIENT_TYPE_ANDROID" };
    const headers = {
      "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 12; SM-A025F Build/SP1A.210812.016)",
      "Content-Type": "application/json",
      "Accept": "application/json"
    };
    const data = await sendCPMRequest(url, payload, headers, { key: API_KEY });
    
    if (data?.idToken) {
      res.json({
        ok: true, error: 0, message: "SUCCESSFUL",
        authToken: data.idToken, localId: data.localId, email: data.email
      });
    } else {
      const errorMsg = data?.error?.message || "UNKNOWN_ERROR";
      const errorCode = getErrorCode(errorMsg);
      res.json({ ok: false, error: errorCode, message: errorMsg, authToken: null });
    }
  } catch (error) {
    console.error('登录接口错误:', error);
    res.json({ ok: false, error: 500, message: `SERVER_ERROR: ${error.message}` });
  }
});

// 2. 获取账号信息
app.post('/api/account-info', async (req, res) => {
  try {
    const { authToken } = req.body;
    if (!authToken) {
      return res.json({ ok: false, error: 401, message: "NO_AUTH_TOKEN" });
    }
    
    // 步骤1: 获取玩家详细数据
    const playerDataUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/GetPlayerRecords2";
    const playerData = await sendCPMRequest(playerDataUrl, { data: null }, {
      "User-Agent": "okhttp/3.12.13",
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    });
    
    let parsedPlayerData = {};
    if (playerData?.result) {
      try {
        parsedPlayerData = typeof playerData.result === 'string' ? JSON.parse(playerData.result) : playerData.result;
      } catch (e) {
        console.error('解析玩家数据失败:', e.message);
      }
    }
    
    // 步骤2: 获取基础信息
    const infoUrl = "https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo";
    const infoData = await sendCPMRequest(infoUrl, { idToken: authToken }, {
      "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 12; SM-A025F Build/SP1A.210812.016)",
      "Content-Type": "application/json",
      "Accept": "application/json"
    }, { key: API_KEY });
    
    // 步骤3: 获取车辆数量
    const carsUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/TestGetAllCars";
    const carsData = await sendCPMRequest(carsUrl, { data: null }, {
      "User-Agent": "okhttp/3.12.13",
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    });
    
    let carsList = [];
    if (carsData?.result) {
      try {
        carsList = typeof carsData.result === 'string' ? JSON.parse(carsData.result) : carsData.result;
      } catch (e) {
        console.error('解析车辆数据失败:', e.message);
      }
    }
    
    res.json({
      ok: true, error: 0, message: "SUCCESSFUL",
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
    res.json({ ok: false, error: 500, message: `SERVER_ERROR: ${error.message}` });
  }
});

// 3. 修改LocalID（修复版本）
app.post('/api/modify-localid', async (req, res) => {
  try {
    const { authToken, customLocalId } = req.body;
    if (!authToken || !customLocalId) {
      return res.json({ ok: false, error: 400, message: "MISSING_PARAMS" });
    }
    
    // 步骤1: 获取当前账号数据
    const playerDataUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/GetPlayerRecords2";
    const playerData = await sendCPMRequest(playerDataUrl, { data: null }, {
      "User-Agent": "okhttp/3.12.13",
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    });
    
    if (!playerData?.result) {
      return res.json({ ok: false, error: 404, message: "GET_ACCOUNT_DATA_FAILED" });
    }
    
    let parsedPlayerData;
    try {
      parsedPlayerData = typeof playerData.result === 'string' ? JSON.parse(playerData.result) : playerData.result;
    } catch (e) {
      return res.json({ ok: false, error: 500, message: `PARSE_DATA_FAILED: ${e.message}` });
    }
    
    if (!parsedPlayerData?.localID) {
      return res.json({ ok: false, error: 404, message: "LOCALID_NOT_FOUND" });
    }
    
    const oldLocalId = parsedPlayerData.localID;
    console.log(`修改LocalID：旧ID=${oldLocalId} → 新ID=${customLocalId}`);
    
    // 步骤2: 更新LocalID + 清理字段
    parsedPlayerData.localID = customLocalId;
    delete parsedPlayerData._id;
    delete parsedPlayerData.id;
    delete parsedPlayerData.createdAt;
    delete parsedPlayerData.updatedAt;
    delete parsedPlayerData.__v;
    
    // 步骤3: 保存账号数据
    const updateUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/SavePlayerRecordsIOS";
    const updateRes = await sendCPMRequest(updateUrl, JSON.stringify(parsedPlayerData), {
      "User-Agent": "okhttp/3.12.13",
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    });
    
    if (!updateRes || (typeof updateRes === 'object' && updateRes.error)) {
      return res.json({ ok: false, error: 500, message: "SAVE_ACCOUNT_DATA_FAILED" });
    }
    
    // 检查保存结果（可能是字符串或对象格式）
    const resultStr = typeof updateRes === 'string' ? updateRes : updateRes.result;
    if (!resultStr || !resultStr.includes('"result":1')) {
      console.error('保存账号数据失败:', updateRes);
      return res.json({ ok: false, error: 500, message: "SAVE_ACCOUNT_DATA_FAILED" });
    }
    
    // 步骤4: 更新车辆数据
    const carsUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/TestGetAllCars";
    const carsData = await sendCPMRequest(carsUrl, { data: null }, {
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "okhttp/3.12.13"
    });
    
    let carsUpdatedCount = 0;
    if (carsData?.result) {
      let carsList;
      try {
        carsList = typeof carsData.result === 'string' ? JSON.parse(carsData.result) : carsData.result;
      } catch (e) {
        console.error('解析车辆数据失败:', e.message);
        carsList = [];
      }
      
      if (carsList.length > 0) {
        const saveCarsUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/SaveCars";
        
        for (const car of carsList) {
          try {
            const carCopy = JSON.parse(JSON.stringify(car));
            const carStr = JSON.stringify(carCopy);
            const newCarStr = carStr.replace(new RegExp(oldLocalId, 'g'), customLocalId);
            const updatedCar = JSON.parse(newCarStr);
            
            // 清理车辆字段
            delete updatedCar._id;
            delete updatedCar.createdAt;
            delete updatedCar.updatedAt;
            delete updatedCar.__v;
            
            // 修复请求头格式
            const carSaveRes = await sendCPMRequest(saveCarsUrl, JSON.stringify(updatedCar), {
              "Authorization": `Bearer ${authToken}`,
              "firebase-instance-id-token": FIREBASE_INSTANCE_ID_TOKEN,
              "Content-Type": "application/json",
              "Accept": "application/json",
              "User-Agent": generateCarUserAgent()
            });
            
            // 检查保存结果
            const carResultStr = typeof carSaveRes === 'string' ? carSaveRes : carSaveRes?.result;
            if (carResultStr && carResultStr.includes('"result":1')) {
              carsUpdatedCount++;
              console.log(`车辆 ${carsUpdatedCount}/${carsList.length} 更新成功`);
            } else {
              console.error(`车辆保存失败:`, carSaveRes);
            }
          } catch (error) {
            console.error('处理车辆时出错:', error.message);
          }
        }
      }
    }
    
    res.json({
      ok: true, error: 0, message: "SUCCESSFUL",
      oldLocalId, newLocalId: customLocalId,
      carsUpdated: carsUpdatedCount
    });
  } catch (error) {
    console.error('修改LocalID错误:', error);
    res.json({ ok: false, error: 500, message: `SERVER_ERROR: ${error.message}` });
  }
});

// 4. 克隆账号（修复版本）
app.post('/api/clone-account', async (req, res) => {
  try {
    const { sourceAuth, targetEmail, targetPassword } = req.body;
    if (!sourceAuth || !targetEmail || !targetPassword) {
      return res.json({ ok: false, error: 400, message: "MISSING_PARAMS" });
    }
    
    // 步骤1: 登录目标账号
    console.log('步骤1: 登录目标账号', targetEmail);
    const targetLoginUrl = "https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword";
    const targetLoginRes = await sendCPMRequest(targetLoginUrl, {
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
      return res.json({ ok: false, error: getErrorCode(errorMsg), message: errorMsg });
    }
    
    const targetAuth = targetLoginRes.idToken;
    const targetLocalId = strtoupper(substr(str_shuffle(md5(microtime())), 0, 10));
    console.log('生成的targetLocalId:', targetLocalId);
    
    // 步骤2: 获取源账号数据
    console.log('步骤2: 获取源账号数据');
    const sourceDataUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/GetPlayerRecords2";
    const sourceDataRes = await sendCPMRequest(sourceDataUrl, { data: null }, {
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
      sourceData = typeof sourceDataRes.result === 'string' ? JSON.parse(sourceDataRes.result) : sourceDataRes.result;
    } catch (e) {
      return res.json({ ok: false, error: 500, message: `PARSE_SOURCE_DATA_FAILED: ${e.message}` });
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
    const saveTargetDataUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/SavePlayerRecordsIOS";
    const saveTargetRes = await sendCPMRequest(saveTargetDataUrl, JSON.stringify(targetData), {
      "Authorization": `Bearer ${targetAuth}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "okhttp/3.12.13"
    });
    
    if (!saveTargetRes || (typeof saveTargetRes === 'object' && saveTargetRes.error)) {
      return res.json({ ok: false, error: 500, message: "SAVE_TARGET_DATA_FAILED" });
    }
    
    const resultStr = typeof saveTargetRes === 'string' ? saveTargetRes : saveTargetRes.result;
    if (!resultStr || !resultStr.includes('"result":1')) {
      console.error('保存目标账号数据失败:', saveTargetRes);
      return res.json({ ok: false, error: 500, message: "SAVE_TARGET_DATA_FAILED" });
    }
    
    // 步骤5: 克隆车辆数据
    console.log('步骤5: 克隆车辆数据');
    const sourceCarsUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/TestGetAllCars";
    const sourceCarsRes = await sendCPMRequest(sourceCarsUrl, { data: null }, {
      "Authorization": `Bearer ${sourceAuth}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "okhttp/3.12.13"
    });
    
    let carsClonedCount = 0;
    if (sourceCarsRes?.result) {
      let sourceCars;
      try {
        sourceCars = typeof sourceCarsRes.result === 'string' ? JSON.parse(sourceCarsRes.result) : sourceCarsRes.result;
      } catch (e) {
        console.error('解析源车辆数据失败:', e.message);
        sourceCars = [];
      }
      
      if (sourceCars.length > 0) {
        const saveCarsUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/SaveCars";
        
        for (const car of sourceCars) {
          try {
            const carCopy = JSON.parse(JSON.stringify(car));
            const carStr = JSON.stringify(carCopy);
            const newCarStr = carStr.replace(new RegExp(sourceLocalId, 'g'), targetLocalId);
            const updatedCar = JSON.parse(newCarStr);
            
            delete updatedCar._id;
            delete updatedCar.createdAt;
            delete updatedCar.updatedAt;
            delete updatedCar.__v;
            
            const carSaveRes = await sendCPMRequest(saveCarsUrl, JSON.stringify(updatedCar), {
              "Authorization": `Bearer ${targetAuth}`,
              "firebase-instance-id-token": FIREBASE_INSTANCE_ID_TOKEN,
              "Content-Type": "application/json",
              "Accept": "application/json",
              "User-Agent": generateCarUserAgent()
            });
            
            const carResultStr = typeof carSaveRes === 'string' ? carSaveRes : carSaveRes?.result;
            if (carResultStr && carResultStr.includes('"result":1')) {
              carsClonedCount++;
              console.log(`车辆 ${carsClonedCount}/${sourceCars.length} 克隆成功`);
            } else {
              console.error(`车辆克隆失败:`, carSaveRes);
            }
          } catch (error) {
            console.error('处理车辆克隆时出错:', error.message);
          }
        }
      }
    }
    
    res.json({
      ok: true, error: 0, message: "SUCCESSFUL",
      targetEmail, targetLocalId, carsCloned: carsClonedCount
    });
  } catch (error) {
    console.error('克隆账号错误:', error);
    res.json({ ok: false, error: 500, message: `SERVER_ERROR: ${error.message}` });
  }
});

// 5. 修改金币（修复版本）
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
    
    // 步骤1: 获取当前账号数据
    const playerDataUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/GetPlayerRecords2";
    const playerData = await sendCPMRequest(playerDataUrl, { data: null }, {
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "okhttp/3.12.13"
    });
    
    if (!playerData?.result) {
      return res.json({ ok: false, error: 404, message: "GET_ACCOUNT_DATA_FAILED" });
    }
    
    let parsedPlayerData;
    try {
      parsedPlayerData = typeof playerData.result === 'string' ? JSON.parse(playerData.result) : playerData.result;
    } catch (e) {
      return res.json({ ok: false, error: 500, message: `PARSE_DATA_FAILED: ${e.message}` });
    }
    
    // 步骤2: 修改金币字段
    parsedPlayerData.coin = gold;
    
    // 清理字段
    delete parsedPlayerData._id;
    delete parsedPlayerData.id;
    delete parsedPlayerData.createdAt;
    delete parsedPlayerData.updatedAt;
    delete parsedPlayerData.__v;
    
    // 步骤3: 保存数据
    const updateUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/SavePlayerRecordsIOS";
    const updateRes = await sendCPMRequest(updateUrl, JSON.stringify(parsedPlayerData), {
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "okhttp/3.12.13"
    });
    
    if (!updateRes || (typeof updateRes === 'object' && updateRes.error)) {
      return res.json({ ok: false, error: 500, message: "SAVE_GOLD_FAILED" });
    }
    
    const resultStr = typeof updateRes === 'string' ? updateRes : updateRes.result;
    if (resultStr && resultStr.includes('"result":1')) {
      res.json({ 
        ok: true, error: 0, message: "SUCCESSFUL",
        goldAmount: gold,
        data: { coin: gold }
      });
    } else {
      console.error('修改金币保存失败:', updateRes);
      res.json({ ok: false, error: 500, message: "SAVE_GOLD_FAILED" });
    }
  } catch (error) {
    console.error('修改金币错误:', error);
    res.json({ ok: false, error: 500, message: `SERVER_ERROR: ${error.message}` });
  }
});

// 6. 修改绿钞（修复版本）
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
    
    // 步骤1: 获取当前账号数据
    const playerDataUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/GetPlayerRecords2";
    const playerData = await sendCPMRequest(playerDataUrl, { data: null }, {
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "okhttp/3.12.13"
    });
    
    if (!playerData?.result) {
      return res.json({ ok: false, error: 404, message: "GET_ACCOUNT_DATA_FAILED" });
    }
    
    let parsedPlayerData;
    try {
      parsedPlayerData = typeof playerData.result === 'string' ? JSON.parse(playerData.result) : playerData.result;
    } catch (e) {
      return res.json({ ok: false, error: 500, message: `PARSE_DATA_FAILED: ${e.message}` });
    }
    
    // 步骤2: 修改绿钞字段
    parsedPlayerData.money = money;
    
    // 清理字段
    delete parsedPlayerData._id;
    delete parsedPlayerData.id;
    delete parsedPlayerData.createdAt;
    delete parsedPlayerData.updatedAt;
    delete parsedPlayerData.__v;
    
    // 步骤3: 保存数据
    const updateUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/SavePlayerRecordsIOS";
    const updateRes = await sendCPMRequest(updateUrl, JSON.stringify(parsedPlayerData), {
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "okhttp/3.12.13"
    });
    
    if (!updateRes || (typeof updateRes === 'object' && updateRes.error)) {
      return res.json({ ok: false, error: 500, message: "SAVE_MONEY_FAILED" });
    }
    
    const resultStr = typeof updateRes === 'string' ? updateRes : updateRes.result;
    if (resultStr && resultStr.includes('"result":1')) {
      res.json({ 
        ok: true, error: 0, message: "SUCCESSFUL",
        moneyAmount: money,
        data: { money: money }
      });
    } else {
      console.error('修改绿钞保存失败:', updateRes);
      res.json({ ok: false, error: 500, message: "SAVE_MONEY_FAILED" });
    }
  } catch (error) {
    console.error('修改绿钞错误:', error);
    res.json({ ok: false, error: 500, message: `SERVER_ERROR: ${error.message}` });
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
  console.log(`🚀 服务启动成功！端口: ${PORT}`);
  console.log(`🌐 访问地址: http://localhost:${PORT}`);
  console.log(`🔑 API Key 配置: ${API_KEY ? '已配置' : '未配置'}`);
  console.log(`🔑 Firebase Instance Token: ${FIREBASE_INSTANCE_ID_TOKEN ? '已配置' : '未配置'}`);
});
