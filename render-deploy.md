# Render.com 部署指南

## 🚀 快速部署步骤

### 1. 推送代码到 GitHub
```bash
git add .
git commit -m "Add Render deployment configuration"
git push origin main
```

### 2. 在 Render.com 创建服务

1. 访问 [Render.com](https://render.com) 并注册/登录
2. 点击 **New +** → **Web Service**
3. 连接你的 GitHub 账号
4. 选择 `superssr/SillyTavern` 仓库
5. 填写以下信息：
   - **Name**: `sillytavern-你的名字`（或其他唯一名称）
   - **Region**: 选择离你最近的区域
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm ci --production=false`
   - **Start Command**: `npm start`
   - **Instance Type**: **Free**

### 3. 配置环境变量

在 Render 控制台的 Environment 标签页，添加以下变量：

必需变量：
- `LISTEN` = `true`
- `PORT` = `10000`
- `WHITELIST` = `false`

安全认证（强烈推荐）：
- `BASIC_AUTH` = `true`
- `BASIC_AUTH_USER` = `你的用户名`
- `BASIC_AUTH_PASSWORD` = `你的密码`

API 密钥（根据需要）：
- `OPENAI_API_KEY` = `你的 OpenAI API 密钥`
- `CLAUDE_API_KEY` = `你的 Claude API 密钥`

### 4. 部署

点击 **Create Web Service**，等待部署完成（约 5-10 分钟）

## 📝 注意事项

### 免费套餐限制
- ⏰ **自动休眠**：15 分钟无活动后休眠，唤醒需 30-50 秒
- ⏱️ **月度限制**：750 小时运行时间
- 💾 **无持久存储**：重新部署会丢失数据
- 🧠 **内存限制**：512MB RAM

### 数据备份建议

由于免费套餐无持久存储，建议定期备份：

1. **导出角色卡片**：下载 `/public/characters/` 目录
2. **导出聊天记录**：下载 `/public/chats/` 目录
3. **导出设置**：下载 `/public/settings/` 目录

### 保持服务活跃

为避免频繁休眠，可以：

1. **使用 GitHub Actions**（已配置）
   - 编辑 `.github/workflows/keep-alive.yml`
   - 将 URL 改为你的服务地址

2. **使用 UptimeRobot**
   - 注册 [UptimeRobot](https://uptimerobot.com)
   - 添加 HTTP(s) 监控
   - 设置 5 分钟检查间隔

## 🔧 故障排除

### 问题：服务启动失败
- 检查 Node 版本是否 >= 18
- 查看 Render 日志了解错误详情

### 问题：无法访问
- 确认环境变量配置正确
- 检查是否启用了基础认证
- 等待服务完全启动（可能需要 1-2 分钟）

### 问题：数据丢失
- 这是免费套餐的限制
- 建议定期手动备份重要数据
- 考虑升级到付费套餐获得持久存储

## 📚 相关链接

- [SillyTavern 官方文档](https://docs.sillytavern.app/)
- [Render 文档](https://render.com/docs)
- [问题反馈](https://github.com/SillyTavern/SillyTavern/issues)

## 🎉 部署成功后

访问：`https://你的服务名.onrender.com`

如果配置了基础认证，使用你设置的用户名和密码登录。

享受你的 SillyTavern！