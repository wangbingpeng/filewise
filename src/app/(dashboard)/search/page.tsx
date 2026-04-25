"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BookOpen, FileText, StickyNote, ExternalLink, 
  Folder, Search, Loader2 
} from "lucide-react";
import useSWR from "swr";
import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface KnowledgeEntry {
  id: string;
  fileId: string | null;
  noteId: string | null;
  sourceType: string;
  chunkIndex: number;
  title: string | null;
  content: string;
  metadata: string | null;
  createdAt: number;
  sourceName: string;
  relevanceScore?: number;
}

interface Folder {
  id: string;
  name: string;
  path: string;
  fileCount: number;
  createdAt: number;
}

// 高亮关键字组件
function HighlightText({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight || !text) return <>{text}</>;
  
  const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
  
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === highlight.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 text-yellow-900 px-0.5 rounded">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // 直接从 URL 获取搜索词（同步）
  const searchQuery = searchParams.get("q") || "";
  
  const [activeTab, setActiveTab] = useState<"all" | "folders" | "knowledge">("all");

  // 搜索知识库
  const knowledgeParams = new URLSearchParams();
  if (searchQuery) knowledgeParams.set("q", searchQuery);
  knowledgeParams.set("limit", "50");

  const { data: knowledgeEntries = [], isLoading: knowledgeLoading } = useSWR<KnowledgeEntry[]>(
    searchQuery ? `/api/knowledge?${knowledgeParams}` : null,
    fetcher
  );

  // 搜索文件夹（需要单独的API）
  const { data: folders = [], isLoading: foldersLoading } = useSWR<Folder[]>(
    searchQuery ? `/api/folders?q=${encodeURIComponent(searchQuery)}` : null,
    fetcher
  );

  // 点击跳转到文件或笔记
  const handleEntryClick = (entry: KnowledgeEntry) => {
    if (entry.fileId) {
      router.push(`/files/${entry.fileId}`);
    } else if (entry.noteId) {
      router.push(`/notes`);
    }
  };

  const isLoading = knowledgeLoading || foldersLoading;
  const hasResults = knowledgeEntries.length > 0 || folders.length > 0;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* 搜索词显示 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">搜索结果</h1>
        <p className="text-muted-foreground">
          搜索关键词：<span className="font-medium text-foreground">"{searchQuery}"</span>
        </p>
      </div>

      {/* 标签页切换 */}
      <div className="flex items-center gap-2 mb-6">
        <Button
          variant={activeTab === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("all")}
        >
          全部
        </Button>
        <Button
          variant={activeTab === "folders" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("folders")}
        >
          <Folder className="h-3 w-3 mr-1" />
          文件夹 ({folders.length})
        </Button>
        <Button
          variant={activeTab === "knowledge" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("knowledge")}
        >
          <BookOpen className="h-3 w-3 mr-1" />
          知识库 ({knowledgeEntries.length})
        </Button>
      </div>

      {/* 加载状态 */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#0D6EFD] mr-3" />
          <p className="text-muted-foreground">搜索中...</p>
        </div>
      )}

      {/* 无结果 */}
      {!isLoading && !hasResults && searchQuery && (
        <Card>
          <CardContent className="p-12 text-center">
            <Search className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-30" />
            <h3 className="text-lg font-medium mb-2">未找到相关结果</h3>
            <p className="text-muted-foreground">
              尝试使用不同的关键词进行搜索
            </p>
          </CardContent>
        </Card>
      )}

      {/* 搜索结果 */}
      {!isLoading && hasResults && (
        <div className="space-y-6">
          {/* 文件夹结果 */}
          {(activeTab === "all" || activeTab === "folders") && folders.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Folder className="h-5 w-5 text-[#0D6EFD]" />
                文件夹
              </h2>
              <div className="grid gap-3">
                {folders.map((folder) => (
                  <Link
                    key={folder.id}
                    href={`/files?folderId=${folder.id}`}
                    className="block"
                  >
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#E7F1FF] shrink-0">
                            <Folder className="h-5 w-5 text-[#0D6EFD]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium mb-1">
                              <HighlightText text={folder.name} highlight={searchQuery} />
                            </h3>
                            <p className="text-sm text-muted-foreground truncate">
                              {folder.path}
                            </p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              <span>{folder.fileCount} 个文件</span>
                              <span>{new Date(folder.createdAt).toLocaleDateString("zh-CN")}</span>
                            </div>
                          </div>
                          <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 知识库结果 */}
          {(activeTab === "all" || activeTab === "knowledge") && knowledgeEntries.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-[#0D6EFD]" />
                知识库
              </h2>
              <div className="space-y-3">
                {knowledgeEntries.map((entry) => (
                  <Card 
                    key={entry.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => handleEntryClick(entry)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <HighlightText 
                            text={entry.title || `片段 #${entry.chunkIndex + 1}`} 
                            highlight={searchQuery} 
                          />
                          {entry.relevanceScore && entry.relevanceScore > 0 && (
                            <Badge variant="default" className="text-xs">
                              相关度: {entry.relevanceScore}
                            </Badge>
                          )}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {entry.sourceType === "file" ? "文件" : "笔记"}
                          </Badge>
                          {entry.sourceName && (
                            <span className="text-xs text-muted-foreground">
                              <HighlightText text={entry.sourceName} highlight={searchQuery} />
                            </span>
                          )}
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                        <HighlightText text={entry.content} highlight={searchQuery} />
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(entry.createdAt).toLocaleString("zh-CN")}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 无搜索词 */}
      {!searchQuery && (
        <Card>
          <CardContent className="p-12 text-center">
            <Search className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-30" />
            <h3 className="text-lg font-medium mb-2">输入关键词开始搜索</h3>
            <p className="text-muted-foreground">
              可以搜索文件夹、文件内容、知识库条目和笔记
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
