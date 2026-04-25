import fs from "fs";
import type { ExtractionResult } from "../extractor";

export async function extractText(filePath: string): Promise<ExtractionResult> {
  // Try to detect encoding
  const buffer = fs.readFileSync(filePath);
  
  let text: string;
  try {
    // Try UTF-8 first
    text = buffer.toString("utf-8");
    // Check for BOM
    if (text.charCodeAt(0) === 0xFEFF) {
      text = text.slice(1);
    }
  } catch {
    // Fallback to latin1
    text = buffer.toString("latin1");
  }

  return {
    text: text.trim(),
  };
}

// 方案1: 添加HTML/XML简单提取器
export async function extractHtml(filePath: string): Promise<ExtractionResult> {
  const buffer = fs.readFileSync(filePath);
  let text = buffer.toString('utf-8');
  
  // 简单去除HTML标签
  text = text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  
  return {
    text: text,
    metadata: { originalType: 'html' }
  };
}

export async function extractXml(filePath: string): Promise<ExtractionResult> {
  const buffer = fs.readFileSync(filePath);
  let text = buffer.toString('utf-8');
  
  // 简单去除XML标签，保留文本内容
  text = text
    .replace(/<\?xml[^>]*>/g, '')
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  return {
    text: text,
    metadata: { originalType: 'xml' }
  };
}
