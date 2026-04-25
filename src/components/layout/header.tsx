"use client";

import { Search, FileText, BookOpen, StickyNote, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";

interface HeaderProps {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
}

interface SearchResult {
  id: string;
  title: string;
  content?: string;
  type: "knowledge" | "note" | "file";
  score?: number;
  fileName?: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function Header({ title, description, actions }: HeaderProps) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch search results
  const { data: searchResults = [], isLoading } = useSWR<SearchResult[]>(
    debouncedQuery ? `/api/search?q=${encodeURIComponent(debouncedQuery)}&limit=10` : null,
    fetcher
  );

  // Keyboard shortcut to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setSearchOpen(true);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        resultsRef.current &&
        !resultsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleResultClick = (result: SearchResult) => {
    setSearchOpen(false);
    setSearchQuery("");
    if (result.type === "file") {
      router.push(`/files/${result.id}`);
    } else if (result.type === "knowledge") {
      router.push(`/knowledge?id=${result.id}`);
    } else if (result.type === "note") {
      router.push(`/notes?id=${result.id}`);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "file":
        return <FileText className="h-4 w-4 text-blue-500" />;
      case "knowledge":
        return <BookOpen className="h-4 w-4 text-green-500" />;
      case "note":
        return <StickyNote className="h-4 w-4 text-yellow-500" />;
      default:
        return <Search className="h-4 w-4" />;
    }
  };

  return (
    <header className="flex items-center justify-between h-14 px-6 border-b bg-background shrink-0">
      <div className="flex items-center gap-4">
        {title && (
          <div>
            <h1 className="text-lg font-semibold">{title}</h1>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="搜索文件、知识、笔记... (⌘K)"
            className="pl-9 w-64 h-9"
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setSearchQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
          />
          {/* Search Results Dropdown */}
          {searchOpen && searchQuery && (
            <div
              ref={resultsRef}
              className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto"
            >
              {isLoading ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  搜索中...
                </div>
              ) : searchResults.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  未找到相关结果
                </div>
              ) : (
                <div className="py-1">
                  {searchResults.map((result) => (
                    <button
                      key={`${result.type}-${result.id}`}
                      className="w-full flex items-start gap-3 px-3 py-2 hover:bg-accent text-left transition-colors"
                      onClick={() => handleResultClick(result)}
                    >
                      {getIcon(result.type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {result.title || result.fileName || "无标题"}
                        </p>
                        {result.content && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {result.content.slice(0, 100)}...
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {result.type === "file" ? "文件" : result.type === "knowledge" ? "知识条目" : "笔记"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {actions}
      </div>
    </header>
  );
}
