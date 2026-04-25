"use client";

import { FileText, FileType, File as FileIcon, AlertCircle, FolderOpen, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface FileCardProps {
  fileId: string;
  fileName: string;
  relativePath?: string;
  extension: string;
  sizeBytes: number;
  status: string;
  errorMessage?: string | null;
  category?: string;
  onClick?: () => void;
}

const EXT_ICONS: Record<string, typeof FileText> = {
  pdf: FileType,
  docx: FileText,
  doc: FileText,
  md: FileText,
  txt: FileIcon,
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  discovered: { label: "待处理", variant: "outline" },
  extracting: { label: "提取中", variant: "secondary" },
  extracted: { label: "已提取", variant: "secondary" },
  classified: { label: "已分类", variant: "default" },
  indexed: { label: "已索引", variant: "default" },
  error: { label: "错误", variant: "destructive" },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileCard({ fileId, fileName, relativePath, extension, sizeBytes, status, errorMessage, category, onClick }: FileCardProps) {
  const Icon = EXT_ICONS[extension.toLowerCase()] || FileIcon;
  const statusInfo = STATUS_LABELS[status] || STATUS_LABELS.discovered;
  const [showError, setShowError] = useState(false);
  const [opening, setOpening] = useState(false);
  const isError = status === "error";

  // 从相对路径提取子文件夹信息
  const subFolder = relativePath ? relativePath.split('/').slice(0, -1).join('/') : '';

  // Open folder in file system
  const handleOpenFolder = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpening(true);
    try {
      const res = await fetch(`/api/files/${fileId}/open-folder`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "无法打开文件夹");
      }
    } catch (err) {
      alert("打开文件夹失败: " + String(err));
    } finally {
      setOpening(false);
    }
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border transition-colors",
        isError && "border-destructive/50 bg-destructive/5",
        !isError && "hover:bg-accent/50",
        onClick && "cursor-pointer"
      )}
    >
      <div className={cn(
        "flex items-center justify-center w-10 h-10 rounded-lg shrink-0",
        isError ? "bg-destructive/10" : "bg-muted"
      )}>
        {isError ? (
          <AlertCircle className="h-5 w-5 text-destructive" />
        ) : (
          <Icon className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium truncate", isError && "text-destructive")}>{fileName}</p>
        <p className="text-xs text-muted-foreground">
          {subFolder && <span className="text-primary/70">{subFolder}/</span>}
          {extension.toUpperCase()} · {formatFileSize(sizeBytes)}
        </p>
        {isError && errorMessage && (
          <div className="mt-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowError(!showError);
              }}
              className="text-xs text-destructive hover:underline flex items-center gap-1"
            >
              <AlertCircle className="h-3 w-3" />
              {showError ? "隐藏详情" : "查看错误原因"}
            </button>
            {showError && (
              <p className="text-xs text-destructive/80 mt-1 p-2 bg-destructive/10 rounded break-all">
                {errorMessage}
              </p>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleOpenFolder}
          disabled={opening}
          className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          title="在文件夹中打开"
        >
          {opening ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FolderOpen className="h-4 w-4" />
          )}
        </button>
        {category && (
          <Badge variant="secondary" className="text-xs">
            {category}
          </Badge>
        )}
        <Badge variant={statusInfo.variant} className="text-xs">
          {statusInfo.label}
        </Badge>
      </div>
    </div>
  );
}
