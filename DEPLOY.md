# Deployment Guide

**[中文版](DEPLOY.md)**

## Prerequisites

| Dependency | Minimum | Recommended |
|------------|---------|-------------|
| Node.js | 18.x | 20.x+ |
| npm | 9.x | 10.x+ |
| Git | 2.x | Latest |
| Disk Space | 500MB (code + deps) | Depends on file count |

| Service | Description |
|---------|-------------|
| AI API | Any OpenAI-compatible API (e.g., [DashScope](https://dashscope.aliyuncs.com/), OpenAI, DeepSeek) |

---

## Quick Deploy

### 1. Clone Repository

```bash
git clone https://github.com/your-username/filewise.git
cd filewise
```

### 2. Install Dependencies

```bash
npm install
```

> **Note**: `better-sqlite3` is a native module that requires the Node.js build toolchain (`python3`, `make`, `g++`). If installation fails, see [Troubleshooting](#troubleshooting) below.

### 3. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your AI API settings:

```env
# Required: AI API Key
DASHSCOPE_API_KEY=your-api-key-here

# Optional: API base URL (defaults to DashScope)
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# Optional: Chat model
DASHSCOPE_MODEL=qwen-plus

# Optional: Embedding model
DASHSCOPE_EMBEDDING_MODEL=text-embedding-v2
```

> You can also change these settings dynamically in the **Settings page** after starting the app — no restart needed.

### 4. Start Server

**Development:**

```bash
npm run dev
```

**Production:**

```bash
npm run build
npm start
```

Then open http://localhost:3099

---

## Configuring Different AI Providers

FileWise is compatible with any OpenAI-format API. Switching providers only requires editing `.env.local`:

### DashScope (Alibaba Cloud)

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

> **Note**: The embedding model must match the provider. If your provider doesn't offer an embedding API, you can configure a separate embedding API endpoint and key in the Settings page.

---

## Production Deployment

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Build
npm run build

# Start
pm2 start npm --name filewise -- start

# View logs
pm2 logs filewise

# Enable auto-start on boot
pm2 startup
pm2 save
```

### Using Systemd

Create `/etc/systemd/system/filewise.service`:

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

### Using Docker

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

> **Important**: The `/app/data` directory contains the SQLite database and configuration, and `/app/notes` contains note files. Always mount these as persistent volumes.

### Nginx Reverse Proxy

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

        # SSE support
        proxy_buffering off;
        proxy_read_timeout 86400s;
    }
}
```

---

## Data Management

### Data Directory Structure

```
data/
├── filewise.db         # SQLite database (file metadata, knowledge index, graph, etc.)
├── filewise.db-shm     # SQLite shared memory file
├── filewise.db-wal     # SQLite WAL log
└── settings.json       # Runtime config (API key, model selection, etc.)

notes/                   # Note Markdown files (file system copy of dual storage)

generated/               # Generated documents (PPTX, DOCX, etc.)
```

### Data Backup

```bash
# Stop service
pm2 stop filewise  # or: systemctl stop filewise

# Backup
tar -czf filewise-backup-$(date +%Y%m%d).tar.gz data/ notes/

# Restart service
pm2 start filewise
```

### Database Migration

On first startup, the system automatically creates database tables and indexes. If the schema changes, migrations run automatically on startup.

To run migrations manually:

```bash
npx drizzle-kit push
```

---

## Troubleshooting

### `better-sqlite3` Install Failure

**Symptom**: `npm install` errors related to `prebuild-install` or `node-gyp`.

**Solution**:

```bash
# macOS
xcode-select --install

# Ubuntu/Debian
sudo apt-get install build-essential python3

# CentOS/RHEL
sudo yum groupinstall "Development Tools"
sudo yum install python3
```

Then run `npm install` again.

### API Call Failure

**Symptom**: Pipeline processing fails or chat returns no response.

**Debug Steps**:

```bash
# 1. Verify your API key is correct
# 2. Test API connectivity
curl https://dashscope.aliyuncs.com/compatible-mode/v1/models \
  -H "Authorization: Bearer $DASHSCOPE_API_KEY"

# 3. Check DNS resolution
nslookup dashscope.aliyuncs.com
```

### Port Already in Use

```bash
# Find the process using the port
lsof -i :3099

# Change the port
# Edit the PORT environment variable in package.json
# Or specify at startup:
PORT=8080 npm start
```

### Slow Processing with Many Files

- Pipeline stages support batch concurrency — default concurrency is already optimized in code
- If you encounter API 429 rate limiting, the system automatically retries with exponential backoff
- You can switch to a faster model in the Settings page

---

## Architecture Notes

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
