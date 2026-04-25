import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const SKILLS_DIR = path.join(process.cwd(), "skills");

// Ensure skills directory exists
function ensureSkillsDir() {
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, name, title, content, oldName } = body;

    if (!name || !title || !content) {
      return NextResponse.json(
        { error: "请提供技能名称、标题和内容" },
        { status: 400 }
      );
    }

    // Validate skill name
    const nameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!nameRegex.test(name)) {
      return NextResponse.json(
        { error: "技能名称只能包含字母、数字、下划线和连字符" },
        { status: 400 }
      );
    }

    ensureSkillsDir();

    if (action === "create") {
      // Check if skill already exists
      const skillPath = path.join(SKILLS_DIR, `${name}.md`);
      if (fs.existsSync(skillPath)) {
        return NextResponse.json(
          { error: "技能名称已存在" },
          { status: 400 }
        );
      }

      // Create new skill
      fs.writeFileSync(skillPath, content, "utf-8");
      return NextResponse.json({ success: true, message: "创建成功" });
    }

    if (action === "update") {
      if (!oldName) {
        return NextResponse.json(
          { error: "更新操作需要提供原技能名称" },
          { status: 400 }
        );
      }

      const oldPath = path.join(SKILLS_DIR, `${oldName}.md`);
      const newPath = path.join(SKILLS_DIR, `${name}.md`);

      // If name changed, need to rename file
      if (oldName !== name) {
        if (fs.existsSync(newPath)) {
          return NextResponse.json(
            { error: "目标技能名称已存在" },
            { status: 400 }
          );
        }

        // Delete old file and create new one
        fs.writeFileSync(newPath, content, "utf-8");
        fs.unlinkSync(oldPath);
      } else {
        // Just update content
        fs.writeFileSync(oldPath, content, "utf-8");
      }

      return NextResponse.json({ success: true, message: "更新成功" });
    }

    return NextResponse.json(
      { error: "无效的操作类型" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Skill save failed:", error);
    return NextResponse.json(
      { error: "保存失败", details: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json(
        { error: "请提供技能名称" },
        { status: 400 }
      );
    }

    const skillPath = path.join(SKILLS_DIR, `${name}.md`);

    if (!fs.existsSync(skillPath)) {
      return NextResponse.json(
        { error: "技能不存在" },
        { status: 404 }
      );
    }

    // Delete the skill file
    fs.unlinkSync(skillPath);

    return NextResponse.json({ success: true, message: "删除成功" });
  } catch (error) {
    console.error("Skill delete failed:", error);
    return NextResponse.json(
      { error: "删除失败", details: String(error) },
      { status: 500 }
    );
  }
}
