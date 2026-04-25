"use client";

import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  StickyNote,
  Plus,
  FolderOpen,
  Search,
  Pin,
  Trash2,
  Tag,
  Save,
  Loader2,
  FileText,
  Wrench,
  MoreVertical,
  Edit2,
  FolderX,
} from "lucide-react";
import useSWR, { mutate } from "swr";
import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { ReportGenerator } from "@/components/notes/report-generator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SkillsManager } from "@/components/notes/skills-manager";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Note {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  folderId: string | null;
  isPinned: number;
  wordCount: number;
  createdAt: number;
  updatedAt: number;
  tags?: { id: string; name: string; color: string | null }[];
}

interface NoteFolder {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

interface NoteTag {
  id: string;
  name: string;
  color: string | null;
  noteCount: number;
}

export default function NotesPage() {
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [editorTitle, setEditorTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [titleError, setTitleError] = useState("");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showReportGenerator, setShowReportGenerator] = useState(false);
  const [activeView, setActiveView] = useState<"notes" | "skills">("notes");

  // 标题命名规则验证
  const validateTitle = (title: string): string => {
    if (!title.trim()) {
      return "标题不能为空";
    }
    if (title.length > 100) {
      return "标题不能超过100个字符";
    }
    // 检查是否包含非法字符
    const invalidChars = /[\\/:*?"<>|]/;
    if (invalidChars.test(title)) {
      return "标题不能包含以下字符: \\ / : * ? \" < > |";
    }
    return "";
  };

  const handleTitleChange = (newTitle: string) => {
    setEditorTitle(newTitle);
    const error = validateTitle(newTitle);
    setTitleError(error);
  };

  const queryParams = new URLSearchParams();
  if (activeFolder) queryParams.set("folderId", activeFolder);
  if (searchQuery) queryParams.set("q", searchQuery);
  const queryString = queryParams.toString();

  const { data: notesData = [] } = useSWR<Note[]>(`/api/notes?${queryString}`, fetcher);
  const { data: folders = [] } = useSWR<NoteFolder[]>("/api/notes/folders", fetcher);
  const { data: tags = [] } = useSWR<NoteTag[]>("/api/notes/tags", fetcher);

  const saveNote = useCallback(async () => {
    if (!activeNote) return;
    
    // 验证标题
    const error = validateTitle(editorTitle);
    if (error) {
      setTitleError(error);
      return;
    }
    
    setSaving(true);
    try {
      await fetch(`/api/notes/${activeNote.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editorTitle, content: editorContent }),
      });
      mutate(`/api/notes?${queryString}`);
      setTitleError("");
    } finally {
      setSaving(false);
    }
  }, [activeNote, editorTitle, editorContent, queryString]);

  // Auto-save
  useEffect(() => {
    if (!activeNote) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { saveNote(); }, 2000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [editorContent, editorTitle]);

  const createNote = useCallback(async (title: string = "无标题笔记", content: string = "") => {
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, folderId: activeFolder }),
    });
    const note = await res.json();
    if (!res.ok) {
      throw new Error(note.error || "创建笔记失败");
    }
    setActiveNote(note);
    setEditorTitle(note.title || "");
    setEditorContent(note.content || "");
    mutate(`/api/notes?${queryString}`);
    return note;
  }, [activeFolder, queryString]);

  const selectNote = useCallback((note: Note) => {
    setActiveNote(note);
    setEditorTitle(note.title || "");
    setEditorContent(note.content || "");
    setTitleError("");
  }, []);

  const deleteNote = useCallback(async (noteId: string) => {
    // Get note title for confirmation
    const note = notesData.find((n) => n.id === noteId);
    const noteTitle = note?.title || "此笔记";
    
    if (!confirm(`确定要删除笔记 "${noteTitle}" 吗？\n\n注意：\n1. 本地 Markdown 文件会重命名并保留（标记为删除状态）\n2. 可以随时恢复该文件`)) {
      return;
    }
    
    await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
    if (activeNote?.id === noteId) {
      setActiveNote(null);
      setEditorTitle("");
      setEditorContent("");
      setTitleError("");
    }
    mutate(`/api/notes?${queryString}`);
  }, [activeNote, notesData, queryString]);

  const togglePin = useCallback(async (note: Note) => {
    await fetch(`/api/notes/${note.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPinned: !note.isPinned }),
    });
    mutate(`/api/notes?${queryString}`);
  }, [queryString]);

  const createFolder = useCallback(async () => {
    const name = prompt("输入文件夹名称:");
    if (!name) return;
    await fetch("/api/notes/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    mutate("/api/notes/folders");
  }, []);

  const renameFolder = useCallback(async (folderId: string, currentName: string) => {
    const newName = prompt("输入新文件夹名称:", currentName);
    if (!newName || newName === currentName) return;
    
    try {
      const res = await fetch(`/api/notes/folders/${folderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        alert(`重命名失败: ${data.error || "未知错误"}`);
        return;
      }
      
      mutate("/api/notes/folders");
      
      // If the renamed folder is currently selected, update UI
      if (activeFolder === folderId) {
        // The folder list will refresh automatically
      }
    } catch (error) {
      console.error("Failed to rename folder:", error);
      alert("重命名失败，请重试");
    }
  }, [activeFolder]);

  const deleteFolder = useCallback(async (folderId: string, folderName: string) => {
    // Confirm deletion
    if (!confirm(`确定要删除文件夹 "${folderName}" 吗？\n\n注意：\n1. 文件夹中的笔记不会被删除\n2. 本地文件夹会重命名并保留（标记为删除状态）\n3. 可以随时恢复这些文件`)) {
      return;
    }
    
    try {
      const res = await fetch(`/api/notes/folders/${folderId}`, {
        method: "DELETE",
      });
      
      if (!res.ok) {
        const data = await res.json();
        alert(`删除失败: ${data.error || "未知错误"}`);
        return;
      }
      
      // If the deleted folder is currently selected, switch to all notes
      if (activeFolder === folderId) {
        setActiveFolder(null);
      }
      
      mutate("/api/notes/folders");
      mutate(`/api/notes?${queryString}`);
    } catch (error) {
      console.error("Failed to delete folder:", error);
      alert("删除失败，请重试");
    }
  }, [activeFolder, queryString]);

  // Handle report generation
  const handleReportGenerated = useCallback(async (title: string, content: string) => {
    try {
      const note = await createNote(title, content);
      setActiveNote(note);
      setEditorTitle(note.title || "");
      setEditorContent(note.content || "");
    } catch (error) {
      console.error("Failed to create note from report:", error);
      alert(`创建笔记失败: ${(error as Error).message}`);
    }
  }, [createNote]);

  return (
    <>
      <Header
        title="笔记"
        description="Markdown 笔记记录"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowReportGenerator(true)}>
              <FileText className="h-4 w-4 mr-1" />
              生成报告
            </Button>
            <Button size="sm" onClick={() => createNote()}>
              <Plus className="h-4 w-4 mr-1" />
              新建笔记
            </Button>
          </div>
        }
      />
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - Navigation */}
        <div className="w-48 border-r flex flex-col shrink-0 bg-white">
          {/* View switcher */}
          <div className="p-2 border-b space-y-0.5">
            <Button 
              variant={activeView === "notes" ? "secondary" : "ghost"} 
              size="sm" 
              className="w-full justify-start" 
              onClick={() => setActiveView("notes")}
            >
              <StickyNote className="h-3.5 w-3.5 mr-2" />
              笔记
            </Button>
            <Button 
              variant={activeView === "skills" ? "secondary" : "ghost"} 
              size="sm" 
              className="w-full justify-start" 
              onClick={() => setActiveView("skills")}
            >
              <Wrench className="h-3.5 w-3.5 mr-2" />
              SkillSpace
            </Button>
          </div>

          {/* Notes navigation */}
          {activeView === "notes" && (
            <>
              <div className="p-2 border-b space-y-0.5">
                <Button variant={!activeFolder ? "secondary" : "ghost"} size="sm" className="w-full justify-start" onClick={() => setActiveFolder(null)}>
                  <StickyNote className="h-3.5 w-3.5 mr-2" />
                  全部笔记
                </Button>
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    className="flex items-center group"
                  >
                    <Button
                      variant={activeFolder === folder.id ? "secondary" : "ghost"}
                      size="sm"
                      className="w-full justify-start flex-1"
                      onClick={() => setActiveFolder(folder.id)}
                    >
                      <FolderOpen className="h-3.5 w-3.5 mr-2" />
                      {folder.name}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        <MoreVertical className="opacity-0 group-hover:opacity-100 h-3.5 w-3.5 text-muted-foreground p-1 hover:bg-accent rounded transition-opacity cursor-pointer" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem onClick={() => renameFolder(folder.id, folder.name)}>
                          <Edit2 className="h-3.5 w-3.5 mr-2" />
                          重命名
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => deleteFolder(folder.id, folder.name)}
                          className="text-destructive focus:text-destructive"
                        >
                          <FolderX className="h-3.5 w-3.5 mr-2" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
              <div className="p-2 border-b">
                <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={createFolder}>
                  <Plus className="h-3.5 w-3.5 mr-2" />
                  新建文件夹
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="p-2">
                  <p className="text-xs font-medium text-muted-foreground px-2 mb-1">标签</p>
                  <div className="flex flex-wrap gap-1 px-2">
                    {tags.map((tag) => (
                      <Badge key={tag.id} variant="secondary" className="text-xs">
                        <Tag className="h-2.5 w-2.5 mr-1" />
                        {tag.name} ({tag.noteCount})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Skills navigation info */}
          {activeView === "skills" && (
            <div className="p-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                管理SkillSpace，支持查看、编辑和创建新模板
              </p>
            </div>
          )}
        </div>

        {/* Content area */}
        {activeView === "skills" ? (
          <SkillsManager />
        ) : (
          <>

        {/* Notes list */}
        <div className="w-72 border-r flex flex-col shrink-0">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="搜索笔记..." className="pl-9 h-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {notesData.map((note) => (
              <button
                key={note.id}
                className={`w-full text-left p-3 border-b hover:bg-accent/50 transition-colors ${activeNote?.id === note.id ? "bg-accent" : ""}`}
                onClick={() => selectNote(note)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm truncate flex-1">
                    {note.isPinned ? <Pin className="h-3 w-3 inline mr-1 text-primary" /> : null}
                    {note.title}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{note.excerpt}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs text-muted-foreground">{new Date(note.updatedAt).toLocaleDateString("zh-CN")}</span>
                  <span className="text-xs text-muted-foreground">{note.wordCount} 字</span>
                </div>
              </button>
            ))}
            {notesData.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">暂无笔记</div>}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeNote ? (
            <>
              <div className="flex items-center gap-2 px-4 py-2 border-b">
                <div className="flex-1">
                  <Input
                    value={editorTitle || ""}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    className={`border-0 text-lg font-semibold p-0 h-auto focus-visible:ring-0 ${
                      titleError ? "text-destructive" : ""
                    }`}
                    placeholder="笔记标题"
                  />
                  {titleError && (
                    <p className="text-xs text-destructive mt-1">{titleError}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  <Button variant="ghost" size="sm" onClick={() => togglePin(activeNote)}>
                    <Pin className={`h-4 w-4 ${activeNote.isPinned ? "text-primary" : ""}`} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={saveNote}>
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteNote(activeNote.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden" data-color-mode="light">
                <MDEditor
                  value={editorContent}
                  onChange={(val) => setEditorContent(val || "")}
                  height="100%"
                  preview="live"
                  visibleDragbar={false}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <StickyNote className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <p>选择或创建一个笔记开始编辑</p>
              </div>
            </div>
          )}
        </div>
        </>
        )}
      </div>

      {/* Report Generator Dialog */}
      <ReportGenerator
        open={showReportGenerator}
        onOpenChange={setShowReportGenerator}
        onGenerated={handleReportGenerated}
      />
    </>
  );
}
