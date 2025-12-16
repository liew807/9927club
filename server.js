require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); 

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// 验证环境变量
const requiredEnv = ['FIREBASE_API_KEY', 'RANK_URL', 'GAME_API_BASE'];
const missingEnv = requiredEnv.filter(key => !process.env[key]);
if (missingEnv.length > 0) {
    console.error('缺少必要环境变量：', missingEnv.join(', '));
    process.exit(1); 
}

// 用户会话管理（简化版）
class UserSessionManager {
    constructor() {
        this.activeSessions = new Map();
    }

    createSession(userId, email) {
        const sessionId = this.generateSessionId();
        const session = {
            userId,
            email,
            startTime: new Date(),
            lastActivity: new Date()
        };
        
        this.activeSessions.set(sessionId, session);
        console.log(`用户 ${email} 创建会话: ${sessionId}`);
        
        return sessionId;
    }

    validateSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            return { valid: false, message: '会话无效或已过期' };
        }

        // 更新最后活动时间
        session.lastActivity = new Date();
        
        return {
            valid: true,
            data: {
                userId: session.userId,
                email: session.email
            }
        };
    }

    removeSession(sessionId) {
        this.activeSessions.delete(sessionId);
    }

    generateSessionId() {
        return 'user_session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // 清理过期会话（可选）
    cleanupExpiredSessions() {
        const now = new Date();
        const maxAge = 24 * 60 * 60 * 1000; // 24小时
        
        for (const [sessionId, session] of this.activeSessions.entries()) {
            if (now - session.lastActivity > maxAge) {
                this.activeSessions.delete(sessionId);
                console.log(`清理过期会话: ${sessionId}`);
            }
        }
    }
}

// 初始化用户会话管理器
const userSessionManager = new UserSessionManager();
// 每30分钟清理一次过期会话
setInterval(() => userSessionManager.cleanupExpiredSessions(), 30 * 60 * 1000);

// ========== 【修复的登录接口 - 核心修复】 ==========
app.post('/api/login', async (req, res) => {
    console.log('🔐 收到登录请求');
    
    try {
        const { email, password } = req.body;

        // 基础验证
        if (!email || !password) {
            console.log('❌ 登录失败：邮箱或密码为空');
            return res.status(400).json({
                success: false,
                message: "请提供邮箱和密码"
            });
        }

        // 验证邮箱格式
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            console.log('❌ 登录失败：邮箱格式无效');
            return res.status(400).json({
                success: false,
                message: "请输入有效的邮箱格式"
            });
        }

        // 检查API Key
        if (!process.env.FIREBASE_API_KEY) {
            console.error('❌ FIREBASE_API_KEY 未配置');
            return res.status(500).json({
                success: false,
                message: "服务器配置错误"
            });
        }

        // 【核心修复点1】使用正确的Firebase REST API端点
        console.log('🔄 尝试Firebase登录...');
        const firebaseUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`;
        
        const firebaseResponse = await fetch(firebaseUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                email: email.trim(),
                password: password,
                returnSecureToken: true
            })
        });

        console.log('📊 Firebase响应状态:', firebaseResponse.status);
        
        const firebaseData = await firebaseResponse.json();
        
        if (!firebaseResponse.ok) {
            console.log('❌ Firebase错误:', firebaseData.error);
            
            // 【核心修复点2】详细的错误处理
            let userMessage = "登录失败";
            if (firebaseData.error && firebaseData.error.message) {
                const errorCode = firebaseData.error.message;
                switch (true) {
                    case errorCode.includes('INVALID_EMAIL'):
                    case errorCode.includes('EMAIL_NOT_FOUND'):
                        userMessage = "邮箱地址不存在";
                        break;
                    case errorCode.includes('INVALID_PASSWORD'):
                        userMessage = "密码错误";
                        break;
                    case errorCode.includes('USER_DISABLED'):
                        userMessage = "账号已被禁用";
                        break;
                    case errorCode.includes('TOO_MANY_ATTEMPTS_TRY_LATER'):
                        userMessage = "尝试次数过多，请稍后再试";
                        break;
                    case errorCode.includes('INVALID_LOGIN_CREDENTIALS'):
                        userMessage = "邮箱或密码错误";
                        break;
                    default:
                        userMessage = firebaseData.error.message;
                }
            }
            
            return res.status(400).json({
                success: false,
                message: userMessage
            });
        }

        // 登录成功
        console.log('✅ 登录成功:', firebaseData.email);
        
        // 创建用户会话
        const sessionId = userSessionManager.createSession(firebaseData.localId, email);

        // 返回用户信息
        res.json({
            success: true,
            data: {
                email: firebaseData.email,
                userId: firebaseData.localId,
                idToken: firebaseData.idToken,
                sessionId: sessionId,
                expiresIn: firebaseData.expiresIn,
                refreshToken: firebaseData.refreshToken
            }
        });

    } catch (error) {
        console.error('💥 登录过程异常:', error);
        
        // 网络错误处理
        if (error.name === 'FetchError' || error.code === 'ECONNREFUSED' || error.message.includes('fetch')) {
            console.log('🌐 网络连接错误');
            return res.status(503).json({
                success: false,
                message: "无法连接到身份验证服务，请检查网络连接"
            });
        }
        
        res.status(500).json({
            success: false,
            message: "服务器内部错误"
        });
    }
});

// 2. 修改邮箱接口
app.post('/api/change-email', async (req, res) => {
    try {
        const { idToken, newEmail, sessionId } = req.body;

        if (!idToken || !newEmail) {
            return res.status(400).json({
                success: false,
                message: "请提供完整的参数"
            });
        }

        // 验证邮箱格式
        if (!/^[\w.-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/.test(newEmail)) {
            return res.status(400).json({
                success: false,
                message: "请输入有效的邮箱格式"
            });
        }

        // 可选：验证会话（如果提供了sessionId）
        if (sessionId) {
            const sessionValidation = userSessionManager.validateSession(sessionId);
            if (!sessionValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: sessionValidation.message
                });
            }
        }

        // 调用Firebase修改邮箱接口
        const firebaseResponse = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${process.env.FIREBASE_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idToken,
                    email: newEmail,
                    returnSecureToken: true
                })
            }
        );

        const firebaseData = await firebaseResponse.json();

        if (!firebaseResponse.ok) {
            throw new Error(
                firebaseData.error?.message || "修改邮箱失败"
            );
        }

        // 如果修改成功，更新会话中的邮箱信息
        if (sessionId) {
            const session = userSessionManager.activeSessions.get(sessionId);
            if (session) {
                session.email = newEmail;
            }
        }

        res.json({
            success: true,
            data: {
                email: firebaseData.email,
                idToken: firebaseData.idToken
            }
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// 3. 修改密码接口
app.post('/api/change-password', async (req, res) => {
    try {
        const { idToken, newPassword, sessionId } = req.body;

        if (!idToken || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "请提供完整的参数"
            });
        }

        // 密码长度验证
        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: "密码长度不能少于6位"
            });
        }

        // 可选：验证会话（如果提供了sessionId）
        if (sessionId) {
            const sessionValidation = userSessionManager.validateSession(sessionId);
            if (!sessionValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: sessionValidation.message
                });
            }
        }

        // 调用Firebase修改密码接口
        const firebaseResponse = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${process.env.FIREBASE_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idToken,
                    password: newPassword,
                    returnSecureToken: true
                })
            }
        );

        const firebaseData = await firebaseResponse.json();

        if (!firebaseResponse.ok) {
            throw new Error(
                firebaseData.error?.message || "修改密码失败"
            );
        }

        res.json({
            success: true,
            data: {
                idToken: firebaseData.idToken
            }
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// 4. 设置国王等级接口
app.post('/api/king-rank', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const { sessionId } = req.body;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: "请提供有效的身份令牌"
            });
        }

        // 可选：验证会话（如果提供了sessionId）
        if (sessionId) {
            const sessionValidation = userSessionManager.validateSession(sessionId);
            if (!sessionValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: sessionValidation.message
                });
            }
        }

        const idToken = authHeader.split(' ')[1];

        // 构造等级数据
        const ratingData = {
            "cars": 100000, "car_fix": 100000, "car_collided": 100000, "car_exchange": 100000,
            "car_trade": 100000, "car_wash": 100000, "slicer_cut": 100000, "drift_max": 100000,
            "drift": 100000, "cargo": 100000, "delivery": 100000, "taxi": 100000, "levels": 100000,
            "gifts": 100000, "fuel": 100000, "offroad": 100000, "speed_banner": 100000,
            "reactions": 100000, "police": 100000, "run": 100000, "real_estate": 100000,
            "t_distance": 100000, "treasure": 100000, "block_post": 100000, "push_ups": 100000,
            "burnt_tire": 100000, "passanger_distance": 100000, "time": 10000000000, "race_win": 3000
        };

        // 调用等级设置接口
        const rankResponse = await fetch(process.env.RANK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`,
                'User-Agent': 'okhttp/3.12.13'
            },
            body: JSON.stringify({
                data: JSON.stringify({ RatingData: ratingData })
            })
        );

        if (!rankResponse.ok) {
            throw new Error(`等级设置接口返回错误：${rankResponse.statusText}`);
        }

        res.json({
            success: true,
            message: "国王等级设置成功"
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// 5. 自定义ID接口 - 已修改为调用 SaveAppVersionOnAccountCreated1
app.post('/api/custom-id', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const { requestedId, sessionId, appVersion } = req.body;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: "请提供有效的身份令牌"
            });
        }

        // 验证会话
        if (sessionId) {
            const sessionValidation = userSessionManager.validateSession(sessionId);
            if (!sessionValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: sessionValidation.message
                });
            }
        }

        if (!requestedId || requestedId.trim() === '') {
            return res.status(400).json({
                success: false,
                message: "请提供自定义ID"
            });
        }

        // 验证ID格式
        if (requestedId.length < 3 || requestedId.length > 30) {
            return res.status(400).json({
                success: false,
                message: "ID长度需在3-30个字符之间"
            });
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(requestedId)) {
            return res.status(400).json({
                success: false,
                message: "ID只能包含字母、数字、下划线和连字符"
            });
        }

        const idToken = authHeader.split(' ')[1];
        const userId = req.body.userId || (sessionId && userSessionManager.activeSessions.get(sessionId)?.userId);
        
        // 构造 SaveAppVersionOnAccountCreated1 的请求体
        const saveVersionBody = {
            userId: userId,
            localId: requestedId.trim(),
            appVersion: appVersion || "1.0.0",
            timestamp: new Date().toISOString()
        };

        console.log(`调用游戏API: ${process.env.GAME_API_BASE}/SaveAppVersionOnAccountCreated1`);
        console.log(`请求参数:`, saveVersionBody);

        // 调用游戏API - SaveAppVersionOnAccountCreated1
        const gameApiResponse = await fetch(
            `${process.env.GAME_API_BASE}/SaveAppVersionOnAccountCreated1`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                    'User-Agent': 'okhttp/3.12.13'
                },
                body: JSON.stringify(saveVersionBody)
            }
        );

        const gameApiData = await gameApiResponse.json();

        if (!gameApiResponse.ok) {
            throw new Error(
                gameApiData.error?.message || `游戏API返回错误：${gameApiResponse.status}`
            );
        }

        res.json({
            success: true,
            message: `自定义ID "${requestedId}" 设置成功！应用版本已记录。`,
            finalId: requestedId,
            appVersion: saveVersionBody.appVersion,
            serverResponse: gameApiData
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: `自定义ID失败：${error.message}`
        });
    }
});

// 6. 检查会话状态接口
app.post('/api/check-session', async (req, res) => {
    try {
        const { sessionId } = req.body;

        if (!sessionId) {
            return res.status(400).json({
                success: false,
                message: "请提供会话ID"
            });
        }

        const sessionValidation = userSessionManager.validateSession(sessionId);
        
        res.json({
            success: sessionValidation.valid,
            data: {
                valid: sessionValidation.valid,
                message: sessionValidation.message,
                userInfo: sessionValidation.data
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 7. 退出登录接口
app.post('/api/logout', async (req, res) => {
    try {
        const { sessionId } = req.body;

        if (sessionId) {
            userSessionManager.removeSession(sessionId);
        }

        res.json({
            success: true,
            message: "退出登录成功"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 健康检查接口
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Backend is running',
        activeSessions: userSessionManager.activeSessions.size
    });
});

// 启动服务
app.listen(PORT, () => {
    console.log(`✅ 后端服务已启动，端口：${PORT}`);
    console.log(`🌐 API基础地址：http://localhost:${PORT}/api`);
    console.log(`🎮 游戏API地址：${process.env.GAME_API_BASE}`);
    console.log(`🔑 Firebase API Key 配置: ${process.env.FIREBASE_API_KEY ? '已配置' : '未配置'}`);
    
    if (process.env.FIREBASE_API_KEY) {
        console.log(`   Key格式: ${process.env.FIREBASE_API_KEY.startsWith('AIza') ? '✅ 正确' : '❌ 可能不正确'}`);
        console.log(`   Key长度: ${process.env.FIREBASE_API_KEY.length} 字符`);
    }
});
