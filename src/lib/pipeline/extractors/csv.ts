import fs from "fs";
import type { ExtractionResult } from "../extractor";

/**
 * CSV文件提取器
 * 读取CSV文件并格式化为可读文本
 */
export async function extractCsv(filePath: string): Promise<ExtractionResult> {
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

  // Parse and format CSV for better readability
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) {
    return {
      text: "",
      metadata: {
        method: "csv",
        rows: 0,
        columns: 0,
      },
    };
  }

  // Parse header
  const headers = parseCsvLine(lines[0]);
  
  // Parse data rows
  const dataRows = lines.slice(1).filter(line => line.trim()).map(line => parseCsvLine(line));
  
  // Format as readable text
  let formattedText = `CSV文件内容\n`;
  formattedText += `============\n\n`;
  formattedText += `列数: ${headers.length}\n`;
  formattedText += `数据行数: ${dataRows.length}\n\n`;
  
  formattedText += `## 列名\n`;
  formattedText += headers.map((h, i) => `${i + 1}. ${h}`).join('\n');
  formattedText += `\n\n`;
  
  formattedText += `## 数据预览\n\n`;
  
  // Show first 100 rows as preview
  const previewRows = dataRows.slice(0, 100);
  
  for (let i = 0; i < previewRows.length; i++) {
    formattedText += `### 第 ${i + 1} 行\n`;
    const row = previewRows[i];
    for (let j = 0; j < headers.length; j++) {
      formattedText += `- **${headers[j]}**: ${row[j] || ''}\n`;
    }
    formattedText += `\n`;
  }
  
  if (dataRows.length > 100) {
    formattedText += `\n... 还有 ${dataRows.length - 100} 行数据未显示\n`;
  }

  return {
    text: formattedText.trim(),
    metadata: {
      method: "csv",
      rows: dataRows.length,
      columns: headers.length,
      headers: headers,
    },
  };
}

/**
 * 解析CSV行，正确处理引号和逗号
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  
  result.push(current.trim());
  return result;
}
