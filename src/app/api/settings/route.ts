import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const SETTINGS_PATH = path.join(process.cwd(), "data", "settings.json");

function readSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
    }
  } catch {
    // ignore
  }
  return {
    apiKey: process.env.DASHSCOPE_API_KEY || "",
    baseUrl: process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: process.env.DASHSCOPE_MODEL || "qwen-plus",
    embeddingModel: process.env.DASHSCOPE_EMBEDDING_MODEL || "text-embedding-v3",
    visionModel: process.env.DASHSCOPE_VISION_MODEL || "qwen-vl-max",
  };
}

function writeSettings(settings: Record<string, string>) {
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

export async function GET() {
  const settings = readSettings();
  // Mask API key for display
  return NextResponse.json({
    ...settings,
    apiKey: settings.apiKey ? settings.apiKey.slice(0, 6) + "..." + settings.apiKey.slice(-4) : "",
  });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const current = readSettings();

  const updated = {
    apiKey: body.apiKey?.includes("...") ? current.apiKey : (body.apiKey || current.apiKey),
    baseUrl: body.baseUrl || current.baseUrl,
    model: body.model || current.model,
    embeddingModel: body.embeddingModel || current.embeddingModel,
    visionModel: body.visionModel || current.visionModel,
  };

  writeSettings(updated);
  return NextResponse.json({ success: true });
}
