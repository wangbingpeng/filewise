import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ skillName: string }> }
) {
  try {
    const { skillName } = await params;
    
    // Prevent path traversal
    if (skillName.includes('/') || skillName.includes('\') || skillName.includes('..')) {
      return NextResponse.json(
        { error: "无效的技能名称" },
        { status: 400 }
      );
    }
    
    const skillPath = path.join(process.cwd(), "skills", `${skillName}.md`);

    if (!fs.existsSync(skillPath)) {
      return NextResponse.json(
        { error: "技能不存在" },
        { status: 404 }
      );
    }

    const content = fs.readFileSync(skillPath, "utf-8");
    return NextResponse.json({ content });
  } catch (error) {
    console.error("Skill read failed:", error);
    return NextResponse.json(
      { error: "读取失败", details: String(error) },
      { status: 500 }
    );
  }
}
