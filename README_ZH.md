# FileWise

基于 AI Agent 架构的本地文件智能体 — 自主感知、理解、推理，让文件系统成为可对话的知识网络。

**[English](README_EN.md)** | [部署指南](DEPLOY.md) / [Deployment](DEPLOY_EN.md)

## 项目定位

FileWise 不是一个简单的文件管理工具，而是一个 **AI 驱动的文件智能体（File Intelligence Agent）**。它以本地文件系统为感知域，通过多阶段自主推理流水线，完成从原始文件到结构化知识的全链路转化，并对外提供 RAG 对话、知识图谱、智能文档生成等 Agent 能力。

核心设计理念：

```
原始文件 → 感知(Scan) → 理解(Extract) → 推理(Classify) → 记忆(Index) → 关联(Graph) → 行动(Chat/Generate)
```

## AI Agent 核心架构

### 1. 自主推理流水线（Autonomous Reasoning Pipeline）

5 阶段自主处理流水线，无需人工干预即可完成数千文件的批量智能分析：

| 阶段 | Agent 能力 | 技术实现 |
|------|-----------|---------|
| **Scan** | 文件系统感知 | 增量扫描 + 内容哈希去重，只处理变化的文件 |
| **Extract** | 多模态内容理解 | 文本提取 → 多模态 Vision AI 降级策略（PDF/PPTX 渲染为图片后由视觉模型提取） |
| **Classify** | 混合推理分类 | 规则引擎优先（关键词评分 + 文件名匹配 + 扩展名推理），AI 分类兜底，大幅降低 API 成本 |
| **Index** | 语义记忆构建 | 文本分块 → 批量 Embedding（并发 25 + 429 指数退避重试）→ 向量存储 + FTS5 全文索引双引擎 |
| **Graph** | 知识关联发现 | 规则实体提取优先 + AI 实体补充，自动构建实体-关系图谱 |

**关键设计**：
- **规则 + AI 混合推理**：分类和图谱构建均采用「规则优先、AI 兜底」策略，70%+ 的文件通过零 API 调用完成分类
- **批量并发处理**：`Promise.allSettled` + 可配置并发度 + 智能错误分类（可重试 vs 不可重试）
- **分布式锁**：数据库级 Pipeline 锁管理器，确保单实例任务互斥，支持超时自动释放
- **提取缓存**：基于内容哈希的提取缓存，相同文件不重复处理

### 2. RAG 对话引擎（Retrieval-Augmented Generation）

基于检索增强生成的对话系统，支持多轮上下文推理：

```
用户提问 → 查询改写(Query Rewrite) → 向量检索(Top-K) → 上下文注入 → 流式生成(SSE) → 来源溯源
```

- **查询改写**：基于对话历史自动将模糊提问补全为独立查询，提升检索召回率
- **双引擎检索**：向量语义相似度 + FTS5 关键词全文搜索，覆盖语义匹配和精确匹配
- **来源溯源**：每个回答附带引用来源（文件名 + 片段 + 相似度分数），可追溯、可验证
- **流式输出**：SSE (Server-Sent Events) 实时流式响应，先推送检索来源，再逐 token 输出回答

### 3. 多模态理解（Multimodal Understanding）

当传统文本提取失败时，自动降级到视觉理解模式：

```
PDF/PPTX → 页面渲染为图片 → Vision LLM 逐页识别 → 结构化文本输出
```

- 大文件自动切片：>10MB 文件只处理关键页，平衡效果与成本
- 超时保护：30s 超时自动中断，避免单文件阻塞流水线
- 文件大小限制：500MB 以上自动跳过

### 4. 知识图谱引擎（Knowledge Graph Engine）

从非结构化文件中自动构建实体关系网络：

- **混合提取策略**：规则引擎从文件名快速提取技术/组织/行业/主题实体，提取不充分时 AI 补充
- **实体类型体系**：project / technology / organization / industry / topic / file 六类实体
- **关系推理**：自动推断实体间关系（属于/使用/关于/介绍等）
- **可视化探索**：力导向图谱 + 逐层展开，支持从任意节点探索关联网络

### 5. Skill 技能系统（Agent Skill System）

可扩展的 Markdown 技能模板，让 Agent 具备领域专业能力：

- 技能以 Markdown 文件定义，包含角色、指令、输出格式
- 内置周报/日报生成等业务技能，支持自定义扩展
- 报告生成支持 PPTX / DOCX / Markdown 多格式输出

### 6. Token 用量治理（Token Governance）

AI Agent 的成本控制层：

- 按 model × date 维度追踪 prompt/completion/total tokens
- 实时统计调用量和请求次数
- 前端可视化展示成本趋势

## 技术栈

| 层级 | 技术 |
|------|------|
| **框架** | Next.js 16 (App Router) + React 19 |
| **AI 推理** | OpenAI SDK (兼容 DashScope / Qwen / 任意 OpenAI 兼容 API) |
| **向量引擎** | 自实现余弦相似度 + Float32 序列化存储 (SQLite BLOB) |
| **全文检索** | SQLite FTS5 (Unicode61 分词) |
| **数据库** | SQLite + Drizzle ORM |
| **文件解析** | PDF / DOCX / PPTX / XLSX / CSV / Markdown / 纯文本 |
| **UI** | Tailwind CSS 4 + shadcn/ui |
| **状态管理** | Zustand + SWR |

## 快速开始

### 环境要求

- Node.js 18+
- 一个 OpenAI 兼容的 API Key（如 [DashScope](https://dashscope.aliyuncs.com/)）

### 安装

```bash
git clone https://github.com/your-username/filewise.git
cd filewise
npm install
cp .env.example .env.local
# 编辑 .env.local，填入你的 API Key
```

### 配置

编辑 `.env.local`，填入 AI API 配置：

```env
DASHSCOPE_API_KEY=your-api-key-here
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_MODEL=qwen-plus
DASHSCOPE_EMBEDDING_MODEL=text-embedding-v2
```

启动应用后也可以在设置页面中动态配置，支持热切换模型。

### 运行

```bash
npm run dev    # 开发模式 → http://localhost:3099
npm run build && npm start  # 生产模式
```

## 工作流程

```
1. 添加文件夹 → Agent 感知文件系统变化
2. Pipeline 自主运行 → 提取内容 → 混合分类 → 向量索引 → 图谱构建
3. 对话/搜索 → RAG 检索 → 上下文增强生成 → 来源溯源
4. 生成文档 → Skill 技能驱动 → 多格式输出
```

## 项目结构

```
src/
├── app/
│   ├── (dashboard)/          # 页面：文件、知识库、图谱、对话、笔记、文档生成、设置
│   └── api/                  # API 路由（对话、搜索、Pipeline、笔记、Skill 等）
├── components/               # UI 组件（对话、文件、图谱、知识库、笔记、布局、UI 基础组件）
├── lib/
│   ├── ai/                   # AI 核心层：客户端、Embedding、提示词工程、Token 治理
│   ├── db/                   # 数据层：Schema、迁移、初始化
│   ├── doc-renderers/        # 文档渲染：DOCX / PPTX 生成
│   ├── notes/                # 笔记系统：文件同步、双重存储
│   ├── pipeline/             # Agent 推理引擎：批量处理器、提取器、实体抽取、规则分类器、锁管理
│   └── search/               # 检索引擎：语义搜索 + FTS5 全文搜索
├── stores/                   # 状态管理（Zustand）
└── types/                    # TypeScript 类型定义
```

## 开源协议

[Apache 2.0](LICENSE)
