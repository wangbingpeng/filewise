export const CLASSIFICATION_PROMPT = `你是一个文档分类专家。请分析以下文档内容，返回分类结果。

要求：
1. 从以下主分类中选择最合适的：技术文档、财务报告、会议纪要、项目方案、学术论文、产品文档、法律合同、工作总结、培训材料、其他
2. 给出子分类（更具体的类别）
3. 提取 3-5 个关键标签
4. 给出置信度 0-1
5. 简要说明分类理由
6. 生成 1-2 句话的文档摘要

请严格返回以下 JSON 格式（不要加 markdown 代码块）：
{
  "primaryCategory": "主分类",
  "secondaryCategory": "子分类",
  "tags": ["标签1", "标签2", "标签3"],
  "confidence": 0.95,
  "reasoning": "分类理由",
  "summary": "文档摘要"
}

文件名: {fileName}
文件类型: {extension}

文档内容（前2000字）:
{content}`;

export const BATCH_CLASSIFICATION_PROMPT = `你是一个文档分类专家。请分析以下{count}个文档的内容，返回分类结果。

要求：
1. 从以下主分类中选择最合适的：技术文档、财务报告、会议纪要、项目方案、学术论文、产品文档、法律合同、工作总结、培训材料、其他
2. 给出子分类（更具体的类别）
3. 提取 3-5 个关键标签
4. 给出置信度 0-1
5. 简要说明分类理由
6. 生成 1-2 句话的文档摘要

请严格返回以下 JSON 格式（不要加 markdown 代码块）：
[
  {
    "index": 0,
    "primaryCategory": "主分类",
    "secondaryCategory": "子分类",
    "tags": ["标签1", "标签2", "标签3"],
    "confidence": 0.95,
    "reasoning": "分类理由",
    "summary": "文档摘要"
  },
  ...
]

{files}`;

export const ENTITY_EXTRACTION_PROMPT = `你是一个知识图谱构建专家。请从文件名中提取关键实体。

实体类型：
- project: 项目名称（如：智慧城市、电商平台、数据分析等）
- technology: 技术/产品（如：PostgreSQL、Kubernetes、AI、数据库等）
- topic: 主题领域（如：运维、介绍、方案、案例等）
- person: 人物姓名
- organization: 组织/公司名（如：Microsoft、Google等）
- file: 文件本身（必须包含）

提取规则：
1. 文件本身必须作为第一个实体，type 为 file，name 为完整文件名（含扩展名）
2. 从文件名中识别项目、产品、技术名称（英文缩写如 CRM、ERP、BI 等通常是产品名）
3. 识别文档主题（如：介绍、方案、案例、总结等）
4. 识别公司或组织名称
5. 实体名称要标准化：同一产品用统一名称（如 CRM 不要拆分为 C、R、M）

关系构建：
- source 始终是文件名
- target 是提取出的实体
- relationship 描述文件与实体的关系（属于/关于/使用/介绍/案例等）

请严格返回以下 JSON 格式（不要加 markdown 代码块）：
{
  "entities": [
    {"name": "完整文件名.pdf", "type": "file", "description": "PDF文档"},
    {"name": "产品名", "type": "project", "description": "简要说明"},
    {"name": "技术名", "type": "technology", "description": "简要说明"},
    {"name": "主题", "type": "topic", "description": "简要说明"}
  ],
  "relationships": [
    {"source": "完整文件名.pdf", "target": "产品名", "relationship": "属于"},
    {"source": "完整文件名.pdf", "target": "技术名", "relationship": "使用"},
    {"source": "完整文件名.pdf", "target": "主题", "relationship": "关于"}
  ]
}

文件名: {fileName}
文件类型: {extension}`;

export const RAG_SYSTEM_PROMPT = `你是 FileWise 智能文件管理助手。用户已经将文档导入系统并建立了知识库，你的任务是基于检索到的文档内容回答用户的问题。

规则：
1. 基于提供的文档内容回答，不要编造不在文档中的信息
2. 如果检索到的内容无法回答问题，诚实告知
3. 引用来源时使用 [来源: 文件名] 的格式
4. 用中文回复
5. 回答要清晰、有条理`;

export const QUERY_REWRITE_PROMPT = `根据对话历史，将用户的最新问题改写为一个独立的、完整的问题。

对话历史:
{history}

用户最新问题: {question}

请直接返回改写后的问题（不要加任何解释）:`;

export const DOC_GENERATION_PROMPTS: Record<string, string> = {
  report: `基于以下材料，生成一份专业的报告文档。使用 Markdown 格式。

结构要求：
# 报告标题
## 摘要
## 正文各章节
## 结论
## 参考来源

语气: {tone}
{outline}

源材料:
{sources}`,

  summary: `基于以下材料，生成一份精炼的总结文档。使用 Markdown 格式。

结构要求：
# 总结标题
## 核心要点
## 详细说明
## 关键收获

语气: {tone}
{outline}

源材料:
{sources}`,

  presentation: `基于以下材料，生成一份演示文稿内容。使用 Markdown 格式，用 --- 分隔每张幻灯片。

结构要求：
每张幻灯片包含：
# 幻灯片标题
- 要点1
- 要点2
- 要点3

---（分隔符）

语气: {tone}
{outline}

源材料:
{sources}`,

  analysis: `基于以下材料，生成一份分析报告。使用 Markdown 格式。

结构要求：
# 分析标题
## 背景
## 数据分析
## 主要发现
## 建议

语气: {tone}
{outline}

源材料:
{sources}`,
};

export const CHAT_TITLE_PROMPT = `给以下对话起一个5字以内的简短标题，直接返回标题文字：

用户: {message}`;
