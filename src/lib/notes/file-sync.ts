import fs from "fs";
import path from "path";

const NOTES_DIR = path.join(process.cwd(), "notes");

// Ensure notes directory exists
if (!fs.existsSync(NOTES_DIR)) {
  fs.mkdirSync(NOTES_DIR, { recursive: true });
}

/**
 * Build folder path for a note folder
 * Handles nested folders by recursively building the path
 * @param folderId - The ID of the target folder
 * @param folderName - The NAME to use for the target folder (not from database!)
 * @param parentId - The parent ID of the target folder
 * @param allFolders - All folders for building parent path
 */
function buildFolderPath(
  folderId: string,
  folderName: string,  // This is the name to use for the target folder
  parentId: string | null,
  allFolders: Array<{ id: string; name: string; parentId: string | null }>
): string {
  const parts: string[] = [];
  
  // Build path from root to current folder
  let currentId: string | null = folderId;
  const folderMap = new Map(allFolders.map(f => [f.id, f]));
  
  while (currentId) {
    const folder = folderMap.get(currentId);
    
    let sanitizedName: string;
    
    if (folder && folder.id !== folderId) {
      // For parent folders, use the name from allFolders
      sanitizedName = folder.name
        .replace(/[\\/:*?"<>|]/g, "")
        .replace(/^\s+|\s+$/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 50);
    } else if (folder && folder.id === folderId) {
      // For the target folder, use the provided folderName parameter
      sanitizedName = folderName
        .replace(/[\\/:*?"<>|]/g, "")
        .replace(/^\s+|\s+$/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 50);
    } else {
      // Folder not found in map, use folderId
      sanitizedName = folderId;
    }
    
    parts.unshift(sanitizedName || folderId);
    currentId = folder ? folder.parentId : null;
  }
  
  return path.join(NOTES_DIR, ...parts);
}

/**
 * Create folder structure on filesystem
 */
export function createNoteFolder(
  folderId: string,
  folderName: string,
  parentId: string | null,
  allFolders: Array<{ id: string; name: string; parentId: string | null }>
): string {
  const folderPath = buildFolderPath(folderId, folderName, parentId, allFolders);
  
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  
  return folderPath;
}

/**
 * Rename folder on filesystem
 * Also renames all subfolders if this is a parent folder
 */
export function renameNoteFolder(
  folderId: string,
  oldName: string,
  newName: string,
  parentId: string | null,
  allFolders: Array<{ id: string; name: string; parentId: string | null }>
): void {
  const oldPath = buildFolderPath(folderId, oldName, parentId, allFolders);
  
  if (!fs.existsSync(oldPath)) {
    console.warn(`Folder not found: ${oldPath}`);
    return;
  }
  
  // Build new path with new name
  const newParts: string[] = [];
  let currentId: string | null = folderId;
  const folderMap = new Map(allFolders.map(f => [f.id, f]));
  
  // Build path from root, replacing old name with new name
  while (currentId) {
    const folder = folderMap.get(currentId);
    if (!folder) break;
    
    let sanitizedName = folder.name
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/^\s+|\s+$/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 50);
    
    // Replace old name with new name for current folder
    if (folder.id === folderId) {
      sanitizedName = newName
        .replace(/[\\/:*?"<>|]/g, "")
        .replace(/^\s+|\s+$/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 50);
    }
    
    newParts.unshift(sanitizedName || folder.id);
    currentId = folder.parentId;
  }
  
  const newPath = path.join(NOTES_DIR, ...newParts);
  
  try {
    // Rename the folder
    if (oldPath !== newPath) {
      fs.renameSync(oldPath, newPath);
      console.log(`Renamed folder: ${oldPath} -> ${newPath}`);
    }
  } catch (error) {
    console.error(`Failed to rename folder ${oldPath}:`, error);
    throw error;
  }
}

/**
 * Soft delete folder on filesystem
 * Renames folder to indicate deletion with timestamp
 * Example: "zb" -> "zb-deleted-2026-04-19T15-30-45"
 */
export function softDeleteNoteFolder(
  folderId: string,
  folderName: string,
  parentId: string | null,
  allFolders: Array<{ id: string; name: string; parentId: string | null }>
): string | null {
  const folderPath = buildFolderPath(folderId, folderName, parentId, allFolders);
  
  if (!fs.existsSync(folderPath)) {
    console.warn(`Folder not found for soft delete: ${folderPath}`);
    return null;
  }
  
  try {
    // Generate timestamp
    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, '-')  // Replace invalid filename chars
      .slice(0, 19);  // Remove milliseconds and Z
    
    // Build new name with deleted marker
    const deletedName = `${folderName}-deleted-${timestamp}`;
    
    // Build new path
    const newParts: string[] = [];
    let currentId: string | null = folderId;
    const folderMap = new Map(allFolders.map(f => [f.id, f]));
    
    while (currentId) {
      const folder = folderMap.get(currentId);
      
      let sanitizedName: string;
      
      if (folder && folder.id !== folderId) {
        // For parent folders, use the name from allFolders
        sanitizedName = folder.name
          .replace(/[\\/:*?"<>|]/g, "")
          .replace(/^\s+|\s+$/g, "")
          .replace(/\s+/g, "-")
          .slice(0, 50);
      } else if (folder && folder.id === folderId) {
        // For the target folder, use the deleted name
        sanitizedName = deletedName
          .replace(/[\\/:*?"<>|]/g, "")
          .replace(/^\s+|\s+$/g, "")
          .replace(/\s+/g, "-")
          .slice(0, 100);  // Allow longer name for deleted folders
      } else {
        sanitizedName = folderId;
      }
      
      newParts.unshift(sanitizedName || folderId);
      currentId = folder ? folder.parentId : null;
    }
    
    const deletedPath = path.join(NOTES_DIR, ...newParts);
    
    // Rename folder to mark as deleted
    fs.renameSync(folderPath, deletedPath);
    console.log(`Soft deleted folder: ${folderPath} -> ${deletedPath}`);
    
    return deletedPath;
  } catch (error) {
    console.error(`Failed to soft delete folder ${folderPath}:`, error);
    throw error;
  }
}

/**
 * Permanently delete folder from filesystem
 * Use with caution - this cannot be undone
 */
export function permanentlyDeleteNoteFolder(
  folderPath: string
): void {
  try {
    if (!fs.existsSync(folderPath)) {
      console.warn(`Folder already deleted: ${folderPath}`);
      return;
    }
    
    // Remove all files and subdirectories recursively
    const deleteRecursive = (dirPath: string) => {
      if (fs.existsSync(dirPath)) {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            deleteRecursive(fullPath);
          } else {
            fs.unlinkSync(fullPath);
          }
        }
        fs.rmdirSync(dirPath);
      }
    };
    
    deleteRecursive(folderPath);
    console.log(`Permanently deleted folder: ${folderPath}`);
  } catch (error) {
    console.error(`Failed to permanently delete folder ${folderPath}:`, error);
    throw error;
  }
}

/**
 * Soft delete note file on filesystem
 * Renames file to indicate deletion with timestamp
 * Example: "笔记标题.md" -> "笔记标题-deleted-2026-04-19T15-30-45.md"
 */
export function softDeleteNoteFile(
  noteId: string,
  title: string,
  folderId: string | null,
  allFolders: Array<{ id: string; name: string; parentId: string | null }>
): string | null {
  let searchDir = NOTES_DIR;
  
  // If note has a folder, search in that folder
  if (folderId && allFolders) {
    const folder = allFolders.find(f => f.id === folderId);
    if (folder) {
      searchDir = buildFolderPath(
        folder.id,
        folder.name,
        folder.parentId,
        allFolders
      );
    }
  }
  
  if (!fs.existsSync(searchDir)) {
    console.warn(`Directory not found for soft delete: ${searchDir}`);
    return null;
  }
  
  const files = fs.readdirSync(searchDir);
  
  // Find the note file by noteId (more reliable than title)
  let noteFile: string | undefined;
  
  // Primary: find by noteId pattern (title-noteId.md or noteId.md)
  const noteIdShort = noteId.slice(0, 8);
  noteFile = files.find((f) => 
    f.endsWith(".md") && 
    (f === `${noteId}.md` || f.includes(`-${noteIdShort}.md`))
  );
  
  // Fallback: try to find by title
  if (!noteFile && title) {
    const sanitizedTitle = title
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/^\s+|\s+$/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 100);
    
    noteFile = files.find((f) => f === `${sanitizedTitle}.md`);
  }
  
  if (!noteFile) {
    console.warn(`Note file not found for soft delete in ${searchDir}`);
    return null;
  }
  
  try {
    // Generate timestamp
    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    
    // Build new filename with deleted marker
    const ext = path.extname(noteFile);
    const baseName = path.basename(noteFile, ext);
    const deletedFileName = `${baseName}-deleted-${timestamp}${ext}`;
    
    const oldPath = path.join(searchDir, noteFile);
    const newPath = path.join(searchDir, deletedFileName);
    
    // Rename file to mark as deleted
    fs.renameSync(oldPath, newPath);
    console.log(`Soft deleted note file: ${oldPath} -> ${newPath}`);
    
    return newPath;
  } catch (error) {
    console.error(`Failed to soft delete note file:`, error);
    throw error;
  }
}

/**
 * Permanently delete note file from filesystem
 */
export function permanentlyDeleteNoteFile(
  filePath: string
): void {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`File already deleted: ${filePath}`);
      return;
    }
    
    fs.unlinkSync(filePath);
    console.log(`Permanently deleted file: ${filePath}`);
  } catch (error) {
    console.error(`Failed to permanently delete file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Generate Markdown file content with frontmatter
 */
function generateMarkdownContent(note: {
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  tags?: Array<{ name: string; color?: string | null }>;
}): string {
  const frontmatter = [
    "---",
    `title: "${note.title.replace(/"/g, '\\"')}"`,
    `created: ${new Date(note.createdAt).toISOString()}`,
    `updated: ${new Date(note.updatedAt).toISOString()}`,
  ];

  if (note.tags && note.tags.length > 0) {
    frontmatter.push(`tags: [${note.tags.map((t) => `"${t.name}"`).join(", ")}]`);
  }

  frontmatter.push("---", "");

  return frontmatter.join("\n") + note.content;
}

/**
 * Generate a safe filename from note title
 * Include noteId to ensure uniqueness
 */
function generateFilename(noteId: string, title: string): string {
  // Sanitize title: remove special chars that are invalid in filenames
  const sanitized = title
    .replace(/[\\/:*?"<>|]/g, "") // Remove Windows/Mac invalid chars
    .replace(/^\s+|\s+$/g, "") // Trim whitespace
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .slice(0, 80); // Limit length (leave room for noteId)

  // Always include noteId to ensure uniqueness
  // Format: title-noteId.md or noteId.md (if title is empty)
  const filename = sanitized ? `${sanitized}-${noteId.slice(0, 8)}.md` : `${noteId}.md`;
  
  return filename;
}

/**
 * Save or update a note as Markdown file
 * Handles file renaming when title changes
 */
export function saveNoteToFile(note: {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  folderId?: string | null;
  tags?: Array<{ name: string; color?: string | null }>;
  allFolders?: Array<{ id: string; name: string; parentId: string | null }>;
}): string {
  const filename = generateFilename(note.id, note.title);
  
  let folderPath = NOTES_DIR;
  
  // If note has a folder, save to that folder
  if (note.folderId && note.allFolders) {
    const folder = note.allFolders.find(f => f.id === note.folderId);
    if (folder) {
      folderPath = buildFolderPath(
        folder.id,
        folder.name,
        folder.parentId,
        note.allFolders
      );
      
      // Ensure folder exists
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
        console.log(`Created folder: ${folderPath}`);
      }
    } else {
      console.warn(`Folder ${note.folderId} not found in allFolders`);
    }
  }
  
  const newFilePath = path.join(folderPath, filename);
  const content = generateMarkdownContent(note);

  console.log(`Saving note ${note.id} to: ${newFilePath}`);
  console.log(`Content length: ${content.length}`);

  // Check if this is an update (file exists with different name)
  if (fs.existsSync(newFilePath)) {
    // File already exists with correct name, just update it
    fs.writeFileSync(newFilePath, content, "utf-8");
    console.log(`Updated existing file: ${newFilePath}`);
  } else {
    // Check if old file exists (title might have changed)
    const files = fs.readdirSync(folderPath);
    const noteIdShort = note.id.slice(0, 8);
    const oldFile = files.find(f => 
      f.endsWith(".md") && 
      f.includes(`-${noteIdShort}.md`)
    );
    
    if (oldFile) {
      // Rename old file to new filename
      const oldFilePath = path.join(folderPath, oldFile);
      fs.renameSync(oldFilePath, newFilePath);
      console.log(`Renamed note file: ${oldFile} -> ${filename}`);
    }
    
    // Write the file (new or renamed)
    fs.writeFileSync(newFilePath, content, "utf-8");
    console.log(`Created new file: ${newFilePath}`);
  }
  
  return newFilePath;
}

/**
 * Delete a note Markdown file
 */
export function deleteNoteFromFile(noteId: string, title?: string, folderId?: string | null, allFolders?: Array<{ id: string; name: string; parentId: string | null }>): void {
  let searchDir = NOTES_DIR;
  
  // If note has a folder, search in that folder
  if (folderId && allFolders) {
    const folder = allFolders.find(f => f.id === folderId);
    if (folder) {
      searchDir = buildFolderPath(
        folder.id,
        folder.name,
        folder.parentId,
        allFolders
      );
    }
  }
  
  if (!fs.existsSync(searchDir)) {
    return;
  }
  
  const files = fs.readdirSync(searchDir);
  
  // Find the note file by noteId (more reliable than title)
  let noteFile: string | undefined;
  
  // Primary: find by noteId pattern (title-noteId.md or noteId.md)
  const noteIdShort = noteId.slice(0, 8);
  noteFile = files.find((f) => 
    f.endsWith(".md") && 
    (f === `${noteId}.md` || f.includes(`-${noteIdShort}.md`))
  );
  
  // Fallback: try to find by title
  if (!noteFile && title) {
    const sanitizedTitle = title
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/^\s+|\s+$/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 100);
    
    noteFile = files.find((f) => f === `${sanitizedTitle}.md`);
  }
  
  // Delete the file if found
  if (noteFile) {
    fs.unlinkSync(path.join(searchDir, noteFile));
  }
}

/**
 * Sync all notes from database to files (for migration)
 */
export function syncAllNotesToFile(notes: Array<{
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  folderId?: string | null;
  tags?: Array<{ name: string; color?: string | null }>;
  allFolders?: Array<{ id: string; name: string; parentId: string | null }>;
}>): string[] {
  const savedPaths: string[] = [];

  // Clear existing files first (only .md files, not folders)
  const existingFiles = fs.readdirSync(NOTES_DIR);
  for (const file of existingFiles) {
    const fullPath = path.join(NOTES_DIR, file);
    const stat = fs.statSync(fullPath);
    if (stat.isFile() && file.endsWith(".md")) {
      fs.unlinkSync(fullPath);
    }
  }

  // Save all notes to their respective folders
  for (const note of notes) {
    const filePath = saveNoteToFile(note);
    savedPaths.push(filePath);
  }

  return savedPaths;
}

export { NOTES_DIR };
