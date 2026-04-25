"use client";

import { useState, useRef } from "react";
import { FolderOpen, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface FolderPickerProps {
  onFolderSelected: (path: string, fileEntries?: FileEntry[], displayName?: string) => void;
}

export interface FileEntry {
  name: string;
  relativePath: string;
  size: number;
  type: string;
  file?: File;
}

const SUPPORTED_EXTENSIONS = new Set([
  "pdf", "docx", "doc", "txt", "md", "markdown",
  "rtf", "odt", "csv", "json", "xml", "html", "htm",
  "pptx", "ppt", "xlsx", "xls", "epub",
]);

export function FolderPicker({ onFolderSelected }: FolderPickerProps) {
  const [open, setOpen] = useState(false);
  const [manualPath, setManualPath] = useState("");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // When showDirectoryPicker succeeds but collectEntries returns empty,
  // we store the folder name so the webkitdirectory fallback can use it
  const pendingFolderNameRef = useRef<string | null>(null);

  const handleDirectoryPicker = async () => {
    try {
      // File System Access API (Chrome/Edge)
      if ("showDirectoryPicker" in window) {
        const dirHandle = await (
          window as unknown as {
            showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
          }
        ).showDirectoryPicker();

        setUploading(true);
        const entries: FileEntry[] = [];
        await collectEntries(dirHandle, "", entries);
        setUploading(false);

        if (entries.length > 0) {
          // 生成一个伪绝对路径用于显示
          const virtualPath = `/浏览器上传/${dirHandle.name}`;
          onFolderSelected(virtualPath, entries, dirHandle.name);
          setOpen(false);
          return;
        }

        // showDirectoryPicker got a handle but collectEntries returned empty.
        // This happens in some browser environments. Fall through to
        // the webkitdirectory input as a reliable backup.
        console.warn(
          `collectEntries returned 0 files for "${dirHandle.name}", falling back to webkitdirectory input`
        );
        pendingFolderNameRef.current = dirHandle.name;
        inputRef.current?.click();
        return;
      }
    } catch (e) {
      setUploading(false);
      if ((e as Error).name === "AbortError") return;
      console.error("Directory picker error:", e);
    }
    // Fallback: trigger file input
    pendingFolderNameRef.current = null;
    inputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    console.log(`[FolderPicker] Total files received: ${fileList.length}`);

    const entries: FileEntry[] = [];
    const paths = new Set<string>();
    const dirPaths = new Set<string>(); // 收集所有目录路径

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const relativePath =
        (file as unknown as { webkitRelativePath?: string })
          .webkitRelativePath || file.name;

      // 记录目录结构
      const pathParts = relativePath.split("/");
      if (pathParts.length > 1) {
        // 记录所有层级的目录
        for (let j = 0; j < pathParts.length - 1; j++) {
          dirPaths.add(pathParts.slice(0, j + 1).join("/"));
        }
      }

      // Filter supported extensions
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        console.log(`[FolderPicker] Skipping unsupported file: ${file.name}`);
        continue;
      }

      entries.push({
        name: file.name,
        relativePath,
        size: file.size,
        type: file.type,
        file,
      });
      const parts = relativePath.split("/");
      if (parts.length > 1) paths.add(parts[0]);
    }

    console.log(`[FolderPicker] Supported files found: ${entries.length}`);
    console.log(`[FolderPicker] Directory structure found:`, [...dirPaths]);
    console.log(`[FolderPicker] Top-level folders:`, [...paths]);

    // Use pending folder name from showDirectoryPicker if available
    const folderName =
      pendingFolderNameRef.current ||
      (paths.size === 1 ? [...paths][0] : "uploaded-folder");
    pendingFolderNameRef.current = null;

    // 生成一个伪绝对路径用于显示
    const virtualPath = `/浏览器上传/${folderName}`;
    onFolderSelected(virtualPath, entries, folderName);
    setOpen(false);
  };

  const handleManualPath = () => {
    if (manualPath.trim()) {
      onFolderSelected(manualPath.trim());
      setOpen(false);
      setManualPath("");
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        // @ts-expect-error webkitdirectory is non-standard
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button className="bg-[#0D6EFD] hover:bg-[#0A58CA] text-white" />}>
          <FolderOpen className="h-4 w-4 mr-2" />
          添加文件夹
        </DialogTrigger>
        <DialogContent className="bg-white border-[#E9ECEF]">
          <DialogHeader>
            <DialogTitle className="text-[#212529]">选择文件夹</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Option 1: Directory Picker / Upload */}
            <Button
              variant="outline"
              className="w-full h-28 flex flex-col gap-2 border-[#E9ECEF] hover:bg-[#F8F9FA] hover:border-[#0D6EFD] text-[#212529]"
              onClick={handleDirectoryPicker}
              disabled={uploading}
            >
              <Upload className="h-6 w-6 text-[#0D6EFD]" />
              <span className="text-sm font-medium">
                {uploading ? "正在读取文件..." : "浏览选择文件夹"}
              </span>
              <span className="text-xs text-[#6C757D]">
                支持 Chrome/Edge 直接选择，其他浏览器通过上传
              </span>
            </Button>

            {/* Option 2: Manual Path */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-[#212529]">或输入本机文件夹路径</p>
              <div className="flex gap-2">
                <Input
                  value={manualPath}
                  onChange={(e) => setManualPath(e.target.value)}
                  placeholder="/Users/.../documents"
                  onKeyDown={(e) => e.key === "Enter" && handleManualPath()}
                  className="border-[#E9ECEF] focus:border-[#0D6EFD] focus:ring-[#0D6EFD]/20"
                />
                <Button 
                  onClick={handleManualPath} 
                  disabled={!manualPath.trim()}
                  className="bg-[#0D6EFD] hover:bg-[#0A58CA] text-white"
                >
                  确定
                </Button>
              </div>
              <p className="text-xs text-[#6C757D]">
                输入服务器可访问的绝对路径，系统将直接扫描该目录
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

async function collectEntries(
  dirHandle: FileSystemDirectoryHandle,
  basePath: string,
  entries: FileEntry[],
  depth: number = 0
) {
  const indent = "  ".repeat(depth);
  console.log(`${indent}[collectEntries] Scanning: ${basePath || "(root)"}`);

  // Try multiple iteration approaches for maximum browser compatibility
  try {
    // Approach 1: iterate directory handle directly (Chrome 86+)
    // @ts-expect-error FileSystemDirectoryHandle is async iterable but TS doesn't know
    const iterator = dirHandle.entries ? dirHandle.entries() : dirHandle[Symbol.asyncIterator]?.();

    if (iterator) {
      for await (const item of iterator) {
        // entries() returns [name, handle], direct iteration also returns [name, handle]
        const [name, handle] = Array.isArray(item) ? item : [item.name, item];

        const entryPath = basePath ? `${basePath}/${name}` : name;

        try {
          if (handle.kind === "file") {
            const fileHandle = handle as FileSystemFileHandle;
            const file = await fileHandle.getFile();
            const ext = file.name.split(".").pop()?.toLowerCase() || "";
            if (SUPPORTED_EXTENSIONS.has(ext)) {
              console.log(`${indent}  [File] ${entryPath}`);
              entries.push({
                name: file.name,
                relativePath: entryPath,
                size: file.size,
                type: file.type,
                file,
              });
            }
          } else if (handle.kind === "directory") {
            console.log(`${indent}  [Dir] ${entryPath}/`);
            await collectEntries(
              handle as FileSystemDirectoryHandle,
              entryPath,
              entries,
              depth + 1
            );
          }
        } catch (fileErr) {
          console.warn(`${indent}  Skipping ${name}:`, fileErr);
        }
      }
      return;
    }
  } catch (err) {
    console.warn(`${indent}entries() iteration failed, trying values():`, err);
  }

  // Approach 2: fallback to values()
  try {
    // @ts-expect-error values() may not be in TS types
    for await (const handle of dirHandle.values()) {
      const name = handle.name;
      const entryPath = basePath ? `${basePath}/${name}` : name;

      try {
        if (handle.kind === "file") {
          const file = await (handle as FileSystemFileHandle).getFile();
          const ext = file.name.split(".").pop()?.toLowerCase() || "";
          if (SUPPORTED_EXTENSIONS.has(ext)) {
            console.log(`${indent}  [File] ${entryPath}`);
            entries.push({
              name: file.name,
              relativePath: entryPath,
              size: file.size,
              type: file.type,
              file,
            });
          }
        } else if (handle.kind === "directory") {
          console.log(`${indent}  [Dir] ${entryPath}/`);
          await collectEntries(
            handle as FileSystemDirectoryHandle,
            entryPath,
            entries,
            depth + 1
          );
        }
      } catch (fileErr) {
        console.warn(`${indent}  Skipping ${name}:`, fileErr);
      }
    }
  } catch (err) {
    console.warn(`${indent}values() iteration also failed:`, err);
  }
}
