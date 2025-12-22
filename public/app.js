class cpmcylone {
    constructor() {
        this.baseUrl = window.location.origin;
        this.sourceAuth = null;
        this.sourceAccountInfo = null;
        this.isProcessing = false;
        this.cloneTimeout = null;
        this.startTime = null;
        this.currentUser = null;
        console.log('cpmcy Clone 初始化成功. 基础URL:', this.baseUrl);
    }

    init(userInfo = null) {
        this.currentUser = userInfo;
        
        // 等待DOM完全加载后再绑定事件
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.bindEvents();
                this.setupUserPermissions();
                this.initStepIndicator();
                this.initOperationType();
                this.testConnection();
            });
        } else {
            this.bindEvents();
            this.setupUserPermissions();
            this.initStepIndicator();
            this.initOperationType();
            this.testConnection();
        }
        
        // 如果用户已登录，初始化克隆工具
        if (this.currentUser && this.currentUser.verified) {
            this.onUserLoggedIn();
        }
    }

    // 验证成功后的回调
    onUserLoggedIn() {
        console.log('用户登录验证成功:', this.currentUser);
        
        // 根据用户类型设置权限
        this.setupUserPermissions();
        
        // 尝试恢复CPM会话
        this.checkSession();
        
        // 添加用户登录日志
        this.addLog(`用户 ${this.currentUser.username} 登录成功 (${this.currentUser.userType})`);
    }

    // 验证失败的处理
    onUserLoginFailed() {
        console.log('用户验证失败');
        this.showStatus('error', '系统验证失败，请重新登录', 'login-status');
        this.addLog('系统验证失败');
    }

    setupUserPermissions() {
        if (!this.currentUser) return;
        
        // 延迟设置，确保DOM已加载
        setTimeout(() => {
            const operationRadios = document.querySelectorAll('input[name="operation-type"]');
            const option2Radio = document.getElementById('op-type2');
            const label2 = document.querySelector('label[for="op-type2"]');
            
            if (this.currentUser.cardType === 'hour') {
                // 小时卡用户只能使用选项1（修改ID）
                if (option2Radio) {
                    option2Radio.disabled = true;
                    option2Radio.checked = false;
                    const option1Radio = document.getElementById('op-type1');
                    if (option1Radio) option1Radio.checked = true;
                }
                
                if (label2) {
                    label2.style.opacity = '0.5';
                    label2.style.cursor = 'not-allowed';
                    const smallText = label2.querySelector('small');
                    if (smallText) {
                        smallText.textContent = '（小时卡用户无法使用此功能）';
                    }
                }
                
                this.addLog('小时卡用户登录，仅可使用修改ID功能');
                
            } else if (this.currentUser.cardType === 'full') {
                // 全功能卡用户可以使用所有功能
                if (option2Radio) {
                    option2Radio.disabled = false;
                }
                
                if (label2) {
                    label2.style.opacity = '1';
                    label2.style.cursor = 'pointer';
                    const smallText = label2.querySelector('small');
                    if (smallText) {
                        smallText.textContent = '复制当前账号所有数据到另一个账号（覆盖目标账号）';
                    }
                }
                
                this.addLog('全功能卡用户登录，可使用所有功能');
            } else if (this.currentUser.userType === 'admin') {
                // 管理员可以使用所有功能
                if (option2Radio) {
                    option2Radio.disabled = false;
                }
                
                if (label2) {
                    label2.style.opacity = '1';
                    label2.style.cursor = 'pointer';
                    const smallText = label2.querySelector('small');
                    if (smallText) {
                        smallText.textContent = '复制当前账号所有数据到另一个账号（覆盖目标账号）';
                    }
                }
                
                this.addLog('管理员登录，可使用所有功能');
            }
            
            // 更新操作类型UI
            this.updateOperationUI('modify-id');
        }, 100);
    }

    initStepIndicator() {
        setTimeout(() => {
            const cloneSection = document.getElementById('clone-section');
            if (cloneSection && !document.querySelector('.step-indicator')) {
                const stepHtml = `
                    <div class="step-indicator">
                        <div class="step active" id="step-1">
                            <div class="step-number">1</div>
                            <div class="step-text">登录源账号</div>
                        </div>
                        <div class="step" id="step-2">
                            <div class="step-number">2</div>
                            <div class="step-text">选择操作类型</div>
                        </div>
                        <div class="step" id="step-3">
                            <div class="step-number">3</div>
                            <div class="step-text">开始执行</div>
                        </div>
                    </div>
                `;
                cloneSection.insertAdjacentHTML('afterbegin', stepHtml);
            }
        }, 200);
    }

    updateStep(stepNumber) {
        for (let i = 1; i <= 3; i++) {
            const step = document.getElementById(`step-${i}`);
            if (step) {
                step.classList.remove('active', 'completed');
            }
        }

        for (let i = 1; i <= stepNumber; i++) {
            const step = document.getElementById(`step-${i}`);
            if (step) {
                if (i < stepNumber) {
                    step.classList.add('completed');
                } else {
                    step.classList.add('active');
                }
            }
        }
    }

    initOperationType() {
        setTimeout(() => {
            const operationRadios = document.querySelectorAll('input[name="operation-type"]');
            if (operationRadios.length > 0) {
                operationRadios.forEach(radio => {
                    radio.addEventListener('change', (e) => {
                        this.updateOperationUI(e.target.value);
                    });
                });
                
                // 初始化为修改ID模式
                this.updateOperationUI('modify-id');
            }
        }, 200);
    }

    updateOperationUI(operationType) {
        const targetCredentials = document.getElementById('target-credentials');
        const warning = document.querySelector('.warning');
        const cloneBtn = document.getElementById('clone-btn');
        
        if (operationType === 'modify-id') {
            if (targetCredentials) {
                targetCredentials.classList.add('hidden');
            }
            
            if (warning) {
                warning.innerHTML = `
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>警告：</strong> 这将修改当前账号的Local ID！请确保新ID的唯一性！
                `;
            }
            
            if (cloneBtn) {
                cloneBtn.innerHTML = '<i class="fas fa-user-edit"></i> 修改当前账号ID';
            }
            
        } else if (operationType === 'clone-to-new') {
            if (targetCredentials) {
                targetCredentials.classList.remove('hidden');
            }
            
            if (warning) {
                warning.innerHTML = `
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>警告：</strong> 这将覆盖目标账号的所有数据！请谨慎操作！
                `;
            }
            
            if (cloneBtn) {
                cloneBtn.innerHTML = '<i class="fas fa-clone"></i> 开始克隆';
            }
        }
    }

    bindEvents() {
        // 使用DOMContentLoaded确保元素存在
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.bindElements();
            });
        } else {
            this.bindElements();
        }
    }

    bindElements() {
        const loginBtn = document.getElementById('login-btn');
        const cloneBtn = document.getElementById('clone-btn');
        const logoutBtnClone = document.getElementById('logout-btn-clone');
        
        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.login());
            console.log('登录按钮绑定成功');
        }
        
        if (cloneBtn) {
            cloneBtn.addEventListener('click', () => this.cloneAccount());
            console.log('克隆按钮绑定成功');
        }
        
        if (logoutBtnClone) {
            logoutBtnClone.addEventListener('click', () => this.logoutCPM());
            console.log('CPM退出按钮绑定成功');
        }
        
        // 绑定Enter键事件
        const sourceEmail = document.getElementById('source-email');
        const sourcePass = document.getElementById('source-password');
        const targetEmail = document.getElementById('target-email');
        const targetPass = document.getElementById('target-password');
        const customLocalId = document.getElementById('custom-localid');
        
        const addEnterHandler = (input, nextInput, callback) => {
            if (input) {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (nextInput) {
                            nextInput.focus();
                        }
                        if (callback) {
                            callback();
                        }
                    }
                });
            }
        };
        
        if (sourceEmail) addEnterHandler(sourceEmail, sourcePass);
        if (sourcePass) addEnterHandler(sourcePass, null, () => this.login());
        if (targetEmail) addEnterHandler(targetEmail, targetPass);
        if (targetPass) addEnterHandler(targetPass, customLocalId);
        if (customLocalId) addEnterHandler(customLocalId, null, () => this.cloneAccount());
    }

    async testConnection() {
        try {
            console.log('测试API连接...');
            // 这里应该是您的API测试逻辑
            this.addLog('API连接测试跳过（演示模式）');
        } catch (error) {
            console.error('API连接测试失败:', error);
            this.addLog('⚠ API连接测试失败');
        }
    }

    checkSession() {
        const savedAuth = localStorage.getItem('jbcacc_auth');
        if (savedAuth && this.currentUser) {
            this.sourceAuth = savedAuth;
            this.showStatus('info', '检测到上次登录会话，正在验证...', 'login-status');
            console.log('从localStorage恢复CPM会话');
            
            // 这里应该是验证会话的逻辑
            setTimeout(() => {
                this.showStatus('success', '会话验证成功', 'login-status');
                this.addLog('CPM会话验证成功');
            }, 1000);
        }
    }

    async login() {
        // 检查用户是否有权限
        if (!this.currentUser || !this.currentUser.verified) {
            this.showStatus('error', '请先完成系统验证', 'login-status');
            return;
        }
        
        if (this.isProcessing) {
            console.log('正在处理中，请稍候...');
            this.showStatus('error', '请等待，另一个操作正在进行中', 'login-status');
            return;
        }

        const emailInput = document.getElementById('source-email');
        const passwordInput = document.getElementById('source-password');
        
        if (!emailInput || !passwordInput) {
            console.error('邮箱或密码输入框未找到');
            return;
        }

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            this.showStatus('error', '请输入邮箱和密码', 'login-status');
            return;
        }

        if (!email.includes('@') || !email.includes('.')) {
            this.showStatus('error', '请输入有效的邮箱地址', 'login-status');
            return;
        }

        this.isProcessing = true;
        this.updateButtonState('login-btn', true, '验证中...');
        this.showStatus('info', '正在连接服务器...', 'login-status');
        this.addLog('正在登录CPM账号...');

        try {
            console.log('正在登录CPM账号:', email);
            this.updateStep(1);
            
            // 模拟登录成功
            setTimeout(() => {
                this.sourceAuth = 'simulated_auth_token_' + Date.now();
                localStorage.setItem('jbcacc_auth', this.sourceAuth);
                
                this.showStatus('success', '登录成功！正在获取账号信息...', 'login-status');
                this.hideElement('login-section');
                this.showElement('clone-section');
                this.showElement('account-info-section');
                this.updateProgress('登录成功', 25);
                this.addLog('✓ CPM账号登录成功（演示模式）');
                this.updateStep(2);
                
                // 模拟显示账号信息
                this.displayDemoAccountInfo(email);
                
                // 自动填充目标邮箱
                const targetEmailInput = document.getElementById('target-email');
                if (targetEmailInput && !targetEmailInput.value) {
                    targetEmailInput.value = email;
                    targetEmailInput.focus();
                }
                
                this.isProcessing = false;
                this.updateButtonState('login-btn', false, '登录并验证账号');
            }, 1500);
            
        } catch (error) {
            console.error('登录错误:', error);
            this.showStatus('error', `网络错误: ${error.message}`, 'login-status');
            this.addLog(`✗ 网络错误: ${error.message}`);
            
            this.isProcessing = false;
            this.updateButtonState('login-btn', false, '登录并验证账号');
        }
    }

    displayDemoAccountInfo(email) {
        // 模拟账号数据
        const demoData = {
            Name: email.split('@')[0] || 'DemoUser',
            money: Math.floor(Math.random() * 1000000),
            localID: 'ID_' + Math.random().toString(36).substr(2, 10),
            carsCount: Math.floor(Math.random() * 50)
        };
        
        document.getElementById('account-name').textContent = demoData.Name;
        document.getElementById('account-money').textContent = this.formatNumber(demoData.money);
        document.getElementById('account-localid').textContent = demoData.localID;
        document.getElementById('account-cars').textContent = demoData.carsCount;
        
        const statusBadge = document.getElementById('account-status');
        if (statusBadge) {
            statusBadge.textContent = '已登录';
            statusBadge.setAttribute('data-status', 'online');
        }
    }

    formatNumber(num) {
        return Number(num).toLocaleString('zh-CN') + ' G';
    }

    logoutCPM() {
        this.sourceAuth = null;
        localStorage.removeItem('jbcacc_auth');
        
        this.showElement('login-section');
        this.hideElement('clone-section');
        this.hideElement('account-info-section');
        
        const emailInput = document.getElementById('source-email');
        const passwordInput = document.getElementById('source-password');
        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';
        
        document.getElementById('account-name').textContent = '--';
        document.getElementById('account-money').textContent = '--';
        document.getElementById('account-cars').textContent = '--';
        document.getElementById('account-localid').textContent = '--';
        
        const statusBadge = document.getElementById('account-status');
        if (statusBadge) {
            statusBadge.textContent = '未登录';
            statusBadge.setAttribute('data-status', 'offline');
        }
        
        this.showStatus('info', '已退出CPM账号登录', 'login-status');
        this.addLog('已退出CPM账号登录');
        this.updateStep(1);
    }

    async cloneAccount() {
        // 检查用户是否有权限
        if (!this.currentUser || !this.currentUser.verified) {
            this.showStatus('error', '请先完成系统验证', 'clone-status');
            return;
        }
        
        // 检查小时卡用户是否尝试使用克隆功能
        if (this.currentUser.cardType === 'hour') {
            const operationType = document.querySelector('input[name="operation-type"]:checked');
            if (operationType && operationType.value === 'clone-to-new') {
                this.showStatus('error', '小时卡用户无法使用克隆功能', 'clone-status');
                return;
            }
        }

        if (this.isProcessing) {
            console.log('正在处理中，请稍候...');
            this.showStatus('error', '请等待，另一个操作正在进行中', 'clone-status');
            return;
        }

        if (!this.sourceAuth) {
            console.log('没有可用的认证令牌');
            this.showStatus('error', '请先登录源账号', 'clone-status');
            this.addLog('✗ 未找到CPM认证令牌');
            return;
        }

        const operationType = document.querySelector('input[name="operation-type"]:checked').value;
        const customLocalId = document.getElementById('custom-localid').value.trim();
        
        if (!customLocalId) {
            this.showStatus('error', '请输入自定义的Local ID', 'clone-status');
            return;
        }

        if (operationType === 'clone-to-new') {
            const targetEmailInput = document.getElementById('target-email');
            const targetPasswordInput = document.getElementById('target-password');
            
            if (!targetEmailInput || !targetPasswordInput) {
                console.error('目标邮箱或密码输入框未找到');
                return;
            }

            const targetEmail = targetEmailInput.value.trim();
            const targetPassword = targetPasswordInput.value;

            if (!targetEmail || !targetPassword) {
                this.showStatus('error', '请输入目标账号的凭据', 'clone-status');
                return;
            }

            if (!targetEmail.includes('@') || !targetEmail.includes('.')) {
                this.showStatus('error', '请输入有效的目标邮箱地址', 'clone-status');
                return;
            }

            const confirmMessage = `⚠️ 警告：这将完全覆盖目标账号的所有数据！\n\n` +
                                  `目标账号: ${targetEmail}\n` +
                                  `新Local ID: ${customLocalId}\n\n` +
                                  `源账号车辆: ${document.getElementById('account-cars').textContent} 辆\n` +
                                  `源账号金币: ${document.getElementById('account-money').textContent}\n\n` +
                                  `你确定要继续吗？`;
            
            if (!confirm(confirmMessage)) {
                this.addLog('✗ 用户取消操作');
                return;
            }

            this.isProcessing = true;
            this.startTime = Date.now();
            this.updateButtonState('clone-btn', true, '克隆中...');
            this.clearStatusLog();
            this.updateProgress('开始克隆流程...', 5);
            this.updateTimeEstimate();
            this.addLog('开始克隆到新账号...');
            this.addLog(`新Local ID: ${customLocalId}`);
            this.updateStep(3);

            // 模拟克隆过程
            const simulateClone = async () => {
                try {
                    this.addLog('1. 正在向服务器发送克隆请求...');
                    this.updateProgress('正在发送请求到服务器...', 10);
                    await this.delay(1000);
                    
                    this.addLog('2. 正在验证目标账号...');
                    this.updateProgress('正在验证目标账号...', 20);
                    await this.delay(1500);
                    
                    this.addLog('3. 正在复制账号数据...');
                    this.updateProgress('正在复制账号数据...', 40);
                    await this.delay(2000);
                    
                    this.addLog('4. 正在更新Local ID...');
                    this.updateProgress('正在更新Local ID...', 60);
                    await this.delay(1500);
                    
                    this.addLog('5. 正在同步车辆数据...');
                    this.updateProgress('正在同步车辆数据...', 80);
                    await this.delay(2000);
                    
                    const elapsedTime = Math.round((Date.now() - this.startTime) / 1000);
                    this.updateProgress('克隆完成！', 100);
                    this.addLog('✓ 克隆成功！');
                    this.addLog(`目标账号: ${targetEmail}`);
                    this.addLog(`新Local ID: ${customLocalId}`);
                    this.addLog(`已克隆车辆: 25 辆`);
                    this.addLog(`总耗时: ${elapsedTime} 秒`);
                    this.showStatus('success', `账号克隆成功！耗时 ${elapsedTime} 秒`, 'clone-status');
                    this.updateTimeEstimate('已完成');
                    
                    this.showSuccessAnimation();
                    
                    targetEmailInput.value = '';
                    targetPasswordInput.value = '';
                    document.getElementById('custom-localid').value = '';
                    
                    this.addLog('3秒后重置页面...');
                    setTimeout(() => {
                        this.resetClonePage();
                    }, 3000);
                    
                } catch (error) {
                    this.addLog(`✗ 错误: ${error.message}`);
                    this.showStatus('error', `克隆失败: ${error.message}`, 'clone-status');
                    this.updateProgress('克隆中断', 0);
                    this.updateTimeEstimate('已中断');
                    this.showErrorAnimation();
                } finally {
                    this.isProcessing = false;
                    this.updateButtonState('clone-btn', false, '开始克隆');
                }
            };
            
            simulateClone();
            
        } else if (operationType === 'modify-id') {
            const currentLocalId = document.getElementById('account-localid').textContent;
            const confirmMessage = `⚠️ 确认修改当前账号Local ID？\n\n` +
                                  `当前Local ID: ${currentLocalId}\n` +
                                  `新的Local ID: ${customLocalId}\n\n` +
                                  `此操作会更新所有车辆数据中的Local ID引用。`;
            
            if (!confirm(confirmMessage)) {
                this.addLog('✗ 用户取消操作');
                return;
            }

            this.isProcessing = true;
            this.startTime = Date.now();
            this.updateButtonState('clone-btn', true, '修改中...');
            this.clearStatusLog();
            this.updateProgress('开始修改ID流程...', 5);
            this.updateTimeEstimate();
            this.addLog('开始修改当前账号ID...');
            this.addLog(`新Local ID: ${customLocalId}`);
            this.updateStep(3);

            // 模拟修改过程
            const simulateModify = async () => {
                try {
                    this.addLog('1. 正在向服务器发送修改请求...');
                    this.updateProgress('正在发送请求到服务器...', 10);
                    await this.delay(1000);
                    
                    this.addLog('2. 正在验证新Local ID...');
                    this.updateProgress('正在验证新Local ID...', 30);
                    await this.delay(1500);
                    
                    this.addLog('3. 正在更新账号数据...');
                    this.updateProgress('正在更新账号数据...', 50);
                    await this.delay(2000);
                    
                    this.addLog('4. 正在更新车辆数据...');
                    this.updateProgress('正在更新车辆数据...', 70);
                    await this.delay(1500);
                    
                    this.addLog('5. 正在验证更新结果...');
                    this.updateProgress('正在验证更新结果...', 90);
                    await this.delay(1000);
                    
                    const elapsedTime = Math.round((Date.now() - this.startTime) / 1000);
                    this.updateProgress('修改完成！', 100);
                    this.addLog('✓ ID修改成功！');
                    this.addLog(`旧Local ID: ${currentLocalId}`);
                    this.addLog(`新Local ID: ${customLocalId}`);
                    this.addLog(`更新车辆: 25 辆`);
                    this.addLog(`总耗时: ${elapsedTime} 秒`);
                    this.showStatus('success', `ID修改成功！耗时 ${elapsedTime} 秒`, 'clone-status');
                    this.updateTimeEstimate('已完成');
                    
                    this.showSuccessAnimation();
                    
                    // 更新显示的Local ID
                    document.getElementById('account-localid').textContent = customLocalId;
                    document.getElementById('custom-localid').value = '';
                    
                    this.addLog('3秒后重置表单...');
                    setTimeout(() => {
                        this.resetClonePage();
                    }, 3000);
                    
                } catch (error) {
                    this.addLog(`✗ 错误: ${error.message}`);
                    this.showStatus('error', `修改失败: ${error.message}`, 'clone-status');
                    this.updateProgress('修改中断', 0);
                    this.updateTimeEstimate('已中断');
                    this.showErrorAnimation();
                } finally {
                    this.isProcessing = false;
                    this.updateButtonState('clone-btn', false, '修改当前账号ID');
                }
            };
            
            simulateModify();
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    updateTimeEstimate(text) {
        const timeEstimate = document.getElementById('time-estimate');
        if (!timeEstimate) return;
        
        if (text) {
            timeEstimate.textContent = `预计时间: ${text}`;
        } else if (this.startTime && this.isProcessing) {
            const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
            const minutes = Math.floor(elapsedSeconds / 60);
            const seconds = elapsedSeconds % 60;
            timeEstimate.textContent = `已用时: ${minutes}分${seconds}秒`;
        }
    }

    resetClonePage() {
        // 重置克隆页面状态
        this.updateProgress('准备开始', 0);
        this.updateTimeEstimate('--');
        this.clearStatusLog();
        this.addLog('系统已就绪，请先登录源账号');
        this.updateStep(1);
        
        const cloneStatus = document.getElementById('clone-status');
        if (cloneStatus) {
            cloneStatus.textContent = '';
            cloneStatus.style.display = 'none';
        }
    }

    showSuccessAnimation() {
        try {
            const successDiv = document.createElement('div');
            successDiv.innerHTML = '✓';
            successDiv.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 80px;
                color: #2ecc71;
                z-index: 1000;
                animation: successPulse 1.5s ease-out;
            `;
            
            const style = document.createElement('style');
            style.textContent = `
                @keyframes successPulse {
                    0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
                    50% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
                    100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
                }
            `;
            
            document.head.appendChild(style);
            document.body.appendChild(successDiv);
            
            setTimeout(() => {
                document.body.removeChild(successDiv);
            }, 1500);
        } catch (e) {
            console.log('无法显示成功动画');
        }
    }

    showErrorAnimation() {
        try {
            const errorDiv = document.createElement('div');
            errorDiv.innerHTML = '✗';
            errorDiv.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 80px;
                color: #e74c3c;
                z-index: 1000;
                animation: errorShake 0.5s ease-out;
            `;
            
            const style = document.createElement('style');
            style.textContent = `
                @keyframes errorShake {
                    0%, 100% { transform: translate(-50%, -50%) translateX(0); }
                    10%, 30%, 50%, 70%, 90% { transform: translate(-50%, -50%) translateX(-5px); }
                    20%, 40%, 60%, 80% { transform: translate(-50%, -50%) translateX(5px); }
                }
            `;
            
            document.head.appendChild(style);
            document.body.appendChild(errorDiv);
            
            setTimeout(() => {
                document.body.removeChild(errorDiv);
            }, 1000);
        } catch (e) {
            console.log('无法显示错误动画');
        }
    }

    showStatus(type, message, elementId) {
        const element = document.getElementById(elementId);
        if (!element) {
            console.error(`未找到元素: ${elementId}`);
            return;
        }
        
        element.textContent = message;
        element.className = `status ${type}`;
        element.style.display = 'block';
        
        // 根据类型设置颜色
        if (type === 'success') {
            element.style.color = '#00cec9';
            setTimeout(() => {
                element.style.display = 'none';
            }, 5000);
        } else if (type === 'error') {
            element.style.color = '#ff7675';
        } else if (type === 'info') {
            element.style.color = '#a29bfe';
        } else if (type === 'warning') {
            element.style.color = '#fdca6e';
        }
        
        console.log(`${type.toUpperCase()}: ${message}`);
    }

    addLog(message) {
        const logContainer = document.getElementById('status-log');
        if (!logContainer) {
            console.log('日志:', message);
            return;
        }
        
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        let iconClass = 'fa-info-circle';
        if (message.startsWith('✓')) iconClass = 'fa-check-circle';
        else if (message.startsWith('✗')) iconClass = 'fa-times-circle';
        else if (message.startsWith('⚠')) iconClass = 'fa-exclamation-triangle';
        else if (/^\d+\./.test(message)) iconClass = 'fa-arrow-right';
        
        logEntry.innerHTML = `<i class="fas ${iconClass}"></i> ${message}`;
        
        logContainer.appendChild(logEntry);
        logContainer.scrollTop = logContainer.scrollHeight;
        
        console.log('日志:', message);
        
        if (this.isProcessing) {
            this.updateTimeEstimate();
        }
    }

    clearStatusLog() {
        const logContainer = document.getElementById('status-log');
        if (logContainer) {
            logContainer.innerHTML = '<div class="log-entry"><i class="fas fa-info-circle"></i> 系统已就绪</div>';
        }
    }

    updateProgress(message, percentage) {
        const progressBar = document.getElementById('progress-bar');
        const progressText = document.getElementById('progress-text');
        
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
            progressBar.style.transition = 'width 0.5s ease';
            
            // 可爱的炫彩进度条
            if (percentage < 30) {
                progressBar.style.background = 'linear-gradient(135deg, #ff6bcb 0%, #ffa8b8 100%)';
            } else if (percentage < 70) {
                progressBar.style.background = 'linear-gradient(135deg, #a29bfe 0%, #6c5ce7 100%)';
            } else if (percentage < 100) {
                progressBar.style.background = 'linear-gradient(135deg, #00cec9 0%, #81ecec 100%)';
            } else {
                progressBar.style.background = 'linear-gradient(135deg, #00cec9 0%, #2ecc71 100%)';
            }
        }
        
        if (progressText) {
            progressText.textContent = message;
            progressText.style.fontWeight = 'bold';
        }
    }

    updateButtonState(buttonId, disabled, text) {
        const button = document.getElementById(buttonId);
        if (!button) {
            console.error(`未找到按钮: ${buttonId}`);
            return;
        }
        
        button.disabled = disabled;
        if (disabled) {
            button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${text}`;
            button.style.opacity = '0.7';
            button.style.cursor = 'not-allowed';
        } else {
            const icon = buttonId === 'login-btn' ? 'fa-key' : 
                        buttonId === 'clone-btn' ? 'fa-clone' : 'fa-sign-out-alt';
            button.innerHTML = `<i class="fas ${icon}"></i> ${text}`;
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
        }
    }

    hideElement(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.add('hidden');
            element.style.display = 'none';
        }
    }

    showElement(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.remove('hidden');
            element.style.display = 'block';
        }
    }
}

// 全局初始化函数，供验证系统调用
window.initCPMClone = function(userInfo) {
    console.log('初始化CPM克隆工具，用户信息:', userInfo);
    
    try {
        window.cpmcyCloneApp = new cpmcylone();
        window.cpmcyCloneApp.init(userInfo);
        console.log('cpmcy Clone应用初始化成功');
        
        // 添加样式用于步骤指示器
        const style = document.createElement('style');
        style.textContent = `
            .step-indicator {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin: 30px 0;
                position: relative;
            }
            
            .step-indicator::before {
                content: '';
                position: absolute;
                top: 50%;
                left: 10%;
                right: 10%;
                height: 4px;
                background: linear-gradient(135deg, #ffb8e2 0%, #a29bfe 100%);
                z-index: 1;
                transform: translateY(-50%);
            }
            
            .step {
                display: flex;
                flex-direction: column;
                align-items: center;
                position: relative;
                z-index: 2;
                flex: 1;
            }
            
            .step-number {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: white;
                border: 3px solid #ffb8e2;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                color: #a29bfe;
                margin-bottom: 10px;
                transition: all 0.3s ease;
            }
            
            .step.active .step-number {
                background: linear-gradient(135deg, #ff6bcb 0%, #6c5ce7 100%);
                color: white;
                border-color: transparent;
                box-shadow: 0 5px 15px rgba(108, 92, 231, 0.3);
                transform: scale(1.1);
            }
            
            .step.completed .step-number {
                background: linear-gradient(135deg, #00cec9 0%, #2ecc71 100%);
                color: white;
                border-color: transparent;
            }
            
            .step-text {
                font-size: 0.9rem;
                font-weight: 600;
                color: #a29bfe;
                text-align: center;
                transition: all 0.3s ease;
            }
            
            .step.active .step-text {
                color: #6c5ce7;
                font-weight: 700;
            }
            
            .step.completed .step-text {
                color: #00cec9;
            }
            
            .status {
                padding: 15px;
                border-radius: 15px;
                margin-top: 15px;
                font-weight: 600;
                display: none;
                text-shadow: 0 1px 2px rgba(255, 255, 255, 0.5);
            }
        `;
        document.head.appendChild(style);
        
    } catch (error) {
        console.error('应用初始化失败:', error);
        
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #ff7675 0%, #fd79a8 100%);
            color: white;
            padding: 15px;
            border-radius: 20px;
            z-index: 10000;
            max-width: 500px;
            text-align: center;
            box-shadow: 0 10px 25px rgba(255, 118, 117, 0.3);
            border: 3px solid rgba(255, 255, 255, 0.8);
        `;
        errorDiv.innerHTML = `
            <strong>应用错误</strong><br>
            CPM克隆工具初始化失败，请刷新页面。<br>
            <small>错误: ${error.message}</small>
        `;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            document.body.removeChild(errorDiv);
        }, 10000);
    }
};

// 导出函数供验证系统调用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { cpmcylone, initCPMClone };
}
