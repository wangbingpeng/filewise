import fs from "fs";
import type { ExtractionResult } from "../extractor";

/**
 * Excel file extractor (xlsx/xls)
 * Reads all sheets and extracts text content
 */
export async function extractXlsx(filePath: string): Promise<ExtractionResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx");

  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const sheets: string[] = [];
  let totalRows = 0;
  let totalCells = 0;

  // Process each sheet
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    
    // Convert sheet to JSON (array of arrays for better control)
    const jsonData = XLSX.utils.sheet_to_json(sheet, { 
      header: 1,  // Array of arrays
      defval: "", // Default value for empty cells
    }) as unknown[][];

    if (jsonData.length === 0) continue;

    totalRows += jsonData.length;
    
    // Format sheet content
    const sheetLines: string[] = [];
    sheetLines.push(`\n=== Sheet: ${sheetName} ===\n`);

    for (const row of jsonData) {
      // Filter out empty rows
      const nonEmptyCells = row.filter(cell => cell !== "" && cell !== null && cell !== undefined);
      if (nonEmptyCells.length === 0) continue;

      totalCells += nonEmptyCells.length;
      
      // Join cells with tab separator
      const rowText = row
        .map(cell => {
          if (cell === null || cell === undefined) return "";
          if (typeof cell === "number") return cell.toString();
          if (cell instanceof Date) return cell.toISOString();
          return String(cell);
        })
        .join("\t");
      
      sheetLines.push(rowText);
    }

    sheets.push(sheetLines.join("\n"));
  }

  const text = sheets.join("\n");

  return {
    text,
    metadata: {
      sheetCount: workbook.SheetNames.length,
      sheetNames: workbook.SheetNames,
      totalRows,
      totalCells,
    },
  };
}
