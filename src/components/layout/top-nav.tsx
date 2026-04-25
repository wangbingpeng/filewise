"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, FolderOpen, Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";

const navItems = [
  { href: "/", label: "概览" },
  { href: "/files", label: "文件管理" },
  { href: "/knowledge", label: "知识库" },
  { href: "/graph", label: "知识图谱" },
  { href: "/chat", label: "AI 对话" },
  { href: "/notes", label: "笔记" },
  { href: "/documents", label: "文档生成" },
];

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      // 跳转到全局搜索结果页面
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="flex items-center justify-between h-16 px-8 bg-white border-b border-[#E9ECEF] shrink-0">
      {/* 左侧：Logo + 导航 */}
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[#0D6EFD] to-[#0A58CA]">
            <FolderOpen className="w-[18px] h-[18px] stroke-white" />
          </div>
          <span className="text-lg font-bold text-[#0D6EFD]">FileWise</span>
        </Link>
        
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== "/" && pathname.startsWith(item.href));
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-md transition-all",
                  isActive
                    ? "text-[#0D6EFD] bg-[#E7F1FF]"
                    : "text-[#6C757D] hover:text-[#212529] hover:bg-[#F1F3F5]"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* 右侧：搜索框 + 设置按钮 */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#ADB5BD]" />
          <Input
            placeholder="搜索文件、知识、笔记..."
            className="pl-10 w-[280px] h-10 bg-[#F1F3F5] border-[#E9ECEF] rounded-lg focus:bg-white focus:border-[#0D6EFD] focus:ring-3 focus:ring-[#0D6EFD]/10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearch}
          />
        </div>
        
        <Link href="/settings">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-10 w-10 rounded-lg transition-all",
              pathname === "/settings"
                ? "text-[#0D6EFD] bg-[#E7F1FF]"
                : "text-[#6C757D] hover:text-[#212529] hover:bg-[#F1F3F5]"
            )}
          >
            <Settings className="h-5 w-5" />
          </Button>
        </Link>
      </div>
    </header>
  );
}
