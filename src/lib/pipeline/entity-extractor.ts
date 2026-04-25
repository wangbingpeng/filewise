/**
 * 实体提取规则库
 * 用于从文件名中快速提取实体，避免不必要的AI调用
 */

export interface Entity {
  name: string;
  type: 'technology' | 'organization' | 'industry' | 'topic' | 'project' | 'file';
  description?: string;
}

export interface Relationship {
  source: string;
  target: string;
  relationship: string;
}

export interface ExtractionResult {
  entities: Entity[];
  relationships: Relationship[];
}

// 技术/产品关键词
const TECH_KEYWORDS: Record<string, string> = {
  // 数据库产品
  'polardb': 'PolarDB',
  'mongodb': 'MongoDB',
  'redis': 'Redis',
  'clickhouse': 'ClickHouse',
  'analyticdb': 'AnalyticDB',
  'rds': 'RDS',
  'mysql': 'MySQL',
  'dynamodb': 'DynamoDB',
  'postgres': 'PostgreSQL',
  'elasticsearch': 'Elasticsearch',
  'opensearch': 'OpenSearch',

  // 云服务产品
  'oss': 'OSS',
  'ecs': 'ECS',
  'slb': 'SLB',
  'vpc': 'VPC',
  's3': 'S3',
  'ec2': 'EC2',

  // AI/大模型相关
  '大模型': '大模型',
  'gpt': 'GPT',
  'chatgpt': 'ChatGPT',
  'transformer': 'Transformer',
  'pytorch': 'PyTorch',
  'tensorflow': 'TensorFlow',

  // 技术概念
  'olap': 'OLAP',
  'oltp': 'OLTP',
  '容灾多活': '容灾多活',
  '云原生': '云原生',
  '数据仓库': '数据仓库',
  '微服务': '微服务',
  'devops': 'DevOps',
  'k8s': 'Kubernetes',
  'docker': 'Docker',
  'kafka': 'Kafka',
  'spark': 'Spark',
  'lua': 'Lua',
  'ocr': 'OCR',
};

// 组织/公司关键词
const ORG_KEYWORDS: Record<string, string> = {
  'microsoft': 'Microsoft',
  'google': 'Google',
  'amazon': 'Amazon',
  'apple': 'Apple',
  'meta': 'Meta',
  'nvidia': 'NVIDIA',
  'openai': 'OpenAI',
};

// 行业关键词
const INDUSTRY_KEYWORDS: Record<string, string> = {
  '游戏': '游戏行业',
  'gaming': '游戏行业',
  '互联网': '互联网行业',
  '金融': '金融行业',
  '医疗': '医疗行业',
  '教育': '教育行业',
  '电商': '电商行业',
  '零售': '零售行业',
};

// 文档主题关键词
const TOPIC_KEYWORDS: Record<string, string> = {
  '解决方案': '解决方案',
  'solution': '解决方案',
  '最佳实践': '最佳实践',
  'best practice': '最佳实践',
  '产品介绍': '产品介绍',
  '技术分享': '技术分享',
  '汇报': '汇报',
  '总结': '总结报告',
  '报告': '总结报告',
  '白皮书': '白皮书',
  '授权书': '授权书',
  '压测': '压测报告',
  '对比': '对比分析',
  '面试': '面试题库',
  '案例': '案例',
  'case': '案例',
  '介绍': '产品介绍',
  '优势': '产品优势',
  '应用': '应用场景',
  '场景': '应用场景',
  '稳定性': '稳定性',
  '可用性': '可用性',
  '容灾': '容灾方案',
  '多活': '多活方案',
};

// 项目/会议关键词
const PROJECT_KEYWORDS: Record<string, string> = {
  '峰会': '峰会',
  '大会': '大会',
  '会议': '会议',
  'review': '技术评审',
};

/**
 * 从文件名中提取实体
 * @param fileName 文件名
 * @returns 提取结果
 */
export function extractEntitiesFromFileName(fileName: string): ExtractionResult {
  const entities: Entity[] = [];
  const relationships: Relationship[] = [];
  const name = fileName.toLowerCase();
  
  // 1. 文件实体（必须）
  const fileEntity: Entity = {
    name: fileName,
    type: 'file',
  };
  entities.push(fileEntity);
  
  // 2. 技术/产品实体
  for (const [keyword, entityName] of Object.entries(TECH_KEYWORDS)) {
    if (name.includes(keyword)) {
      // 避免重复添加
      if (!entities.some(e => e.name === entityName)) {
        entities.push({
          name: entityName,
          type: 'technology',
        });
      }
    }
  }
  
  // 3. 组织/公司实体
  for (const [keyword, entityName] of Object.entries(ORG_KEYWORDS)) {
    if (name.includes(keyword)) {
      if (!entities.some(e => e.name === entityName)) {
        entities.push({
          name: entityName,
          type: 'organization',
        });
      }
    }
  }
  
  // 4. 行业实体
  for (const [keyword, entityName] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (name.includes(keyword)) {
      if (!entities.some(e => e.name === entityName)) {
        entities.push({
          name: entityName,
          type: 'industry',
        });
      }
    }
  }
  
  // 5. 文档主题实体
  for (const [keyword, entityName] of Object.entries(TOPIC_KEYWORDS)) {
    if (name.includes(keyword)) {
      if (!entities.some(e => e.name === entityName)) {
        entities.push({
          name: entityName,
          type: 'topic',
        });
      }
    }
  }
  
  // 6. 项目实体
  for (const [keyword, entityName] of Object.entries(PROJECT_KEYWORDS)) {
    if (name.includes(keyword)) {
      if (!entities.some(e => e.name === entityName)) {
        entities.push({
          name: entityName,
          type: 'project',
        });
      }
    }
  }
  
  // 7. 构建关系
  const nonFileEntities = entities.filter(e => e.type !== 'file');
  for (const entity of nonFileEntities) {
    relationships.push({
      source: fileName,
      target: entity.name,
      relationship: '关于',
    });
  }
  
  return { entities, relationships };
}

/**
 * 判断规则提取是否充分
 * @param result 提取结果
 * @returns 是否充分（至少3个实体）
 */
export function isExtractionSufficient(result: ExtractionResult): boolean {
  return result.entities.length >= 3;
}
