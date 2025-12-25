require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');

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

// 修复请求函数 - 专门处理SavePlayerRecordsIOS
const sendCPMRequest = async (url, payload, headers, params = {}) => {
  try {
    const fullUrl = url + (Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '');
    console.log(`发送请求到: ${fullUrl}`);
    console.log('请求头:', JSON.stringify(headers, null, 2));
    
    // 关键修复：SavePlayerRecordsIOS接口需要特定格式
    let requestData;
    if (url.includes('SavePlayerRecordsIOS')) {
      // 对于SavePlayerRecordsIOS，payload应该是字符串化的JSON
      if (typeof payload === 'string') {
        // 如果是字符串，直接使用
        requestData = payload;
      } else if (typeof payload === 'object') {
        // 如果是对象，检查是否有data属性
        if (payload.data && typeof payload.data === 'string') {
          requestData = payload.data;
        } else {
          // 直接字符串化整个对象
          requestData = JSON.stringify(payload);
        }
      }
      console.log('SavePlayerRecordsIOS数据格式:', typeof requestData, '长度:', requestData?.length);
    } else {
      // 其他接口正常处理
      requestData = payload;
    }
    
    console.log('请求数据（前100字符）:', typeof requestData === 'string' ? requestData.substring(0, 100) + '...' : JSON.stringify(requestData, null, 2));

    const response = await axios({
      method: 'POST',
      url: fullUrl,
      data: requestData,
      headers: headers,
      timeout: 10000, // 缩短超时时间以便快速失败
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    
    console.log(`响应状态: ${response.status}`);
    
    // 尝试多种方式解析响应
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
    
    console.log('响应数据:', typeof responseData === 'string' ? responseData.substring(0, 200) : JSON.stringify(responseData, null, 2));
    return responseData;
  } catch (error) {
    console.error(`请求失败: ${error.message}`);
    if (error.response) {
      console.error('错误响应状态:', error.response.status);
      console.error('错误响应头:', error.response.headers);
      console.error('错误响应数据:', error.response.data);
    } else if (error.request) {
      console.error('无响应:', error.request);
    }
    return { 
      error: true, 
      message: error.message,
      code: error.response?.status
    };
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

// 3. 修改LocalID（完全重写，修复SavePlayerRecordsIOS问题）
app.post('/api/modify-localid', async (req, res) => {
  try {
    const { authToken, customLocalId } = req.body;
    if (!authToken || !customLocalId) {
      return res.json({ ok: false, error: 400, message: "MISSING_PARAMS" });
    }
    
    console.log('开始修改LocalID...');
    
    // 步骤1: 获取当前账号数据
    const playerDataUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/GetPlayerRecords2";
    const playerData = await sendCPMRequest(playerDataUrl, { data: null }, {
      "User-Agent": "okhttp/3.12.13",
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    });
    
    if (!playerData?.result) {
      console.error('获取账号数据失败:', playerData);
      return res.json({ ok: false, error: 404, message: "GET_ACCOUNT_DATA_FAILED" });
    }
    
    let parsedPlayerData;
    try {
      parsedPlayerData = typeof playerData.result === 'string' ? JSON.parse(playerData.result) : playerData.result;
    } catch (e) {
      console.error('解析数据失败:', e);
      return res.json({ ok: false, error: 500, message: `PARSE_DATA_FAILED: ${e.message}` });
    }
    
    if (!parsedPlayerData?.localID) {
      console.error('localID不存在:', parsedPlayerData);
      return res.json({ ok: false, error: 404, message: "LOCALID_NOT_FOUND" });
    }
    
    const oldLocalId = parsedPlayerData.localID;
    console.log(`修改LocalID：旧ID=${oldLocalId} → 新ID=${customLocalId}`);
    
    // 步骤2: 更新LocalID + 清理字段
    parsedPlayerData.localID = customLocalId;
    
    // 清理可能存在的多余字段
    const fieldsToDelete = ['_id', 'id', 'createdAt', 'updatedAt', '__v', '_v'];
    fieldsToDelete.forEach(field => {
      delete parsedPlayerData[field];
    });
    
    console.log('清理后的数据字段:', Object.keys(parsedPlayerData));
    
    // 步骤3: 保存账号数据 - 关键修复点
    const updateUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/SavePlayerRecordsIOS";
    
    // 方法1: 尝试PHP原版格式
    const dataToSave = JSON.stringify(parsedPlayerData);
    console.log('准备保存的数据（前200字符）:', dataToSave.substring(0, 200));
    
    const updateRes = await sendCPMRequest(updateUrl, { data: dataToSave }, {
      "User-Agent": "okhttp/3.12.13",
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    });
    
    console.log('保存响应:', updateRes);
    
    // 检查保存结果
    if (updateRes && !updateRes.error) {
      // 尝试多种可能的成功响应格式
      let success = false;
      
      if (typeof updateRes === 'string') {
        // 字符串格式
        if (updateRes.includes('"result":1') || updateRes.includes('result":1') || updateRes.includes('{"result":1}')) {
          success = true;
        }
      } else if (typeof updateRes === 'object') {
        // 对象格式
        if (updateRes.result === '{"result":1}' || updateRes.result === 1 || updateRes.result === "1") {
          success = true;
        } else if (updateRes.result && typeof updateRes.result === 'string') {
          if (updateRes.result.includes('"result":1')) {
            success = true;
          }
        }
      }
      
      if (success) {
        console.log('账号数据保存成功');
        
        // 步骤4: 更新车辆数据
        let carsUpdatedCount = 0;
        try {
          const carsUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/TestGetAllCars";
          const carsData = await sendCPMRequest(carsUrl, { data: null }, {
            "Authorization": `Bearer ${authToken}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "okhttp/3.12.13"
          });
          
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
              
              for (let i = 0; i < carsList.length; i++) {
                try {
                  const car = carsList[i];
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
                  
                  console.log(`车辆 ${i+1}/${carsList.length} 保存响应:`, carSaveRes);
                  
                  if (carSaveRes && !carSaveRes.error) {
                    const carResultStr = typeof carSaveRes === 'string' ? carSaveRes : carSaveRes?.result;
                    if (carResultStr && (carResultStr.includes('"result":1') || carResultStr.includes('result":1'))) {
                      carsUpdatedCount++;
                    }
                  }
                } catch (error) {
                  console.error(`处理车辆 ${i+1} 时出错:`, error.message);
                }
              }
            }
          }
        } catch (error) {
          console.error('更新车辆数据时出错:', error);
        }
        
        res.json({
          ok: true, error: 0, message: "SUCCESSFUL",
          oldLocalId, newLocalId: customLocalId,
          carsUpdated: carsUpdatedCount
        });
        return;
      }
    }
    
    // 如果方法1失败，尝试方法2：直接传递字符串
    console.log('方法1失败，尝试方法2...');
    const updateRes2 = await sendCPMRequest(updateUrl, dataToSave, {
      "User-Agent": "okhttp/3.12.13",
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    });
    
    console.log('方法2响应:', updateRes2);
    
    if (updateRes2 && !updateRes2.error) {
      res.json({
        ok: true, error: 0, message: "SUCCESSFUL",
        oldLocalId, newLocalId: customLocalId,
        carsUpdated: 0, // 先不处理车辆
        note: "账号数据保存成功，车辆数据需要手动处理"
      });
      return;
    }
    
    console.error('所有保存方法都失败');
    res.json({ ok: false, error: 500, message: "SAVE_ACCOUNT_DATA_FAILED", debug: updateRes || updateRes2 });
    
  } catch (error) {
    console.error('修改LocalID错误:', error);
    res.json({ ok: false, error: 500, message: `SERVER_ERROR: ${error.message}` });
  }
});

// 4. 修改金币（简化版本，专注于SavePlayerRecordsIOS问题）
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
    
    console.log(`修改金币到: ${gold}`);
    
    // 获取当前账号数据
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
    
    // 修改金币字段
    parsedPlayerData.coin = gold;
    
    // 清理字段
    const fieldsToDelete = ['_id', 'id', 'createdAt', 'updatedAt', '__v', '_v'];
    fieldsToDelete.forEach(field => {
      delete parsedPlayerData[field];
    });
    
    // 保存数据 - 尝试多种格式
    const updateUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/SavePlayerRecordsIOS";
    const dataToSave = JSON.stringify(parsedPlayerData);
    
    // 方法1: 使用data属性
    let success = false;
    const updateRes = await sendCPMRequest(updateUrl, { data: dataToSave }, {
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "okhttp/3.12.13"
    });
    
    if (updateRes && !updateRes.error) {
      if (typeof updateRes === 'string') {
        if (updateRes.includes('"result":1') || updateRes.includes('result":1')) {
          success = true;
        }
      } else if (updateRes?.result) {
        const resultStr = typeof updateRes.result === 'string' ? updateRes.result : JSON.stringify(updateRes.result);
        if (resultStr.includes('"result":1') || resultStr.includes('result":1')) {
          success = true;
        }
      }
    }
    
    if (!success) {
      // 方法2: 直接传递字符串
      const updateRes2 = await sendCPMRequest(updateUrl, dataToSave, {
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "okhttp/3.12.13"
      });
      
      if (updateRes2 && !updateRes2.error) {
        success = true;
      }
    }
    
    if (success) {
      res.json({ 
        ok: true, error: 0, message: "SUCCESSFUL",
        goldAmount: gold,
        data: { coin: gold }
      });
    } else {
      console.error('修改金币保存失败:', updateRes);
      res.json({ ok: false, error: 500, message: "SAVE_GOLD_FAILED", debug: updateRes });
    }
  } catch (error) {
    console.error('修改金币错误:', error);
    res.json({ ok: false, error: 500, message: `SERVER_ERROR: ${error.message}` });
  }
});

// 5. 修改绿钞（与修改金币相同逻辑）
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
    
    console.log(`修改绿钞到: ${money}`);
    
    // 获取当前账号数据
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
    
    // 修改绿钞字段
    parsedPlayerData.money = money;
    
    // 清理字段
    const fieldsToDelete = ['_id', 'id', 'createdAt', 'updatedAt', '__v', '_v'];
    fieldsToDelete.forEach(field => {
      delete parsedPlayerData[field];
    });
    
    // 保存数据
    const updateUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/SavePlayerRecordsIOS";
    const dataToSave = JSON.stringify(parsedPlayerData);
    
    let success = false;
    const updateRes = await sendCPMRequest(updateUrl, { data: dataToSave }, {
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "okhttp/3.12.13"
    });
    
    if (updateRes && !updateRes.error) {
      if (typeof updateRes === 'string') {
        if (updateRes.includes('"result":1') || updateRes.includes('result":1')) {
          success = true;
        }
      } else if (updateRes?.result) {
        const resultStr = typeof updateRes.result === 'string' ? updateRes.result : JSON.stringify(updateRes.result);
        if (resultStr.includes('"result":1') || resultStr.includes('result":1')) {
          success = true;
        }
      }
    }
    
    if (!success) {
      const updateRes2 = await sendCPMRequest(updateUrl, dataToSave, {
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "okhttp/3.12.13"
      });
      
      if (updateRes2 && !updateRes2.error) {
        success = true;
      }
    }
    
    if (success) {
      res.json({ 
        ok: true, error: 0, message: "SUCCESSFUL",
        moneyAmount: money,
        data: { money: money }
      });
    } else {
      console.error('修改绿钞保存失败:', updateRes);
      res.json({ ok: false, error: 500, message: "SAVE_MONEY_FAILED", debug: updateRes });
    }
  } catch (error) {
    console.error('修改绿钞错误:', error);
    res.json({ ok: false, error: 500, message: `SERVER_ERROR: ${error.message}` });
  }
});

// 新增：测试SavePlayerRecordsIOS接口
app.post('/api/test-save', async (req, res) => {
  try {
    const { authToken } = req.body;
    if (!authToken) {
      return res.json({ ok: false, error: 401, message: "NO_AUTH_TOKEN" });
    }
    
    // 先获取数据
    const playerDataUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/GetPlayerRecords2";
    const playerData = await sendCPMRequest(playerDataUrl, { data: null }, {
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "okhttp/3.12.13"
    });
    
    if (!playerData?.result) {
      return res.json({ ok: false, error: 404, message: "GET_DATA_FAILED" });
    }
    
    let parsedData;
    try {
      parsedData = typeof playerData.result === 'string' ? JSON.parse(playerData.result) : playerData.result;
    } catch (e) {
      return res.json({ ok: false, error: 500, message: `PARSE_FAILED: ${e.message}` });
    }
    
    // 清理数据
    const fieldsToDelete = ['_id', 'id', 'createdAt', 'updatedAt', '__v', '_v'];
    fieldsToDelete.forEach(field => {
      delete parsedData[field];
    });
    
    const testData = JSON.stringify(parsedData);
    
    // 测试不同格式
    const updateUrl = "https://us-central1-cp-multiplayer.cloudfunctions.net/SavePlayerRecordsIOS";
    
    // 格式1: {data: jsonString}
    console.log('\n=== 测试格式1: {data: jsonString} ===');
    const res1 = await sendCPMRequest(updateUrl, { data: testData }, {
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "okhttp/3.12.13"
    });
    
    // 格式2: 直接jsonString
    console.log('\n=== 测试格式2: 直接jsonString ===');
    const res2 = await sendCPMRequest(updateUrl, testData, {
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "okhttp/3.12.13"
    });
    
    // 格式3: PHP格式 {data: jsonStringifiedAgain}
    console.log('\n=== 测试格式3: PHP格式 ===');
    const res3 = await sendCPMRequest(updateUrl, { data: JSON.stringify({data: testData}) }, {
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "okhttp/3.12.13"
    });
    
    res.json({
      ok: true,
      testResults: {
        format1: res1,
        format2: res2,
        format3: res3
      }
    });
    
  } catch (error) {
    console.error('测试接口错误:', error);
    res.json({ ok: false, error: 500, message: `TEST_ERROR: ${error.message}` });
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
  console.log(`📝 测试接口: POST http://localhost:${PORT}/api/test-save`);
});
