# 部署指南

**[English](DEPLOY_EN.md)**

## 环境要求 | Prerequisites

| 依赖 | 最低版本 | 推荐版本 |
|------|---------|---------|
| Node.js | 18.x | 20.x+ |
| npm | 9.x | 10.x+ |
| Git | 2.x | 最新 |
| 磁盘空间 | 500MB（代码+依赖） | 视文件数量而定 |

| 服务 | 说明 |
|------|------|
| AI API | OpenAI 兼容 API（如 [DashScope](https://dashscope.aliyuncs.com/)、OpenAI、DeepSeek 等） |

---

## 快速部署 | Quick Deploy

### 1. 克隆仓库 | Clone Repository

```bash
git clone https://github.com/your-username/filewise.git
cd filewise
```

### 2. 安装依赖 | Install Dependencies

```bash
npm install
```

> **注意**：`better-sqlite3` 是原生模块，需要 Node.js 编译工具链（`python3`、`make`、`g++`）。如果安装失败，请参考下方 [常见问题](#常见问题--troubleshooting)。

### 3. 配置环境变量 | Configure Environment

```bash
cp .env.example .env.local
```

编辑 `.env.local`，填入你的 AI API 配置：

```env
# 必填：AI API 密钥 | Required: AI API Key
DASHSCOPE_API_KEY=your-api-key-here

# 可选：API 基础地址（默认为 DashScope）| Optional: API base URL
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# 可选：对话模型 | Optional: Chat model
DASHSCOPE_MODEL=qwen-plus

# 可选：Embedding 模型 | Optional: Embedding model
DASHSCOPE_EMBEDDING_MODEL=text-embedding-v2
```

> 启动后也可以在 **设置页面** 中动态修改配置，无需重启。

### 4. 启动服务 | Start Server

**开发模式 | Development：**

```bash
npm run dev
```

**生产模式 | Production：**

```bash
npm run build
npm start
```

启动后访问 http://localhost:3099

---

## 配置不同的 AI 服务 | Configuring Different AI Providers

FileWise 兼容所有 OpenAI 格式的 API，切换 Provider 只需修改 `.env.local`：

### DashScope（阿里百炼）

```env
DASHSCOPE_API_KEY=sk-xxxxxxxx
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_MODEL=qwen-plus
DASHSCOPE_EMBEDDING_MODEL=text-embedding-v2
```

### OpenAI

```env
DASHSCOPE_API_KEY=sk-xxxxxxxx
DASHSCOPE_BASE_URL=https://api.openai.com/v1
DASHSCOPE_MODEL=gpt-4o
DASHSCOPE_EMBEDDING_MODEL=text-embedding-3-small
```

### DeepSeek

```env
DASHSCOPE_API_KEY=sk-xxxxxxxx
DASHSCOPE_BASE_URL=https://api.deepseek.com/v1
DASHSCOPE_MODEL=deepseek-chat
DASHSCOPE_EMBEDDING_MODEL=text-embedding-v2
```

> **注意**：Embedding 模型需要与 Provider 匹配。如果 Provider 不提供 Embedding API，可以单独配置 Embedding 使用的 API 地址和密钥（在设置页面中修改）。

---

## 生产部署 | Production Deployment

### 使用 PM2 守护进程 | Using PM2

```bash
# 安装 PM2
npm install -g pm2

# 构建
npm run build

# 启动 | Start
pm2 start npm --name filewise -- start

# 查看日志 | View logs
pm2 logs filewise

# 设置开机自启 | Enable startup
pm2 startup
pm2 save
```

### 使用 Systemd | Using Systemd

创建 `/etc/systemd/system/filewise.service`：

```ini
[Unit]
Description=FileWise
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/filewise
ExecStart=/usr/bin/node node_modules/.bin/next start -p 3099
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable filewise
sudo systemctl start filewise
```

### 使用 Docker | Using Docker

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
RUN npm run build

EXPOSE 3099
ENV NODE_ENV=production

CMD ["npm", "start"]
```

```bash
docker build -t filewise .
docker run -d \
  --name filewise \
  -p 3099:3099 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/notes:/app/notes \
  --env-file .env.local \
  filewise
```

> **重要**：`/app/data` 目录包含 SQLite 数据库和配置，`/app/notes` 目录包含笔记文件。务必挂载为持久卷。

### Nginx 反向代理 | Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name filewise.example.com;

    location / {
        proxy_pass http://127.0.0.1:3099;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;

        # SSE 支持 | SSE support
        proxy_buffering off;
        proxy_read_timeout 86400s;
    }
}
```

---

## 数据管理 | Data Management

### 数据目录结构 | Data Directory Structure

```
data/
├── filewise.db         # SQLite 数据库（文件元数据、知识索引、图谱等）
├── filewise.db-shm     # SQLite 共享内存文件
├── filewise.db-wal     # SQLite WAL 日志
└── settings.json       # 运行时配置（API Key、模型选择等）

notes/                   # 笔记 Markdown 文件（双重存储的文件系统副本）

generated/               # 生成的文档（PPTX、DOCX 等）
```

### 数据备份 | Data Backup

```bash
# 停止服务 | Stop service
pm2 stop filewise  # 或 systemctl stop filewise

# 备份 | Backup
tar -czf filewise-backup-$(date +%Y%m%d).tar.gz data/ notes/

# 重启服务 | Restart service
pm2 start filewise
```

### 数据库迁移 | Database Migration

首次启动时，系统会自动创建数据库表和索引。如果 Schema 变更，启动时会自动执行迁移。

如需手动迁移：

```bash
npx drizzle-kit push
```

---

## 常见问题 | Troubleshooting

### `better-sqlite3` 安装失败 | better-sqlite3 Install Failure

**症状**：`npm install` 报错 `prebuild-install` 或 `node-gyp` 相关错误。

**解决方案**：

```bash
# macOS
xcode-select --install

# Ubuntu/Debian
sudo apt-get install build-essential python3

# CentOS/RHEL
sudo yum groupinstall "Development Tools"
sudo yum install python3
```

然后重新 `npm install`。

### API 调用失败 | API Call Failure

**症状**：Pipeline 处理失败或对话无响应。

**排查步骤**：

```bash
# 1. 检查 API Key 是否正确 | Check API key
# 2. 测试 API 连通性 | Test API connectivity
curl https://dashscope.aliyuncs.com/compatible-mode/v1/models \
  -H "Authorization: Bearer $DASHSCOPE_API_KEY"

# 3. 检查 DNS 解析 | Check DNS
nslookup dashscope.aliyuncs.com
```

### 端口被占用 | Port Already in Use

```bash
# 查找占用进程 | Find process
lsof -i :3099

# 修改端口 | Change port
# 在 package.json 中修改 PORT 环境变量
# 或启动时指定：
PORT=8080 npm start
```

### 大量文件处理缓慢 | Slow Processing with Many Files

- Pipeline 各阶段支持批量并发，默认并发度已在代码中优化
- 如遇到 API 429 限流，系统会自动指数退避重试
- 可在设置页面中调整模型参数（如使用更快的模型）

---

## 架构说明 | Architecture Notes

```
┌─────────────────────────────────────────────────┐
│                  Browser (React)                 │
├─────────────────────────────────────────────────┤
│              Next.js App Router                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │
│  │ Chat │ │Files │ │Graph │ │Notes │ │ Docs │  │
│  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘  │
│     └────────┴────────┴────────┴────────┘       │
│                    API Routes                     │
├─────────────────────────────────────────────────┤
│              AI Agent Core                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐    │
│  │ RAG Chat │ │ Pipeline │ │ Knowledge    │    │
│  │ Engine   │ │ 5-Stage  │ │ Graph Engine │    │
│  └────┬─────┘ └────┬─────┘ └──────┬───────┘    │
│       └────────────┼──────────────┘             │
│              ┌─────┴─────┐                       │
│              │ AI Client │ (OpenAI SDK)          │
│              └─────┬─────┘                       │
├─────────────────────────────────────────────────┤
│              Data Layer                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐    │
│  │ SQLite   │ │ File     │ │ Extraction   │    │
│  │ +Drizzle │ │ System   │ │ Cache        │    │
│  └──────────┘ └──────────┘ └──────────────┘    │
└─────────────────────────────────────────────────┘
```
