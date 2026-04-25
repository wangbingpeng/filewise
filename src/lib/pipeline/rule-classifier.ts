/**
 * 规则分类器 - 基于关键词快速分类文档
 * 用于在AI分类之前进行初步分类，减少AI调用次数
 */

export interface Classification {
  primaryCategory: string;
  secondaryCategory: string;
  tags: string[];
  confidence: number;
  reasoning: string;
  summary?: string;
}

// 分类规则库
const CATEGORY_RULES: Record<string, { keywords: string[]; secondary: string[] }> = {
  '技术文档': {
    keywords: [
      // 原有关键词
      '技术方案', '架构设计', 'API文档', '接口说明', '技术架构',
      '数据库', '性能优化', '最佳实践', '部署', '配置',
      '数据库选型', '容灾', '多活', '云原生', '微服务',
      // 新增：技术相关
      '技术白皮书', '技术手册', '技术规范', '技术标准',
      '系统架构', '软件架构', '架构方案', '技术实现',
      '开发指南', '开发者文档', 'SDK文档', 'API参考',
      '接口文档', '接口定义', 'RESTful', 'GraphQL',
      '安装指南', '升级指南', '迁移指南', '操作手册',
      '运维', '运维手册', '监控', '日志',
      '测试', '测试用例', '测试报告', '单元测试',
      '代码', '源码', '示例代码', '代码示例',
      '原理', '原理分析', '技术原理', '实现原理',
      '性能', '性能测试', '性能分析', '性能调优',
      '安全', '安全方案', '安全策略', '权限',
      '网络', '网络架构', '网络方案', '负载均衡',
      '存储', '存储方案', '分布式存储',
      '计算', '计算引擎', '分布式计算',
    ],
    secondary: ['数据库方案', '架构设计', 'API文档', '部署指南', '配置手册', '性能优化', '技术白皮书', '开发指南', '运维手册', '测试报告']
  },
  '产品文档': {
    keywords: [
      // 原有关键词
      '产品介绍', '产品方案', '产品文档', '功能说明',
      '产品特性', '产品优势', '解决方案', '产品能力',
      // 新增：产品相关
      '产品手册', '用户手册', '使用手册', '用户指南',
      '产品白皮书', '产品规格', '产品特性', '产品功能',
      '功能列表', '功能特性', '功能介绍', '功能详情',
      '产品发布', '版本说明', '更新日志', 'Release Notes',
      '产品规划', '产品路线', 'Roadmap',
      '竞品分析', '市场调研', '市场需求',
      '用户体验', 'UX', 'UI设计', '交互设计',
      '需求文档', 'PRD', '产品需求', '需求分析',
    ],
    secondary: ['产品介绍', '产品方案', '功能说明', '解决方案', '用户手册', '产品白皮书', '需求文档', '版本说明']
  },
  '培训材料': {
    keywords: [
      // 原有关键词
      '培训', 'workshop', '训练营', '教程', '学习',
      '实战', '演练', '分享会', '技术分享',
      // 新增：培训相关
      '讲义', '课件', 'PPT', '幻灯片',
      '课程', '在线课程', '培训课程', '培训课程',
      '教材', '教学', '教育', '讲师',
      '入门', '快速入门', 'Getting Started', '新手指南',
      '进阶', '高级', '精通', '深入',
      '演示', 'Demo', '示范', '实操',
      '考试', '认证', '证书', '资格',
    ],
    secondary: ['技术培训', '实战演练', '技术分享', '教程', '入门指南', '进阶教程', '认证培训']
  },
  '客户案例': {
    keywords: [
      // 原有关键词
      '客户', '案例', '最佳实践', '成功案例', '客户故事',
      '用户案例', '实践案例', '落地案例',
      // 新增：案例相关
      '成功故事', '用户故事', '应用案例', '使用案例',
      '标杆', '标杆客户', '标杆案例',
      '赋能', '数字化转型', '转型升级',
      '成果', '收益', '效果', '价值',
      '合作', '合作伙伴', '生态',
    ],
    secondary: ['客户案例', '最佳实践', '成功案例', '标杆案例', '应用案例']
  },
  '行业方案': {
    keywords: [
      // 原有关键词
      '行业', '解决方案', '技术', '教育', '电商',
      '电商', '教育', '医疗', '政务', '制造',
      // 新增：行业相关
      '新零售', '零售', '物流', '供应链',
      '汽车', '出行', '交通',
      '能源', '电力', '环保',
      '房地产', '建筑', '物业',
      '媒体', '娱乐', '社交',
      '农业', '食品', '快消',
      'SaaS', 'PaaS', 'IaaS',
      'To B', 'To C', 'To G',
    ],
    secondary: ['行业解决方案', '行业分析', '行业实践', '行业洞察']
  },
  '会议纪要': {
    keywords: [
      // 原有关键词
      '会议纪要', '会议记录', '月会', '周会', '评审',
      'review', '总结会', '讨论记录',
      // 新增：会议相关
      '会议', '例会', '大会', '峰会',
      '研讨', '研讨会', '座谈会',
      '讨论', '头脑风暴', '脑暴',
      '决策', '决议', '结论',
      '行动项', 'TODO', '待办',
      '参会', '出席', '列席',
      '议程', '日程', '安排',
    ],
    secondary: ['会议纪要', '评审记录', '总结会', '研讨会记录', '决策记录']
  },
  '项目方案': {
    keywords: [
      // 原有关键词
      '项目', '方案', '规划', '计划', '实施',
      '里程碑', '项目进度', '项目管理',
      // 新增：项目相关
      '项目启动', '项目立项', '项目提案',
      '项目计划', '项目排期', '时间表',
      '项目总结', '项目复盘', '项目回顾',
      '风险管理', '风险评估', '风险预案',
      '资源', '资源配置', '人员安排',
      '预算', '成本', '投入产出',
      '交付物', '交付', '验收',
      '变更', '变更申请', '变更管理',
    ],
    secondary: ['项目规划', '实施方案', '项目进度', '项目总结', '风险管理']
  },
  '工作总结': {
    keywords: [
      // 原有关键词
      '总结', '汇报', '述职', '年度报告', '季度总结',
      '月度总结', '周报', '日报',
      // 新增：总结相关
      '工作', '工作汇报', '工作总结',
      '年度', '季度', '月度', '半年度',
      '回顾', '复盘', '反思',
      '计划', '规划', '展望',
      '目标', 'OKR', 'KPI', '绩效考核',
      '成果', '业绩', '贡献',
      '不足', '改进', '优化建议',
    ],
    secondary: ['工作总结', '年度报告', '季度总结', '月度总结', '述职报告']
  },
  '财务报告': {
    keywords: [
      // 原有关键词
      '财务', '报表', '预算', '成本', '收入',
      '利润', '财务分析', '审计报告',
      // 新增：财务相关
      '会计', '账目', '账单', '发票',
      '资金', '现金流', '投资',
      '融资', '估值', '股权',
      '税务', '税收', '纳税',
      '审计', '内审', '外审',
      '报销', '费用', '开支',
      '盈利', '亏损', '毛利率',
    ],
    secondary: ['财务报表', '预算报告', '成本分析', '审计报告', '投资分析']
  },
  '法律合同': {
    keywords: [
      // 原有关键词
      '合同', '协议', '法律', '条款', '签约',
      '保密协议', '服务协议', '采购合同',
      // 新增：法律相关
      '法务', '法规', '合规',
      '授权', '许可证', '执照',
      '责任', '免责声明', '赔偿',
      '违约', '纠纷', '仲裁',
      '知识产权', '专利', '商标',
      '劳动', '劳务', '雇佣',
      '租赁', '买卖', '交易',
    ],
    secondary: ['合同', '协议', '法律文件', '合规文件', '授权文件']
  }
};

/**
 * 基于规则快速分类
 * @param fileName 文件名
 * @param content 文件内容（前1500字符）
 * @returns 分类结果，如果规则无法分类则返回null
 */
export function classifyByRules(fileName: string, content: string): Classification | null {
  const text = (fileName + ' ' + content).toLowerCase();
  
  // 第一轮：文件名精确匹配（高优先级）
  for (const [category, rules] of Object.entries(CATEGORY_RULES)) {
    for (const keyword of rules.keywords) {
      if (fileName.toLowerCase().includes(keyword.toLowerCase())) {
        const secondaryIndex = rules.keywords.indexOf(keyword);
        const secondary = rules.secondary[Math.min(secondaryIndex, rules.secondary.length - 1)];
        
        return {
          primaryCategory: category,
          secondaryCategory: secondary,
          tags: [keyword, fileName.split('.').slice(0, -1).join('.').slice(0, 30)],
          confidence: 0.85,
          reasoning: `文件名包含关键词"${keyword}"，规则匹配分类为${category}`,
          summary: `这是一份关于${category}的文档，关键词：${keyword}`
        };
      }
    }
  }
  
  // 第二轮：内容多关键词匹配（统计命中次数）
  const categoryScores: Record<string, { score: number; keywords: string[] }> = {};
  
  for (const [category, rules] of Object.entries(CATEGORY_RULES)) {
    let score = 0;
    const matchedKeywords: string[] = [];
    
    for (const keyword of rules.keywords) {
      // 统计关键词出现次数
      const regex = new RegExp(keyword.toLowerCase(), 'g');
      const matches = text.match(regex);
      if (matches) {
        const count = matches.length;
        // 文件名中出现的关键词权重 * 3
        if (fileName.toLowerCase().includes(keyword.toLowerCase())) {
          score += count * 3;
        } else {
          score += count;
        }
        matchedKeywords.push(keyword);
      }
    }
    
    if (score > 0) {
      categoryScores[category] = { score, keywords: matchedKeywords };
    }
  }
  
  // 找到得分最高的分类
  let bestCategory: string | null = null;
  let bestScore = 0;
  
  for (const [category, data] of Object.entries(categoryScores)) {
    if (data.score > bestScore) {
      bestScore = data.score;
      bestCategory = category;
    }
  }
  
  // 如果有匹配结果，返回分类
  if (bestCategory && bestScore >= 2) { // 至少2分（降低阈值）
    const rules = CATEGORY_RULES[bestCategory];
    const bestKeyword = categoryScores[bestCategory].keywords[0];
    const secondaryIndex = rules.keywords.indexOf(bestKeyword);
    const secondary = rules.secondary[Math.min(secondaryIndex, rules.secondary.length - 1)];
    
    // 根据分数计算置信度
    const confidence = Math.min(0.6 + (bestScore * 0.05), 0.85); // 0.6-0.85
    
    return {
      primaryCategory: bestCategory,
      secondaryCategory: secondary,
      tags: categoryScores[bestCategory].keywords.slice(0, 3),
      confidence,
      reasoning: `内容包含${bestScore}个关键词匹配，规则分类为${bestCategory}`,
      summary: `这是一份关于${bestCategory}的文档，关键词：${bestKeyword}`
    };
  }
  
  // 第三轮：文件扩展名推理（最低优先级）
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext) {
    // PPT/Slides 通常是培训或汇报
    if (['ppt', 'pptx', 'pptm', 'key'].includes(ext)) {
      // 检查文件名是否有培训相关词
      if (/培训|workshop|训练营|课程|讲义|课件/i.test(fileName)) {
        return {
          primaryCategory: '培训材料',
          secondaryCategory: '技术培训',
          tags: ['PPT', '培训'],
          confidence: 0.65,
          reasoning: `PPT文件且文件名包含培训相关关键词`,
          summary: `这是一份培训材料（PPT格式）`
        };
      }
      // 检查是否有汇报/总结相关词
      if (/总结|汇报|述职|报告/i.test(fileName)) {
        return {
          primaryCategory: '工作总结',
          secondaryCategory: '述职报告',
          tags: ['PPT', '汇报'],
          confidence: 0.6,
          reasoning: `PPT文件且文件名包含汇报相关关键词`,
          summary: `这是一份工作总结（PPT格式）`
        };
      }
    }
    
    // Excel 通常是财务或数据
    if (['xls', 'xlsx', 'csv'].includes(ext)) {
      if (/财务|报表|预算|成本|收入|利润/i.test(fileName)) {
        return {
          primaryCategory: '财务报告',
          secondaryCategory: '财务报表',
          tags: ['Excel', '财务'],
          confidence: 0.7,
          reasoning: `Excel文件且文件名包含财务相关关键词`,
          summary: `这是一份财务报告（Excel格式）`
        };
      }
    }
    
    // Word 通常是文档类
    if (['doc', 'docx'].includes(ext)) {
      if (/方案|规划|计划|实施/i.test(fileName)) {
        return {
          primaryCategory: '项目方案',
          secondaryCategory: '实施方案',
          tags: ['Word', '方案'],
          confidence: 0.6,
          reasoning: `Word文件且文件名包含方案相关关键词`,
          summary: `这是一份项目方案（Word格式）`
        };
      }
      if (/合同|协议|法律/i.test(fileName)) {
        return {
          primaryCategory: '法律合同',
          secondaryCategory: '合同',
          tags: ['Word', '合同'],
          confidence: 0.75,
          reasoning: `Word文件且文件名包含合同相关关键词`,
          summary: `这是一份法律合同（Word格式）`
        };
      }
    }
  }
  
  // 规则无法分类，需要AI
  return null;
}

/**
 * 获取所有支持的分类
 */
export function getSupportedCategories(): string[] {
  return Object.keys(CATEGORY_RULES);
}
