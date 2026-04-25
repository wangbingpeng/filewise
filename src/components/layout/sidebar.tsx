"use client";

import { usePathname } from "next/navigation";
import { FolderOpen, BookOpen, Network, MessageSquare, StickyNote, FileOutput } from "lucide-react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();

  // 根据当前页面显示不同的侧边栏
  // 文件管理页显示文件夹列表（由文件管理页面自己处理）
  // 其他页面显示对应的侧边栏内容
  
  const isFilesPage = pathname === "/files" || pathname.startsWith("/files/");
  const isKnowledgePage = pathname === "/knowledge";
  const isGraphPage = pathname === "/graph";
  const isChatPage = pathname === "/chat";
  const isNotesPage = pathname === "/notes";
  const isDocumentsPage = pathname === "/documents";
  const isSettingsPage = pathname === "/settings";

  // 文件管理页面的侧边栏由页面自己实现
  if (isFilesPage) {
    return null;
  }

  // 其他页面暂时不显示侧边栏，直接返回 null
  // 后续可以根据需要添加各页面的侧边栏内容
  return null;
}
