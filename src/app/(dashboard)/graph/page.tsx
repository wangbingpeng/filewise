"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Network, Search, RefreshCw, FileText, Folder, LayoutGrid, GitBranch, Tag } from "lucide-react";
import useSWR from "swr";
import { useState, useCallback, useMemo } from "react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface GraphNode {
  id: string;
  name: string;
  entityType: string;
  description: string | null;
  mentionCount: number;
}

interface GraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationship: string;
  weight: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface FileNode {
  id: string;
  name: string;
  entityType: string;
  description: string | null;
  mentionCount: number;
}

interface EntityNode {
  id: string;
  name: string;
  entityType: string;
  description: string | null;
  mentionCount: number;
}

const TYPE_COLORS: Record<string, string> = {
  file: "#64748b",
  project: "#3b82f6",
  technology: "#8b5cf6",
  topic: "#f59e0b",
  person: "#ec4899",
  organization: "#10b981",
  concept: "#f59e0b",
  location: "#ef4444",
  event: "#06b6d4",
};

const TYPE_LABELS: Record<string, string> = {
  file: "文件",
  project: "项目",
  technology: "技术",
  topic: "主题",
  person: "人物",
  organization: "组织",
  concept: "概念",
  location: "地点",
  event: "事件",
};

const TAG_COLORS = [
  "bg-blue-100 text-blue-700 border-blue-200",
  "bg-purple-100 text-purple-700 border-purple-200",
  "bg-amber-100 text-amber-700 border-amber-200",
  "bg-green-100 text-green-700 border-green-200",
  "bg-pink-100 text-pink-700 border-pink-200",
  "bg-cyan-100 text-cyan-700 border-cyan-200",
  "bg-indigo-100 text-indigo-700 border-indigo-200",
];

export default function GraphPage() {
  const { data, mutate } = useSWR<GraphData>("/api/graph", fetcher);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isRebuilding, setIsRebuilding] = useState(false);

  const nodes = data?.nodes || [];
  const edges = data?.edges || [];

  // 分离文件节点和实体节点
  const fileNodes = useMemo(() => 
    nodes.filter(n => n.entityType === "file"), [nodes]);
  
  const entityNodes = useMemo(() => 
    nodes.filter(n => n.entityType !== "file"), [nodes]);

  // 构建文件到实体的映射（去重）
  const fileToEntities = useMemo(() => {
    const map = new Map<string, GraphNode[]>();
    edges.forEach(e => {
      // 正向：sourceNodeId 是文件，targetNodeId 是实体
      if (e.sourceNodeId && e.targetNodeId) {
        const sourceNode = nodes.find(n => n.id === e.sourceNodeId);
        const targetNode = nodes.find(n => n.id === e.targetNodeId);
        
        if (sourceNode && targetNode) {
          if (sourceNode.entityType === "file" && targetNode.entityType !== "file") {
            if (!map.has(sourceNode.id)) map.set(sourceNode.id, []);
            const arr = map.get(sourceNode.id)!;
            if (!arr.find(n => n.id === targetNode.id)) {
              arr.push(targetNode);
            }
          } else if (targetNode.entityType === "file" && sourceNode.entityType !== "file") {
            if (!map.has(targetNode.id)) map.set(targetNode.id, []);
            const arr = map.get(targetNode.id)!;
            if (!arr.find(n => n.id === sourceNode.id)) {
              arr.push(sourceNode);
            }
          }
        }
      }
    });
    return map;
  }, [nodes, edges]);

  // 构建实体到文件的映射（去重）
  const entityToFiles = useMemo(() => {
    const map = new Map<string, GraphNode[]>();
    edges.forEach(e => {
      if (e.sourceNodeId && e.targetNodeId) {
        const sourceNode = nodes.find(n => n.id === e.sourceNodeId);
        const targetNode = nodes.find(n => n.id === e.targetNodeId);
        
        if (sourceNode && targetNode) {
          if (sourceNode.entityType === "file" && targetNode.entityType !== "file") {
            if (!map.has(targetNode.id)) map.set(targetNode.id, []);
            const arr = map.get(targetNode.id)!;
            if (!arr.find(n => n.id === sourceNode.id)) {
              arr.push(sourceNode);
            }
          } else if (targetNode.entityType === "file" && sourceNode.entityType !== "file") {
            if (!map.has(sourceNode.id)) map.set(sourceNode.id, []);
            const arr = map.get(sourceNode.id)!;
            if (!arr.find(n => n.id === targetNode.id)) {
              arr.push(targetNode);
            }
          }
        }
      }
    });
    return map;
  }, [nodes, edges]);

  // 搜索过滤
  const filteredFiles = useMemo(() => {
    if (!searchQuery) return fileNodes;
    return fileNodes.filter(f => 
      f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [fileNodes, searchQuery]);

  const filteredEntities = useMemo(() => {
    if (!searchQuery) return entityNodes;
    return entityNodes.filter(e => 
      e.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [entityNodes, searchQuery]);

  // 计算相关文件（基于共享实体）
  const getRelatedFiles = useCallback((fileId: string) => {
    const fileEntities = fileToEntities.get(fileId) || [];
    const relatedFiles = new Map<string, { file: GraphNode; sharedEntities: GraphNode[] }>();
    
    fileEntities.forEach(entity => {
      const files = entityToFiles.get(entity.id) || [];
      files.forEach(f => {
        if (f.id !== fileId) {
          if (!relatedFiles.has(f.id)) {
            relatedFiles.set(f.id, { file: f, sharedEntities: [] });
          }
          relatedFiles.get(f.id)!.sharedEntities.push(entity);
        }
      });
    });
    
    return Array.from(relatedFiles.values()).sort(
      (a, b) => b.sharedEntities.length - a.sharedEntities.length
    );
  }, [fileToEntities, entityToFiles]);

  // 按实体类型分组
  const entitiesByType = useMemo(() => {
    const groups = new Map<string, GraphNode[]>();
    entityNodes.forEach(e => {
      const type = e.entityType;
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type)!.push(e);
    });
    return groups;
  }, [entityNodes]);

  // Rebuild graph
  const handleRebuild = useCallback(async () => {
    setIsRebuilding(true);
    try {
      const foldersRes = await fetch("/api/folders");
      const folders = await foldersRes.json();
      for (const folder of folders) {
        await fetch("/api/pipeline/graph", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: folder.id }),
        });
      }
      mutate();
    } finally {
      setIsRebuilding(false);
    }
  }, [mutate]);

  const selectedFile = selectedFileId ? fileNodes.find(f => f.id === selectedFileId) : null;
  const relatedFiles = selectedFileId ? getRelatedFiles(selectedFileId) : [];
  const selectedEntity = selectedEntityId ? entityNodes.find(e => e.id === selectedEntityId) : null;
  const entityFiles = selectedEntityId ? (entityToFiles.get(selectedEntityId) || []) : [];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 顶部工具栏 */}
      <div className="border-b bg-white px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">知识图谱</h1>
          <span className="text-sm text-muted-foreground">
            {fileNodes.length} 文件 · {entityNodes.length} 实体 · {edges.length} 关系
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={handleRebuild} disabled={isRebuilding}>
          <RefreshCw className={`h-4 w-4 mr-1 ${isRebuilding ? "animate-spin" : ""}`} />
          重建图谱
        </Button>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧边栏 */}
        <div className="w-72 border-r flex flex-col bg-white shrink-0">
          {/* 搜索 */}
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索文件或实体..."
                className="pl-9 h-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* 实体分类 */}
          <div className="p-4 border-b">
            <p className="text-xs font-medium text-muted-foreground mb-3">实体分类</p>
            <div className="space-y-2">
              {Array.from(entitiesByType.entries()).map(([type, entities]) => (
                <div
                  key={type}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedEntityId(null)}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: TYPE_COLORS[type] }}
                    />
                    <span className="text-sm">{TYPE_LABELS[type] || type}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">{entities.length}</Badge>
                </div>
              ))}
            </div>
          </div>

          {/* 选中详情 */}
          <div className="flex-1 overflow-y-auto p-4">
            {selectedFile && (
              <Card className="mb-4">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 mt-0.5 text-gray-500" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">文件</p>
                    </div>
                  </div>
                  
                  {/* 文件的实体标签 */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">关联实体</p>
                    <div className="flex flex-wrap gap-1">
                      {(fileToEntities.get(selectedFile.id) || []).map((entity, i) => (
                        <Badge
                          key={entity.id}
                          variant="outline"
                          className="text-xs cursor-pointer hover:bg-gray-50"
                          style={{ 
                            borderColor: TYPE_COLORS[entity.entityType], 
                            color: TYPE_COLORS[entity.entityType] 
                          }}
                          onClick={() => setSelectedEntityId(entity.id)}
                        >
                          {entity.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedEntity && (
              <Card className="mb-4">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: TYPE_COLORS[selectedEntity.entityType] }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{selectedEntity.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {TYPE_LABELS[selectedEntity.entityType]} · 关联 {selectedEntity.mentionCount} 个文件
                      </p>
                    </div>
                  </div>
                  
                  {selectedEntity.description && (
                    <p className="text-xs text-muted-foreground">{selectedEntity.description}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {!selectedFile && !selectedEntity && (
              <div className="text-center text-muted-foreground py-8">
                <Network className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">点击文件或实体查看详情</p>
              </div>
            )}
          </div>
        </div>

        {/* 主视图区 */}
        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="cards" className="h-full flex flex-col">
            <TabsList className="mx-4 mt-4 w-fit">
              <TabsTrigger value="cards" className="text-sm">
                <LayoutGrid className="h-4 w-4 mr-1" />
                卡片网络
              </TabsTrigger>
              <TabsTrigger value="tree" className="text-sm">
                <GitBranch className="h-4 w-4 mr-1" />
                树状关联
              </TabsTrigger>
            </TabsList>

            {/* 卡片网络视图 */}
            <TabsContent value="cards" className="flex-1 overflow-hidden m-0">
              <div className="h-full flex">
                {/* 文件卡片网格 */}
                <div className="flex-1 p-4 overflow-y-auto">
                  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {filteredFiles.map((file) => {
                      const entities = fileToEntities.get(file.id) || [];
                      const isSelected = selectedFileId === file.id;
                      
                      return (
                        <Card
                          key={file.id}
                          className={`cursor-pointer transition-all hover:shadow-md ${
                            isSelected ? "ring-2 ring-blue-500 bg-blue-50/50" : ""
                          }`}
                          onClick={() => setSelectedFileId(isSelected ? null : file.id)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start gap-2 mb-2">
                              <FileText className="h-4 w-4 mt-0.5 text-gray-400 shrink-0" />
                              <p className="text-sm font-medium truncate flex-1" title={file.name}>
                                {file.name}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {entities.slice(0, 4).map((entity, i) => (
                                <span
                                  key={entity.id}
                                  className={`text-[10px] px-1.5 py-0.5 rounded ${TAG_COLORS[i % TAG_COLORS.length]}`}
                                >
                                  {entity.name}
                                </span>
                              ))}
                              {entities.length > 4 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                                  +{entities.length - 4}
                                </span>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>

                {/* 关联文件面板 */}
                {selectedFileId && relatedFiles.length > 0 && (
                  <div className="w-80 border-l bg-white p-4 overflow-y-auto">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium">相关文件</p>
                      <Badge variant="secondary" className="text-xs">{relatedFiles.length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {relatedFiles.slice(0, 20).map(({ file, sharedEntities }) => (
                        <div
                          key={file.id}
                          className="p-2 rounded-lg border hover:bg-gray-50 cursor-pointer"
                          onClick={() => setSelectedFileId(file.id)}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <FileText className="h-3.5 w-3.5 text-gray-400" />
                            <p className="text-xs font-medium truncate flex-1">{file.name}</p>
                            <Badge variant="outline" className="text-[10px] px-1">
                              {sharedEntities.length}个共享
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {sharedEntities.slice(0, 3).map((entity, i) => (
                              <span
                                key={entity.id}
                                className="text-[10px] px-1 py-0.5 rounded bg-gray-100 text-gray-600"
                              >
                                {entity.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* 树状关联视图 */}
            <TabsContent value="tree" className="flex-1 overflow-hidden m-0">
              <div className="h-full flex">
                {/* 实体列表 */}
                <div className="w-80 border-r bg-white overflow-y-auto">
                  <div className="p-4 border-b sticky top-0 bg-white">
                    <p className="text-sm font-medium">实体节点</p>
                    <p className="text-xs text-muted-foreground">点击实体查看关联文件</p>
                  </div>
                  <div className="p-2">
                    {Array.from(entitiesByType.entries()).map(([type, entities]) => (
                      <div key={type} className="mb-4">
                        <div className="flex items-center gap-2 px-2 py-1.5">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: TYPE_COLORS[type] }}
                          />
                          <span className="text-xs font-medium text-muted-foreground">
                            {TYPE_LABELS[type]} ({entities.length})
                          </span>
                        </div>
                        <div className="space-y-1">
                          {entities.map((entity) => {
                            const files = entityToFiles.get(entity.id) || [];
                            const isSelected = selectedEntityId === entity.id;
                            
                            return (
                              <div
                                key={entity.id}
                                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                                  isSelected 
                                    ? "bg-blue-50 border border-blue-200" 
                                    : "hover:bg-gray-50"
                                }`}
                                onClick={() => setSelectedEntityId(isSelected ? null : entity.id)}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: TYPE_COLORS[type] }}
                                  />
                                  <span className="text-sm truncate">{entity.name}</span>
                                </div>
                                <Badge variant="secondary" className="text-[10px] ml-2 shrink-0">
                                  {files.length}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 关联文件视图 */}
                <div className="flex-1 p-4 overflow-y-auto bg-gradient-to-br from-slate-50 to-slate-100">
                  {selectedEntityId ? (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: TYPE_COLORS[selectedEntity?.entityType || "concept"] }}
                        />
                        <h2 className="text-lg font-semibold">{selectedEntity?.name}</h2>
                        <Badge variant="secondary">{TYPE_LABELS[selectedEntity?.entityType || ""]}</Badge>
                      </div>
                      
                      {selectedEntity?.description && (
                        <p className="text-sm text-muted-foreground mb-4">
                          {selectedEntity.description}
                        </p>
                      )}

                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        {entityFiles.map((file) => {
                          const entities = fileToEntities.get(file.id) || [];
                          
                          return (
                            <Card
                              key={file.id}
                              className="cursor-pointer hover:shadow-md transition-shadow"
                              onClick={() => setSelectedFileId(file.id)}
                            >
                              <CardContent className="p-3">
                                <div className="flex items-start gap-2 mb-2">
                                  <FileText className="h-4 w-4 mt-0.5 text-gray-400 shrink-0" />
                                  <p className="text-sm font-medium truncate flex-1">{file.name}</p>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {entities.slice(0, 4).map((entity, i) => (
                                    <span
                                      key={entity.id}
                                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                                        entity.id === selectedEntityId
                                          ? "bg-blue-500 text-white"
                                          : TAG_COLORS[i % TAG_COLORS.length]
                                      }`}
                                    >
                                      {entity.name}
                                    </span>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center text-muted-foreground">
                        <Tag className="h-12 w-12 mx-auto mb-3 opacity-30" />
                        <p className="font-medium">选择左侧实体查看关联文件</p>
                        <p className="text-sm mt-1">实体将显示所有关联的文件</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
