# FileWise

An AI Agent-powered local file intelligence — autonomous perception, understanding, and reasoning that transforms your file system into a conversational knowledge network.

**[中文文档](README.md)** | [Deployment Guide](DEPLOY_EN.md) / [中文版](DEPLOY.md)

## What is FileWise?

FileWise is not just another file manager — it's an **AI-driven File Intelligence Agent**. It takes your local file system as its perception domain, runs a multi-stage autonomous reasoning pipeline to transform raw files into structured knowledge, and exposes Agent capabilities including RAG chat, knowledge graph, and intelligent document generation.

Core design philosophy:

```
Raw Files → Perceive(Scan) → Understand(Extract) → Reason(Classify) → Memorize(Index) → Associate(Graph) → Act(Chat/Generate)
```

## AI Agent Core Architecture

### 1. Autonomous Reasoning Pipeline

A 5-stage autonomous processing pipeline that analyzes thousands of files without human intervention:

| Stage | Agent Capability | Implementation |
|-------|-----------------|----------------|
| **Scan** | File system perception | Incremental scanning + content hash deduplication — only processes changed files |
| **Extract** | Multimodal content understanding | Text extraction → Multimodal Vision AI fallback (render PDF/PPTX pages as images, then extract via vision model) |
| **Classify** | Hybrid reasoning classification | Rule engine first (keyword scoring + filename matching + extension inference), AI classification as fallback — drastically reduces API costs |
| **Index** | Semantic memory construction | Text chunking → Batch Embedding (concurrency 25 + 429 exponential backoff retry) → Vector storage + FTS5 full-text index dual-engine |
| **Graph** | Knowledge association discovery | Rule-based entity extraction first + AI entity supplementation — automatically builds entity-relationship graph |

**Key Design Decisions**:
- **Rule + AI Hybrid Reasoning**: Both classification and graph building use a "rules first, AI fallback" strategy — 70%+ of files are classified with zero API calls
- **Batch Concurrency**: `Promise.allSettled` + configurable concurrency + intelligent error classification (retryable vs non-retryable)
- **Distributed Lock**: Database-level pipeline lock manager ensures single-instance task mutual exclusion, with automatic stale lock release
- **Extraction Cache**: Content hash-based deduplication — identical files are never processed twice

### 2. RAG Chat Engine (Retrieval-Augmented Generation)

A retrieval-augmented generation chat system with multi-turn contextual reasoning:

```
User Query → Query Rewrite → Vector Retrieval (Top-K) → Context Injection → Streaming Generation (SSE) → Source Attribution
```

- **Query Rewriting**: Automatically rewrites ambiguous follow-up questions into standalone queries using conversation history, improving retrieval recall
- **Dual-Engine Retrieval**: Vector semantic similarity + FTS5 keyword full-text search — covers both semantic and exact matching
- **Source Attribution**: Every response includes cited sources (filename + snippet + similarity score) — traceable and verifiable
- **Streaming Output**: SSE (Server-Sent Events) real-time streaming — sends retrieval sources first, then streams token-by-token response

### 3. Multimodal Understanding

When traditional text extraction fails, automatically falls back to visual understanding:

```
PDF/PPTX → Render pages as images → Vision LLM page-by-page recognition → Structured text output
```

- Automatic slicing for large files: >10MB files only process key pages, balancing quality and cost
- Timeout protection: 30s auto-interrupt to prevent pipeline stalls
- Size limit: files >500MB are automatically skipped

### 4. Knowledge Graph Engine

Automatically constructs entity-relationship networks from unstructured files:

- **Hybrid Extraction**: Rule engine quickly extracts technology/organization/industry/topic entities from filenames; AI supplements when extraction is insufficient
- **Entity Type System**: 6 entity types — project / technology / organization / industry / topic / file
- **Relationship Inference**: Automatically infers inter-entity relationships (belongs_to / uses / about / introduces, etc.)
- **Visual Exploration**: Force-directed graph + expand-on-click, explore association networks from any node

### 5. Agent Skill System

Extensible Markdown skill templates that give the Agent domain-specific expertise:

- Skills defined as Markdown files with role, instructions, and output format
- Built-in business skills for weekly/daily report generation, with custom skill support
- Report generation supports PPTX / DOCX / Markdown multi-format output

### 6. Token Governance

The AI Agent's cost control layer:

- Track prompt/completion/total tokens by model × date dimensions
- Real-time request count and usage statistics
- Frontend cost trend visualization

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router) + React 19 |
| **AI Reasoning** | OpenAI SDK (compatible with DashScope / Qwen / any OpenAI-compatible API) |
| **Vector Engine** | Custom cosine similarity + Float32 serialized storage (SQLite BLOB) |
| **Full-Text Search** | SQLite FTS5 (Unicode61 tokenizer) |
| **Database** | SQLite + Drizzle ORM |
| **File Parsing** | PDF / DOCX / PPTX / XLSX / CSV / Markdown / Plain text |
| **UI** | Tailwind CSS 4 + shadcn/ui |
| **State Management** | Zustand + SWR |

## Getting Started

### Prerequisites

- Node.js 18+
- An OpenAI-compatible API key (e.g., [DashScope](https://dashscope.aliyuncs.com/))

### Installation

```bash
git clone https://github.com/your-username/filewise.git
cd filewise
npm install
cp .env.example .env.local
# Edit .env.local and fill in your API key
```

### Configuration

Edit `.env.local` with your AI API settings:

```env
DASHSCOPE_API_KEY=your-api-key-here
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_MODEL=qwen-plus
DASHSCOPE_EMBEDDING_MODEL=text-embedding-v2
```

You can also configure these settings in the Settings page after starting the app, with hot model switching support.

### Run

```bash
npm run dev    # Development → http://localhost:3099
npm run build && npm start  # Production
```

## How It Works

```
1. Add folder → Agent perceives file system changes
2. Pipeline runs autonomously → Extract → Hybrid Classify → Vector Index → Graph Build
3. Chat/Search → RAG Retrieval → Context-Augmented Generation → Source Attribution
4. Generate Documents → Skill-driven → Multi-format Output
```

## Project Structure

```
src/
├── app/
│   ├── (dashboard)/          # Pages: files, knowledge, graph, chat, notes, documents, settings
│   └── api/                  # API routes (chat, search, pipeline, notes, skills, etc.)
├── components/               # UI components (chat, files, graph, knowledge, notes, layout, ui)
├── lib/
│   ├── ai/                   # AI core: client, embeddings, prompt engineering, token governance
│   ├── db/                   # Data layer: schema, migrations, initialization
│   ├── doc-renderers/        # Document rendering: DOCX / PPTX generation
│   ├── notes/                # Notes system: file sync, dual storage
│   ├── pipeline/             # Agent reasoning engine: batch processor, extractors, entity extraction, rule classifier, lock manager
│   └── search/               # Search engine: semantic + FTS5 full-text search
├── stores/                   # State management (Zustand)
└── types/                    # TypeScript type definitions
```

## License

[Apache 2.0](LICENSE)
