import { NextResponse } from "next/server";
import { chatCompletion } from "@/lib/ai/client";
import fs from "fs";
import path from "path";

// Load skill template
function loadSkillTemplate(skillName: string): string {
  const skillPath = path.join(process.cwd(), "skills", `${skillName}.md`);
  try {
    return fs.readFileSync(skillPath, "utf-8");
  } catch {
    return "";
  }
}

// Get available skills
function getAvailableSkills(): string[] {
  const skillsDir = path.join(process.cwd(), "skills");
  try {
    return fs.readdirSync(skillsDir)
      .filter(f => f.endsWith(".md"))
      .map(f => f.replace(".md", ""));
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      type = "daily", // "daily" | "weekly"
      input, // 用户输入的工作信息
      skill = "alibaba-report", // 使用的skill模板
      projectName,
      customerName,
    } = body;

    if (!input || typeof input !== "string") {
      return NextResponse.json({ error: "请提供工作内容信息" }, { status: 400 });
    }

    // Load skill template
    const skillTemplate = loadSkillTemplate(skill);
    if (!skillTemplate) {
      return NextResponse.json({ 
        error: `找不到技能模板: ${skill}`,
        availableSkills: getAvailableSkills(),
      }, { status: 400 });
    }

    // Build prompt
    const today = new Date();
    // Use YYYY-MM-DD format to avoid "/" character which is not allowed in note titles
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const formatDate = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const weekRange = `${formatDate(weekStart)}-${formatDate(weekEnd)}`;

    const systemPrompt = `你是一个专业的报告生成助手。根据用户输入的工作信息，按照指定的模板格式生成${type === "daily" ? "日报" : "周报"}。

## 技能模板
${skillTemplate}

## 当前日期
- 今日：${dateStr}
- 本周：${weekRange}

## 生成要求
1. 严格按照模板格式输出Markdown内容
2. 从用户输入中提取关键信息，合理归类
3. 如果用户输入缺少某些字段，根据上下文合理补充或留空
4. 语言风格要专业、简洁、结果导向
5. 突出重点，使用加粗、表格等格式
${projectName ? `6. 项目名称统一使用：${projectName}` : ""}
${customerName ? `7. 客户名称：${customerName}` : ""}

直接输出报告内容，不要有任何解释或前缀。`;

    const userPrompt = `请根据以下工作信息生成${type === "daily" ? "日报" : "周报"}：

${input}`;

    // Generate report via AI
    const reportContent = await chatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.3, maxTokens: 4000 }
    );

    // Generate title
    const title = type === "daily" 
      ? `日报 - ${dateStr}${projectName ? ` - ${projectName}` : ""}`
      : `周报 - ${weekRange}${projectName ? ` - ${projectName}` : ""}`;

    return NextResponse.json({
      success: true,
      title,
      content: reportContent,
      type,
      skill,
      generatedAt: Date.now(),
    });

  } catch (error) {
    console.error("Report generation failed:", error);
    return NextResponse.json({ 
      error: "报告生成失败", 
      details: String(error) 
    }, { status: 500 });
  }
}

// Get available skills
export async function GET() {
  const skills = getAvailableSkills();
  
  // Load skill info
  const skillDetails = skills.map(name => {
    const content = loadSkillTemplate(name);
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const descMatch = content.match(/^##\s+功能说明\n+([\s\S]+?)(?=\n##)/m);
    
    return {
      name,
      title: titleMatch ? titleMatch[1] : name,
      description: descMatch ? descMatch[1].trim() : "",
    };
  });

  return NextResponse.json({
    skills: skillDetails,
    default: "alibaba-report",
  });
}
