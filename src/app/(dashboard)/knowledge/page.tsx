"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BookOpen, FileText, StickyNote, ChevronLeft, ChevronRight, 
  ExternalLink, Search, Database, FileCheck, FileClock,
  Layers, ArrowUpRight, Filter, SortAsc
} from "lucide-react";
import useSWR from "swr";
import { useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// 高亮关键字组件
function HighlightText({ text, highlight, maxLen }: { text: string; highlight: string; maxLen?: number }) {
  if (!text) return <></>;
  
  const displayText = maxLen && text.length > maxLen 
    ? text.slice(0, maxLen) + "..."
    : text;
  
  if (!highlight) return <>{displayText}</>;
  
  const parts = displayText.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <mark key={i} className="bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200 px-0.5 rounded">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

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

export default function KnowledgePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [sourceType, setSourceType] = useState<string>("");
  const [page, setPage] = useState(1);
  const [localSearch, setLocalSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grouped" | "list">("grouped");

  // 直接从 URL 获取搜索词
  const searchQuery = searchParams.get("q") || "";

  const queryParams = new URLSearchParams();
  if (sourceType) queryParams.set("sourceType", sourceType);
  if (searchQuery) queryParams.set("q", searchQuery);
  queryParams.set("page", String(page));
  queryParams.set("limit", "30");

  const { data: entries = [] } = useSWR<KnowledgeEntry[]>(
    `/api/knowledge?${queryParams}`,
    fetcher
  );

  // 统计信息
  const stats = useMemo(() => {
    const total = entries.length;
    const fileCount = entries.filter(e => e.sourceType === "file").length;
    const noteCount = entries.filter(e => e.sourceType === "note").length;
    const sources = new Set(entries.map(e => e.sourceName)).size;
    return { total, fileCount, noteCount, sources };
  }, [entries]);

  // 按来源分组
  const groupedEntries = useMemo(() => {
    const groups: Record<string, KnowledgeEntry[]> = {};
    entries.forEach(entry => {
      const key = entry.sourceName || "未知来源";
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    });
    return groups;
  }, [entries]);

  // 点击跳转到文件或笔记
  const handleEntryClick = (entry: KnowledgeEntry) => {
    if (entry.fileId) {
      router.push(`/files/${entry.fileId}`);
    } else if (entry.noteId) {
      router.push(`/notes`);
    }
  };

  // 搜索处理
  const handleSearch = () => {
    if (localSearch.trim()) {
      router.push(`/knowledge?q=${encodeURIComponent(localSearch.trim())}`);
      setPage(1);
    } else if (searchQuery) {
      router.push(`/knowledge`);
    }
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return "今天";
    if (days === 1) return "昨天";
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-muted/20">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Database className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold">知识库</h1>
                  <p className="text-xs text-muted-foreground">
                    索引片段 · 语义检索
                  </p>
                </div>
              </div>
              
              {/* Quick stats */}
              <div className="flex items-center gap-1 ml-4 pl-4 border-l">
                <Badge variant="secondary" className="font-normal">
                  <Layers className="h-3 w-3 mr-1" />
                  {stats.total} 片段
                </Badge>
                <Badge variant="secondary" className="font-normal">
                  <FileCheck className="h-3 w-3 mr-1 text-blue-500" />
                  {stats.fileCount} 文件
                </Badge>
                <Badge variant="secondary" className="font-normal">
                  <StickyNote className="h-3 w-3 mr-1 text-amber-500" />
                  {stats.noteCount} 笔记
                </Badge>
              </div>
            </div>
            
            {/* Search */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="搜索知识库..."
                  className="w-72 pl-9 h-9 bg-background"
                />
              </div>
              <Button size="sm" onClick={handleSearch}>
                搜索
              </Button>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-2 border-t bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground mr-2">筛选:</span>
            {[
              { label: "全部", value: "" },
              { label: "文件", value: "file" },
              { label: "笔记", value: "note" },
            ].map((opt) => (
              <Button
                key={opt.value}
                variant={sourceType === opt.value ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => { setSourceType(opt.value); setPage(1); }}
              >
                {opt.label}
              </Button>
            ))}
            
            {searchQuery && (
              <div className="flex items-center gap-2 ml-2 pl-2 border-l">
                <Badge variant="outline" className="text-xs">
                  搜索: {searchQuery}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => router.push("/knowledge")}
                >
                  清除
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <SortAsc className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground mr-1">视图:</span>
            <Select value={viewMode} onValueChange={(v) => setViewMode(v as "grouped" | "list")}>
              <SelectTrigger className="w-28 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="grouped">按来源分组</SelectItem>
                <SelectItem value="list">平铺列表</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <div className="p-4 rounded-full bg-muted/50 mb-4">
              <BookOpen className="h-8 w-8 opacity-40" />
            </div>
            <p className="text-base font-medium">暂无知识条目</p>
            <p className="text-sm mt-1 text-muted-foreground/70">
              添加文件夹并运行处理管线以生成知识库
            </p>
          </div>
        ) : viewMode === "grouped" ? (
          // Grouped view
          <div className="p-4 space-y-3">
            {Object.entries(groupedEntries).map(([sourceName, sourceEntries]) => (
              <Card key={sourceName} className="overflow-hidden border-l-2 border-l-primary/20">
                {/* Source header */}
                <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/40 border-b">
                  <div className={`p-1.5 rounded-md ${
                    sourceEntries[0]?.sourceType === "file" 
                      ? "bg-blue-500/10 text-blue-600" 
                      : "bg-amber-500/10 text-amber-600"
                  }`}>
                    {sourceEntries[0]?.sourceType === "file" ? (
                      <FileText className="h-4 w-4" />
                    ) : (
                      <StickyNote className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{sourceName}</p>
                    <p className="text-xs text-muted-foreground">
                      {sourceEntries.length} 个知识片段
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs font-normal">
                    {sourceEntries[0]?.sourceType === "file" ? "文件" : "笔记"}
                  </Badge>
                </div>

                {/* Entries */}
                <div className="divide-y">
                  {sourceEntries.slice(0, 5).map((entry, idx) => (
                    <div
                      key={entry.id}
                      className="group flex items-start gap-3 px-4 py-3 hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => handleEntryClick(entry)}
                    >
                      {/* Index */}
                      <div className="flex items-center justify-center w-5 h-5 rounded text-[10px] font-medium bg-muted text-muted-foreground shrink-0 mt-1">
                        {entry.chunkIndex + 1}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground/90 mb-1">
                          <HighlightText 
                            text={entry.title || `知识片段 #${entry.chunkIndex + 1}`} 
                            highlight={searchQuery}
                            maxLen={50}
                          />
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                          <HighlightText 
                            text={entry.content} 
                            highlight={searchQuery}
                            maxLen={120}
                          />
                        </p>
                      </div>

                      {/* Meta */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-muted-foreground/60">
                          {formatTime(entry.createdAt)}
                        </span>
                        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
                
                {sourceEntries.length > 5 && (
                  <div className="px-4 py-2 bg-muted/20 border-t">
                    <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                      显示全部 {sourceEntries.length} 个片段
                    </button>
                  </div>
                )}
              </Card>
            ))}

            {/* Pagination */}
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                上一页
              </Button>
              <div className="px-4 py-1.5 rounded-md bg-muted text-xs text-muted-foreground">
                第 {page} 页
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={entries.length < 30}
              >
                下一页
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        ) : (
          // List view
          <div className="p-4">
            <div className="bg-background rounded-lg border">
              <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-4 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/30">
                <div className="w-8">#</div>
                <div>内容</div>
                <div className="w-20 text-center">来源</div>
                <div className="w-24 text-right">时间</div>
              </div>
              <div className="divide-y">
                {entries.map((entry, idx) => (
                  <div
                    key={entry.id}
                    className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-4 py-3 hover:bg-muted/30 cursor-pointer transition-colors group"
                    onClick={() => handleEntryClick(entry)}
                  >
                    <div className="w-8 flex items-center justify-center">
                      <span className="text-xs text-muted-foreground">{(page - 1) * 30 + idx + 1}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate mb-0.5">
                        <HighlightText 
                          text={entry.title || `片段 #${entry.chunkIndex + 1}`} 
                          highlight={searchQuery}
                          maxLen={60}
                        />
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        <HighlightText 
                          text={entry.content} 
                          highlight={searchQuery}
                          maxLen={80}
                        />
                      </p>
                    </div>
                    <div className="w-20 flex items-center justify-center">
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {entry.sourceType === "file" ? "文件" : "笔记"}
                      </Badge>
                    </div>
                    <div className="w-24 flex items-center justify-end gap-1 text-xs text-muted-foreground">
                      {formatTime(entry.createdAt)}
                      <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                上一页
              </Button>
              <div className="px-4 py-1.5 rounded-md bg-muted text-xs text-muted-foreground">
                第 {page} 页
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={entries.length < 30}
              >
                下一页
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
