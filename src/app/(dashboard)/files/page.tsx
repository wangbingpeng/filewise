"use client";

import { FolderPicker, type FileEntry } from "@/components/files/folder-picker";
import { FileCard } from "@/components/files/file-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderOpen, Play, Trash2, Loader2, RefreshCw, FileText, FileType, File as FileIcon, AlertCircle, ChevronRight, ChevronDown, Folder } from "lucide-react";
import useSWR, { mutate } from "swr";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const SYNC_INTERVAL = 10000; // 10 seconds

const STATUS_LABELS: Record<string, string> = {
  pending: "待处理",
  discovered: "已发现",
  scanning: "扫描中",
  ready: "就绪",
  error: "错误",
};

const EXT_ICONS: Record<string, typeof FileText> = {
  pdf: FileType,
  docx: FileText,
  doc: FileText,
  md: FileText,
  txt: FileIcon,
};

function getFileIcon(extension: string) {
  return EXT_ICONS[extension.toLowerCase()] || FileIcon;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Folder {
  id: string;
  name: string;
  path: string;
  fileCount: number;
  status: string;
}

interface FileInfo {
  id: string;
  fileName: string;
  relativePath: string;
  extension: string;
  sizeBytes: number;
  status: string;
  errorMessage?: string | null;
}

export default function FilesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderIdFromUrl = searchParams.get("folderId");
  
  const { data: folderList = [] } = useSWR<Folder[]>("/api/folders", fetcher);
  // 从 URL 参数初始化 selectedFolderId，避免刷新时跳转
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(folderIdFromUrl || null);
  
  // 分页状态
  const [page, setPage] = useState(1);
  const [allFiles, setAllFiles] = useState<FileInfo[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewMode, setViewMode] = useState<"tree" | "grid">("tree"); // 视图模式
  
  // 根据视图模式决定limit：树形视图不分页，卡片视图分页
  const limit = viewMode === "tree" ? 10000 : 100;
  
  // 使用 SWR 获取数据
  const { data: filesPage, mutate: mutateFiles, isLoading: filesLoading } = useSWR(
    selectedFolderId ? `/api/files?folderId=${selectedFolderId}&page=1&limit=${limit}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 0,
      // 关键：每次key变化都重新验证
      revalidateIfStale: true,
    }
  );
  
  const [processing, setProcessing] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncResult, setSyncResult] = useState<{ added: number; removed: number } | null>(null);
  const [pipelineProgress, setPipelineProgress] = useState<{
    isRunning: boolean;
    currentStage: string;
    completedStages: number;
    totalStages: number;
    estimatedTimeRemaining: number | null;
    stages: Array<{
      stage: string;
      status: string;
      progress: number;
      totalItems: number;
      processedItems: number;
      estimatedTimeRemaining?: number | null;
    }>;
  } | null>(null);
  const dedupRan = useRef(false);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const urlFolderHandled = useRef(false);
  const progressPollRef = useRef<NodeJS.Timeout | null>(null);

  // 监听 filesPage 变化，更新 allFiles
  const currentFolderIdRef = useRef<string | null>(null);
  const isLoadingMoreRef = useRef(false);  // 标记是否正在加载更多
  
  useEffect(() => {
    console.log('[FilesPage] filesPage changed:', {
      hasFiles: !!filesPage?.files,
      fileCount: filesPage?.files?.length,
      hasMore: filesPage?.hasMore,
      folderId: selectedFolderId,
      currentFolderIdRef: currentFolderIdRef.current,
      isLoadingMore: isLoadingMoreRef.current
    });
    
    // 只处理当前选中文件夹的数据
    if (filesPage?.files && selectedFolderId === currentFolderIdRef.current) {
      // 如果是加载更多，不要覆盖allFiles（因为loadMore已经追加了数据）
      if (isLoadingMoreRef.current) {
        console.log('[FilesPage] Skip update during loadMore');
        isLoadingMoreRef.current = false;
        return;
      }
      
      console.log('[FilesPage] Setting allFiles to:', filesPage.files.length, 'files');
      setAllFiles(filesPage.files);
      setHasMore(filesPage.hasMore);
      setLoadingMore(false);
    }
  }, [filesPage, selectedFolderId]);

  // 切换文件夹时重置
  useEffect(() => {
    console.log('[FilesPage] Folder changed to:', selectedFolderId);
    if (selectedFolderId) {
      console.log('[FilesPage] Resetting state and fetching new data...');
      // 先记录当前要加载的文件夹ID
      currentFolderIdRef.current = selectedFolderId;
      // 清空旧数据
      setAllFiles([]);
      setPage(1);
      setHasMore(true);
      setLoadingMore(false);
      // 强制 SWR 重新获取（清除缓存）
      mutateFiles(undefined, { revalidate: true });
      
      // 检查 pipeline 进度
      fetchPipelineProgress();
      startProgressPolling();
    } else {
      stopProgressPolling();
    }
    
    return () => {
      stopProgressPolling();
    };
  }, [selectedFolderId]);

  const fetchPipelineProgress = async () => {
    if (!selectedFolderId) return;
    try {
      const res = await fetch(`/api/pipeline/progress?folderId=${selectedFolderId}`);
      const data = await res.json();
      if (data.success) {
        setPipelineProgress(data.progress);
        // 如果有正在运行的任务，设置 processing 状态
        if (data.progress.isRunning) {
          setProcessing(true);
        }
      }
    } catch (error) {
      console.error("Failed to fetch pipeline progress:", error);
    }
  };

  const startProgressPolling = () => {
    stopProgressPolling();
    
    // 每 2 秒轮询一次进度
    progressPollRef.current = setInterval(() => {
      fetchPipelineProgress();
    }, 2000);
  };

  const stopProgressPolling = () => {
    if (progressPollRef.current) {
      clearInterval(progressPollRef.current);
      progressPollRef.current = null;
    }
  };

  // 加载更多
  const loadMore = async () => {
    console.log('[loadMore] Called with:', { hasMore, loadingMore, selectedFolderId, page });
    
    if (!hasMore || loadingMore || !selectedFolderId) {
      console.log('[loadMore] Early return:', { hasMore, loadingMore, selectedFolderId });
      return;
    }
    
    console.log('[loadMore] Starting to load page', page + 1);
    setLoadingMore(true);
    isLoadingMoreRef.current = true;  // 标记正在加载更多
    const nextPage = page + 1;
    try {
      const res = await fetch(`/api/files?folderId=${selectedFolderId}&page=${nextPage}&limit=100`);
      const data = await res.json();
      console.log('[loadMore] Received data:', { 
        fileCount: data.files?.length, 
        hasMore: data.hasMore,
        total: data.total 
      });
      
      if (data.files) {
        // 追加到现有数据
        setAllFiles(prev => {
          const newFiles = [...prev, ...data.files];
          console.log('[loadMore] Updated allFiles:', newFiles.length, 'files');
          return newFiles;
        });
        setHasMore(data.hasMore);
        setPage(nextPage);
      }
    } catch (error) {
      console.error('[loadMore] Error:', error);
    } finally {
      console.log('[loadMore] Finally block');
      // 确保无论成功失败都重置loading状态
      setLoadingMore(false);
      // 注意：不重置 isLoadingMoreRef，让 useEffect 处理
    }
  };

  // filesData 用于兼容旧代码
  const filesData = allFiles;

  // Handle folderId from URL (once when folderList loads)
  useEffect(() => {
    if (urlFolderHandled.current) return;
    
    // 只在首次加载且URL有folderId时才处理
    if (folderIdFromUrl && folderList.length > 0) {
      const folderExists = folderList.some(f => f.id === folderIdFromUrl);
      if (folderExists) {
        setSelectedFolderId(folderIdFromUrl);
        urlFolderHandled.current = true;
      }
    }
  }, [folderIdFromUrl, folderList]);

  // 切换文件夹时更新URL
  useEffect(() => {
    if (selectedFolderId) {
      const url = new URL(window.location.href);
      url.searchParams.set('folderId', selectedFolderId);
      window.history.replaceState({}, '', url.toString());
    }
  }, [selectedFolderId]);

  // Auto-dedup on first load
  useEffect(() => {
    if (dedupRan.current) return;
    dedupRan.current = true;
    fetch("/api/folders/dedup", { method: "POST" })
      .then((r) => r.json())
      .then((result) => {
        if (result.removed > 0) {
          mutate("/api/folders");
          mutate("/api/stats");
        }
      })
      .catch(() => {});
  }, []);

  // Auto-sync function
  const runSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/folders/sync", { method: "POST" });
      const data = await res.json();
      console.log("[Sync] Result:", data);
      if (data.hasChanges) {
        // Calculate total changes
        const totalAdded = data.results?.reduce((sum: number, r: { added: number }) => sum + r.added, 0) || 0;
        const totalRemoved = data.results?.reduce((sum: number, r: { removed: number }) => sum + r.removed, 0) || 0;
        
        console.log(`[Sync] Changes detected: +${totalAdded} -${totalRemoved}`);
        
        if (totalAdded > 0 || totalRemoved > 0) {
          setSyncResult({ added: totalAdded, removed: totalRemoved });
          // Auto-hide after 5 seconds
          setTimeout(() => setSyncResult(null), 5000);
        }
        
        // Refresh folder list and files if changes detected
        mutate("/api/folders");
        mutate("/api/stats");
        if (selectedFolderId) {
          mutate(`/api/files?folderId=${selectedFolderId}`);
        }
      }
      setLastSyncTime(new Date());
    } catch (err) {
      console.error("[Sync] Error:", err);
    } finally {
      setSyncing(false);
    }
  }, [selectedFolderId]);

  // 移除自动同步，改为手动触发（避免页面加载慢）
  // 用户点击"同步文件夹"按钮时才执行同步

  const handleFolderSelected = async (folderPath: string, entries?: FileEntry[], displayName?: string) => {
    // entries !== undefined means browser-selected (File System Access API or file input)
    // entries === undefined means manually typed server path
    const isBrowserMode = entries !== undefined;

    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: folderPath,
        name: displayName || folderPath.split("/").filter(Boolean).pop() || folderPath,
      }),
    });
    const folder = await res.json();
    mutate("/api/folders");
    mutate("/api/stats");
    setSelectedFolderId(folder.id);
    setScanError(null);

    if (isBrowserMode) {
      // Browser mode: upload files directly
      if (entries.length > 0) {
        setProcessing(true);
        try {
          const formData = new FormData();
          formData.append("folderId", folder.id);
          for (const entry of entries) {
            if (entry.file) {
              formData.append("files", entry.file);
              formData.append("paths", entry.relativePath);
            }
          }
          await fetch("/api/files/upload", { method: "POST", body: formData });
          mutate(`/api/files?folderId=${folder.id}`);
          mutate("/api/folders");
          mutate("/api/stats");
        } finally {
          setProcessing(false);
        }
      } else {
        setScanError("所选文件夹中没有支持的文件类型 (PDF/DOCX/TXT/MD)");
      }
    } else {
      // Server-side path mode: automatically scan
      setProcessing(true);
      try {
        const scanRes = await fetch("/api/pipeline/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: folder.id }),
        });
        const scanResult = await scanRes.json();
        if (!scanRes.ok) {
          setScanError(scanResult.error || "扫描失败");
        } else {
          setScanError(null);
        }
        mutate(`/api/files?folderId=${folder.id}`);
        mutate("/api/folders");
        mutate("/api/stats");
      } finally {
        setProcessing(false);
      }
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    await fetch(`/api/folders/${folderId}`, { method: "DELETE" });
    mutate("/api/folders");
    mutate("/api/stats");
    if (selectedFolderId === folderId) setSelectedFolderId(null);
  };

  const handleOpenFolder = async (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/files/${fileId}/open-folder`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "无法打开文件夹");
      }
    } catch (err) {
      alert("打开文件夹失败: " + String(err));
    }
  };

  // Build tree structure from flat file list
  const buildFileTree = (files: any[]) => {
    const root: any = { name: 'root', type: 'folder', children: [], files: [] };
    
    files.forEach(file => {
      const pathParts = file.relativePath ? file.relativePath.split('/') : [file.fileName];
      let current = root;
      
      // Navigate or create folders
      for (let i = 0; i < pathParts.length - 1; i++) {
        const folderName = pathParts[i];
        let folder = current.children.find((c: any) => c.name === folderName && c.type === 'folder');
        
        if (!folder) {
          folder = { name: folderName, type: 'folder', children: [], files: [] };
          current.children.push(folder);
        }
        current = folder;
      }
      
      // Add file to the current folder
      current.files.push({
        ...file,
        fileName: pathParts[pathParts.length - 1]
      });
    });
    
    // 返回一个包含根文件和子文件夹的结构
    // 这样可以显示根目录下的文件和子文件夹
    return [{
      name: 'root',
      type: 'folder',
      children: root.children,
      files: root.files  // 根目录文件
    }];
  };

  // 展开状态管理：使用节点路径作为 key
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['root']));
  
  const toggleNode = useCallback((nodePath: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodePath)) {
        next.delete(nodePath);
      } else {
        next.add(nodePath);
      }
      return next;
    });
  }, []);

  // TreeNode component
  const TreeNode = ({ node, depth = 0, nodePath = 'root' }: { node: any; depth?: number; nodePath?: string }) => {
    const isExpanded = expandedNodes.has(nodePath);
    const isFolder = node.type === 'folder';
    const isRoot = node.name === 'root';
    
    if (isFolder) {
      return (
        <div>
          {/* 根节点不显示文件夹头部，直接显示内容 */}
          {!isRoot && (
            <button
              onClick={() => toggleNode(nodePath)}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-accent/50 text-sm transition-colors"
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <Folder className="h-4 w-4 text-[#0D6EFD] shrink-0" />
              <span className="font-medium truncate">{node.name}</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {node.children.length + node.files.length} 项
              </span>
            </button>
          )}
          {(isExpanded || isRoot) && (
            <div>
              {/* 先显示子文件夹 */}
              {node.children.map((child: any, idx: number) => (
                <TreeNode 
                  key={`folder-${child.name}-${idx}`} 
                  node={child} 
                  depth={isRoot ? 0 : depth + 1} 
                  nodePath={`${nodePath}/${child.name}`}
                />
              ))}
              {/* 再显示文件 */}
              {node.files.map((file: any, idx: number) => (
                <FileTreeNode key={`file-${file.id || idx}`} file={file} depth={isRoot ? 0 : depth + 1} />
              ))}
            </div>
          )}
        </div>
      );
    }
    
    return null;
  };

  // File node component
  const FileTreeNode = ({ file, depth = 0 }: { file: any; depth?: number }) => {
    return (
      <div
        onClick={() => router.push(`/files/${file.id}`)}
        className={cn(
          "group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50 cursor-pointer transition-colors",
          file.status === "error" && "bg-destructive/5 hover:bg-destructive/10"
        )}
        style={{ paddingLeft: `${depth * 12 + 28}px` }}
      >
        {(() => {
          const IconComponent = getFileIcon(file.extension);
          return (
            <div className={cn(
              "flex items-center justify-center w-6 h-6 rounded shrink-0",
              file.status === "error" ? "bg-destructive/10" : "bg-[#F1F3F5]"
            )}>
              {file.status === "error" ? (
                <AlertCircle className="h-3.5 w-3.5 text-destructive" />
              ) : (
                <IconComponent className="h-3.5 w-3.5 text-[#6C757D]" />
              )}
            </div>
          );
        })()}
        <span className={cn(
          "text-sm truncate flex-1",
          file.status === "error" && "text-destructive"
        )}>
          {file.fileName}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">
          {formatFileSize(file.sizeBytes)}
        </span>
        <span className={cn(
          "text-xs px-1.5 py-0.5 rounded shrink-0",
          file.status === "error" && "bg-[#F8D7DA] text-[#DC3545]",
          file.status === "indexed" && "bg-[#D1E7DD] text-[#0F5132]",
          file.status === "classified" && "bg-[#FFF3CD] text-[#664D03]",
          (file.status === "discovered" || file.status === "pending") && "bg-[#E2E3E5] text-[#41464B]"
        )}>
          {STATUS_LABELS[file.status] || file.status}
        </span>
      </div>
    );
  };

  const handleSyncFolder = async () => {
    if (!selectedFolderId || !selectedFolder) return;
    
    // 检查是否是浏览器上传的文件夹
    const isBrowserFolder = selectedFolder.path.startsWith("/浏览器上传/") || selectedFolder.path.includes("data/uploads/");
    if (isBrowserFolder) {
      alert("浏览器上传的文件夹不支持同步功能");
      return;
    }
    
    setSyncing(true);
    setScanError(null);
    
    try {
      const res = await fetch(`/api/folders/${selectedFolderId}/sync`, {
        method: "POST",
      });
      const data = await res.json();
      
      if (!res.ok) {
        setScanError(data.error || "同步失败");
        return;
      }
      
      console.log("[Sync Folder] Result:", data);
      
      // 显示同步结果
      if (data.added > 0 || data.removed > 0) {
        setSyncResult({ added: data.added, removed: data.removed });
        setTimeout(() => setSyncResult(null), 5000);
      }
      
      // 刷新数据
      mutate(`/api/files?folderId=${selectedFolderId}`);
      mutate("/api/folders");
      mutate("/api/stats");
      setLastSyncTime(new Date());
    } catch (error) {
      console.error("[Sync Folder] Error:", error);
      setScanError("同步失败: " + String(error));
    } finally {
      setSyncing(false);
    }
  };

  const handleStartPipeline = async () => {
    if (!selectedFolderId || !selectedFolder) return;
    setProcessing(true);
    setScanError(null);

    try {
      // Browser-uploaded folders have path starting with "/浏览器上传/" or pointing to data/uploads/
      // For these, files are already in DB from upload, skip scan and go to extract
      const isBrowserFolder = selectedFolder.path.startsWith("/浏览器上传/") || selectedFolder.path.includes("data/uploads/");

      // Step 1: Scan (skip for browser folders)
      if (!isBrowserFolder) {
        const scanRes = await fetch("/api/pipeline/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: selectedFolderId }),
        });
        if (!scanRes.ok) {
          const r = await scanRes.json();
          setScanError(r.error || "扫描失败");
          return;
        }
      }

      // Step 2: Extract
      const extractRes = await fetch("/api/pipeline/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: selectedFolderId }),
      });
      if (!extractRes.ok) {
        const r = await extractRes.json();
        setScanError(r.error || "提取失败");
        return;
      }

      // Step 3: Classify (AI categorization)
      await fetch("/api/pipeline/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: selectedFolderId }),
      });

      // Step 4: Index (embeddings for search)
      await fetch("/api/pipeline/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: selectedFolderId }),
      });

      // Step 5: Graph (knowledge graph extraction)
      await fetch("/api/pipeline/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: selectedFolderId }),
      });

      mutate(`/api/files?folderId=${selectedFolderId}`);
      mutate("/api/folders");
      mutate("/api/stats");
      
      // 刷新进度
      await fetchPipelineProgress();
    } catch (error) {
      setScanError("处理失败: " + String(error));
    } finally {
      setProcessing(false);
      // 完成后继续轮询 10 秒以确认状态
      setTimeout(() => {
        fetchPipelineProgress();
      }, 1000);
    }
  };

  const selectedFolder = folderList.find((f) => f.id === selectedFolderId);

  const formatTime = (date: Date | null) => {
    if (!date) return "未同步";
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const getStageName = (stage: string) => {
    const names: Record<string, string> = {
      scan: "扫描文件",
      extract: "提取内容",
      classify: "智能分类",
      index: "向量索引",
      graph: "知识图谱",
    };
    return names[stage] || stage;
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds === null || seconds === undefined) return "计算中...";
    if (seconds < 60) return `约${seconds}秒`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) {
      return remainingSeconds > 0 ? `约${minutes}分${remainingSeconds}秒` : `约${minutes}分钟`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `约${hours}小时${remainingMinutes}分钟` : `约${hours}小时`;
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sync result notification */}
      {syncResult && (
        <div className="fixed top-16 right-4 z-50 bg-card border rounded-lg shadow-lg p-3 flex items-center gap-3 animate-in slide-in-from-right">
            <RefreshCw className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-medium">文件变化已同步</p>
              <p className="text-xs text-muted-foreground">
                {syncResult.added > 0 && `新增 ${syncResult.added} 个文件`}
                {syncResult.added > 0 && syncResult.removed > 0 && " · "}
                {syncResult.removed > 0 && `移除 ${syncResult.removed} 个文件`}
              </p>
            </div>
            <button 
              onClick={() => setSyncResult(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              ×
            </button>
        </div>
      )}
      
      {/* Folder List Sidebar */}
      <div className="w-64 border-r flex flex-col shrink-0">
        <div className="p-3 border-b space-y-2">
          <FolderPicker onFolderSelected={handleFolderSelected} />
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              已注册文件夹
            </p>
            <button 
              onClick={() => runSync()}
              disabled={syncing}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="点击手动同步"
            >
              {syncing ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              <span className="text-[10px]">{formatTime(lastSyncTime)}</span>
            </button>
          </div>
        </div>
        <ScrollArea className="flex-1">
          {folderList.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              暂无文件夹，请添加
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {folderList.map((folder) => (
                <div
                  key={folder.id}
                  className={`group flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedFolderId === folder.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  }`}
                >
                  <button
                    onClick={() => { setSelectedFolderId(folder.id); setScanError(null); }}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{folder.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {folder.path}
                      </p>
                    </div>
                  </button>
                  <button
                    onClick={() => handleDeleteFolder(folder.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded transition-opacity"
                    title="删除文件夹"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* File List */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedFolder ? (
          <>
            <div className="flex items-center justify-between p-4 border-b">
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{selectedFolder.name}</h2>
                <p className="text-xs text-muted-foreground truncate">
                  源路径：{selectedFolder.path}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={selectedFolder.status === "error" ? "destructive" : selectedFolder.status === "ready" ? "default" : "secondary"}>
                  {STATUS_LABELS[selectedFolder.status] || selectedFolder.status}
                </Badge>
                <Button size="sm" onClick={handleSyncFolder} disabled={syncing}>
                  {syncing ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  {syncing ? "同步中..." : "同步"}
                </Button>
                <Button size="sm" onClick={handleStartPipeline} disabled={processing}>
                  {processing ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-1" />
                  )}
                  {processing ? "处理中..." : "开始处理"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleDeleteFolder(selectedFolder.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 space-y-2">
                {/* Show pending files notice */}
                {filesData.some(f => f.status === "discovered" || f.status === "pending") && (
                  <div className="p-3 rounded-lg bg-primary/10 text-primary text-sm mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4" />
                      <span>发现 {filesData.filter(f => f.status === "discovered" || f.status === "pending").length} 个新文件待处理</span>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={handleStartPipeline}
                      disabled={processing}
                    >
                      立即处理
                    </Button>
                  </div>
                )}
                {scanError && (
                  <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm mb-2">
                    <p className="font-medium">扫描失败</p>
                    <p className="text-xs mt-1">{scanError}</p>
                  </div>
                )}
                
                {/* Pipeline Progress */}
                {pipelineProgress && pipelineProgress.isRunning && (
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 mb-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="text-sm font-medium">正在处理: {getStageName(pipelineProgress.currentStage)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {pipelineProgress.estimatedTimeRemaining !== null && (
                          <span className="text-xs text-primary font-medium">
                            预计剩余: {formatDuration(pipelineProgress.estimatedTimeRemaining)}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {pipelineProgress.completedStages}/{pipelineProgress.totalStages} 阶段完成
                        </span>
                      </div>
                    </div>
                    
                    {/* Stage Progress */}
                    <div className="space-y-2">
                      {pipelineProgress.stages.map((stage) => (
                        <div key={stage.stage} className="flex items-center gap-2">
                          <div className="w-20 text-xs text-muted-foreground">
                            {getStageName(stage.stage)}
                          </div>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full transition-all",
                                stage.status === "completed" ? "bg-primary" :
                                stage.status === "running" ? "bg-primary/60 animate-pulse" :
                                "bg-muted-foreground/20"
                              )}
                              style={{ width: `${stage.progress}%` }}
                            />
                          </div>
                          <div className="w-24 text-xs text-right text-muted-foreground flex flex-col items-end gap-0.5">
                            <div>
                              {stage.status === "completed" ? "✓" :
                               stage.status === "running" ? `${stage.progress}%` :
                               "待处理"}
                            </div>
                            {stage.status === "running" && stage.estimatedTimeRemaining !== null && stage.estimatedTimeRemaining !== undefined && stage.estimatedTimeRemaining > 0 && (
                              <div className="text-[10px] text-primary/70">
                                {formatDuration(stage.estimatedTimeRemaining)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {filesLoading ? (
                  <div className="text-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-[#0D6EFD]" />
                    <p className="text-muted-foreground">加载文件中...</p>
                  </div>
                ) : filesData.length === 0 && !scanError ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>暂无文件</p>
                    <p className="text-sm mt-1">点击“开始处理”扫描文件夹</p>
                  </div>
                ) : (
                  <>
                    {/* View mode toggle */}
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-muted-foreground">
                        共 {filesData.length} 个文件
                      </p>
                      <div className="flex items-center gap-1 bg-[#F1F3F5] p-1 rounded-lg">
                        <button
                          onClick={() => setViewMode("tree")}
                          className={cn(
                            "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                            viewMode === "tree" 
                              ? "bg-white text-[#212529] shadow-sm" 
                              : "text-[#6C757D] hover:text-[#212529]"
                          )}
                        >
                          <Folder className="h-3.5 w-3.5 inline mr-1" />
                          树形
                        </button>
                        <button
                          onClick={() => setViewMode("grid")}
                          className={cn(
                            "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                            viewMode === "grid" 
                              ? "bg-white text-[#212529] shadow-sm" 
                              : "text-[#6C757D] hover:text-[#212529]"
                          )}
                        >
                          <FileText className="h-3.5 w-3.5 inline mr-1" />
                          卡片
                        </button>
                      </div>
                    </div>

                    {/* File list */}
                    {viewMode === "tree" ? (
                      // Tree view
                      <div className="space-y-1">
                        {buildFileTree(filesData).map((node: any, idx: number) => (
                          <TreeNode key={idx} node={node} />
                        ))}
                      </div>
                    ) : (
                      // Grid view
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {filesData.map((file) => (
                      <div
                        key={file.id}
                        onClick={() => router.push(`/files/${file.id}`)}
                        className={cn(
                          "group p-4 rounded-xl border-2 transition-all cursor-pointer hover:shadow-md",
                          file.status === "error" 
                            ? "border-destructive/30 bg-destructive/5 hover:border-destructive/50" 
                            : "border-[#E9ECEF] bg-white hover:border-[#0D6EFD]/30"
                        )}
                      >
                        {/* File header with icon and name */}
                        <div className="flex items-start gap-3 mb-3">
                          {(() => {
                            const IconComponent = getFileIcon(file.extension);
                            return (
                              <div className={cn(
                                "flex items-center justify-center w-10 h-10 rounded-lg shrink-0",
                                file.status === "error" ? "bg-destructive/10" : "bg-[#F1F3F5]"
                              )}>
                                {file.status === "error" ? (
                                  <AlertCircle className="h-5 w-5 text-destructive" />
                                ) : (
                                  <IconComponent className="h-5 w-5 text-[#6C757D]" />
                                )}
                              </div>
                            );
                          })()}
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              "text-sm font-semibold truncate",
                              file.status === "error" && "text-destructive"
                            )}>
                              {file.fileName}
                            </p>
                            {file.relativePath && (
                              <p className="text-xs text-[#ADB5BD] mt-0.5 truncate">
                                {file.relativePath}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#E7F1FF] text-[#0D6EFD]">
                            {file.extension.toUpperCase()}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#F1F3F5] text-[#495057]">
                            {formatFileSize(file.sizeBytes)}
                          </span>
                          <span className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                            file.status === "error" && "bg-[#F8D7DA] text-[#DC3545]",
                            file.status === "indexed" && "bg-[#D1E7DD] text-[#0F5132]",
                            file.status === "classified" && "bg-[#FFF3CD] text-[#664D03]",
                            (file.status === "discovered" || file.status === "pending") && "bg-[#E2E3E5] text-[#41464B]"
                          )}>
                            {STATUS_LABELS[file.status] || file.status}
                          </span>
                        </div>

                        {/* Error message */}
                        {file.status === "error" && file.errorMessage && (
                          <div className="mt-2 pt-2 border-t border-destructive/20">
                            <p className="text-xs text-destructive line-clamp-2">
                              {file.errorMessage}
                            </p>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#F1F3F5]">
                          <button
                            onClick={(e) => handleOpenFolder(file.id, e)}
                            className="flex items-center gap-1.5 text-xs text-[#6C757D] hover:text-[#0D6EFD] transition-colors"
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                            打开文件夹
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/files/${file.id}`);
                            }}
                            className="text-xs text-[#0D6EFD] hover:underline"
                          >
                            查看详情 →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                    )}
                    
                    {/* Load more button */}
                    {hasMore && (
                      <div className="flex justify-center mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={loadMore}
                          disabled={loadingMore}
                        >
                          {loadingMore ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              加载中...
                            </>
                          ) : (
                            <>加载更多 ({allFiles.length} / {filesPage?.total || allFiles.length})</>
                          )}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>选择一个文件夹查看文件</p>
              <p className="text-sm mt-1">或点击右上角添加新文件夹</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
