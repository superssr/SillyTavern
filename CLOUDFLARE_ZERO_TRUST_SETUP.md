# Cloudflare Zero Trust SSO配置指南

## 前提条件
- 域名已添加到Cloudflare
- 拥有Cloudflare Zero Trust账户 (免费套餐支持最多50个用户)

## 步骤1: 访问Cloudflare Zero Trust
访问: https://one.dash.cloudflare.com/

## 步骤2: 创建Access应用程序
1. 导航到 **Access** → **Applications**
2. 点击 **"Add an application"**
3. 选择 **"Self-hosted"**

## 步骤3: 基本配置
```
Application name: SillyTavern
Session Duration: 24 hours

Application domain:
- Subdomain: st
- Domain: chatmask.io
```

## 步骤4: 配置访问策略
创建策略名称: **SillyTavern Users**

选择认证规则（任选其一）:
- **Email ends with**: @gmail.com (允许所有Gmail用户)
- **Email**: your-email@example.com (仅允许特定邮箱)
- **Everyone** (开放访问，但需要登录)

## 步骤5: 认证方法
选择一个或多个:
- ✅ One-time PIN (邮箱验证码)
- ✅ Google
- ✅ GitHub
- ✅ Microsoft

## 步骤6: 高级设置
在 **Additional settings** 中:

### CORS设置:
```
✅ Allow all origins
✅ Allow all methods  
✅ Allow all headers
```

### Cookie设置:
```
✅ Enable automatic cloudflared authentication
✅ Same site cookie attribute: None
```

## 步骤7: 创建应用

点击 **"Add application"** 完成创建。

## 步骤8: 获取访问URL

创建完成后，您可以通过以下URL访问:
```
https://st.chatmask.io
```

## 工作原理

1. 用户访问 `https://st.chatmask.io`
2. Cloudflare Zero Trust拦截请求并要求认证
3. 用户通过选定的方法认证（Google、邮箱验证码等）
4. 认证成功后，Cloudflare添加以下HTTP头:
   - `CF-Access-Authenticated-User-Email`: 用户邮箱
   - `CF-Access-JWT-Assertion`: JWT令牌
5. SillyTavern读取这些头并自动创建/登录对应用户

## SillyTavern配置

SillyTavern已配置为自动识别Cloudflare Zero Trust的认证头。

确保以下环境变量已设置:
```bash
AUTHELIA_AUTH=true
ENABLE_USER_ACCOUNTS=true
```

## 用户管理

### 自动用户创建
当用户通过Cloudflare Zero Trust认证后，SillyTavern会:
1. 从邮箱地址提取用户名（@符号前的部分）
2. 自动创建对应的用户账户
3. 自动登录该用户

### 示例
- 邮箱: `john.doe@gmail.com`
- SillyTavern用户名: `john.doe`

## 故障排除

### 问题: 认证后仍显示基础认证提示
**解决**: 检查环境变量 `BASIC_AUTH_MODE=true` 是否设置正确

### 问题: 用户无法自动登录
**解决**: 
1. 确认 `AUTHELIA_AUTH=true` 已设置
2. 确认 `ENABLE_USER_ACCOUNTS=true` 已设置
3. 检查Cloudflare是否正确传递认证头

### 问题: CORS错误
**解决**: 在Cloudflare应用设置中启用所有CORS选项

## 安全建议

1. **限制访问**: 使用邮箱域名限制而非开放访问
2. **启用2FA**: 在Cloudflare中要求两因素认证
3. **会话超时**: 设置合理的会话持续时间（建议24小时）
4. **定期审计**: 定期检查访问日志和用户列表

## 支持

如有问题，请查看:
- Cloudflare Zero Trust文档: https://developers.cloudflare.com/cloudflare-one/
- SillyTavern GitHub: https://github.com/SillyTavern/SillyTavern