"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  FileText,
  Tag,
  BookOpen,
  Clock,
  HardDrive,
  Hash,
  FolderOpen,
  Loader2,
} from "lucide-react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface FileDetail {
  id: string;
  folderId: string;
  fileName: string;
  relativePath: string;
  extension: string;
  mimeType: string | null;
  sizeBytes: number;
  contentHash: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
  content?: {
    rawText: string;
    charCount: number;
    summary: string | null;
    language: string | null;
  };
  classification?: {
    primaryCategory: string;
    secondaryCategory: string | null;
    tags: string;
    confidence: number;
    reasoning: string | null;
  };
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  discovered: { label: "已发现", variant: "secondary" },
  extracting: { label: "提取中", variant: "secondary" },
  extracted: { label: "已提取", variant: "default" },
  classified: { label: "已分类", variant: "default" },
  indexed: { label: "已索引", variant: "default" },
  error: { label: "错误", variant: "destructive" },
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileDetailPage() {
  const params = useParams();
  const router = useRouter();
  const fileId = params.fileId as string;
  const [openingFolder, setOpeningFolder] = useState(false);

  const { data: file, isLoading } = useSWR<FileDetail>(
    `/api/files/${fileId}`,
    fetcher
  );

  // Open folder in file system
  const handleOpenFolder = async () => {
    setOpeningFolder(true);
    try {
      const res = await fetch(`/api/files/${fileId}/open-folder`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "无法打开文件夹");
      }
    } catch (err) {
      alert("打开文件夹失败: " + String(err));
    } finally {
      setOpeningFolder(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">文件不存在</p>
      </div>
    );
  }

  const status = STATUS_MAP[file.status] || { label: file.status, variant: "secondary" as const };
  let parsedTags: string[] = [];
  try {
    parsedTags = JSON.parse(file.classification?.tags || "[]");
  } catch { /* ignore */ }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">{file.fileName}</h1>
          <p className="text-sm text-muted-foreground mt-1">{file.relativePath}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenFolder}
            disabled={openingFolder}
          >
            {openingFolder ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <FolderOpen className="h-4 w-4 mr-1" />
            )}
            打开所在文件夹
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            返回
          </Button>
        </div>
      </div>
      
      {/* Meta info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <FileText className="h-4 w-4" />
              <span className="text-xs">文件类型</span>
            </div>
            <p className="font-medium">{file.extension.toUpperCase()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <HardDrive className="h-4 w-4" />
              <span className="text-xs">文件大小</span>
            </div>
            <p className="font-medium">{formatSize(file.sizeBytes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs">创建时间</span>
            </div>
            <p className="font-medium">{new Date(file.createdAt).toLocaleDateString("zh-CN")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Hash className="h-4 w-4" />
              <span className="text-xs">状态</span>
            </div>
            <Badge variant={status.variant}>{status.label}</Badge>
            {file.status === "error" && file.errorMessage && (
              <p className="text-xs text-destructive mt-2 whitespace-pre-wrap">
                {file.errorMessage}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Classification */}
      {file.classification && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="h-4 w-4" />
              分类信息
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">主类别:</span>
              <Badge>{file.classification.primaryCategory}</Badge>
              {file.classification.secondaryCategory && (
                <>
                  <span className="text-sm text-muted-foreground">副类别:</span>
                  <Badge variant="outline">{file.classification.secondaryCategory}</Badge>
                </>
              )}
            </div>
            {parsedTags.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-sm text-muted-foreground">标签:</span>
                <div className="flex flex-wrap gap-2">
                  {parsedTags.map((tag) => (
                    <Badge key={tag} variant="secondary">{tag}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">置信度:</span>
              <span className="font-medium">{(file.classification.confidence * 100).toFixed(1)}%</span>
            </div>
            {file.classification.reasoning && (
              <div className="text-sm text-muted-foreground">
                <p className="mb-1">推理:</p>
                <p className="whitespace-pre-wrap">{file.classification.reasoning}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Content */}
      {file.content && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              文件内容
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {file.content.summary && (
              <div>
                <p className="text-sm font-medium mb-1">摘要</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{file.content.summary}</p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium mb-1">完整文本</p>
              <pre className="text-sm whitespace-pre-wrap max-h-96 overflow-y-auto text-muted-foreground">
                {file.content.rawText}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
