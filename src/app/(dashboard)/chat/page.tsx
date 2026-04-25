"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare,
  Plus,
  Send,
  Loader2,
  FileText,
  Bot,
  User,
  Trash2,
  Square,
  Copy,
  Check,
} from "lucide-react";
import useSWR, { mutate } from "swr";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources: string | ChatSource[];
  createdAt: number;
}

interface ChatSource {
  fileId: string;
  fileName: string;
  chunkContent: string;
  score: number;
}

export default function ChatPage() {
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingSession, setDeletingSession] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null); // 新增：临时显示用户消息
  const [streamSources, setStreamSources] = useState<ChatSource[]>([]); // 流式消息的来源
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const router = useRouter();

  const { data: sessions = [] } = useSWR<ChatSession[]>("/api/chat/sessions", fetcher);
  const { data: rawMessages = [] } = useSWR<ChatMessage[]>(
    activeSession ? `/api/chat/sessions/${activeSession}/messages` : null,
    fetcher,
    { revalidateOnFocus: false } // 禁止聚焦时重新验证，防止重复请求
  );
  
  // 对消息去重（基于 id）
  const messages = useMemo(() => {
    const seen = new Set();
    return rawMessages.filter(msg => {
      if (seen.has(msg.id)) return false;
      seen.add(msg.id);
      return true;
    });
  }, [rawMessages]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "44px";
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
    }
  }, [inputValue]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamContent]);

  const createSession = useCallback(async () => {
    const res = await fetch("/api/chat/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "新对话" }),
    });
    const session = await res.json();
    setActiveSession(session.id);
    mutate("/api/chat/sessions");
  }, []);

  const deleteSession = useCallback(async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("确定要删除这个对话吗？")) return;
    setDeletingSession(sessionId);
    try {
      await fetch(`/api/chat/sessions/${sessionId}`, { method: "DELETE" });
      mutate("/api/chat/sessions");
      if (activeSession === sessionId) {
        setActiveSession(null);
      }
    } finally {
      setDeletingSession(null);
    }
  }, [activeSession]);

  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStreaming(false);
    if (activeSession) {
      mutate(`/api/chat/sessions/${activeSession}/messages`);
    }
  }, [activeSession]);

  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() || streaming) return;

    let sessionId = activeSession;
    if (!sessionId) {
      const res = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: inputValue.slice(0, 30) }),
      });
      const session = await res.json();
      sessionId = session.id;
      setActiveSession(sessionId);
      mutate("/api/chat/sessions");
    }

    const content = inputValue;
    setInputValue("");
    
    // 立即显示用户消息
    setPendingMessage(content);
    
    setStreaming(true);
    setStreamContent("");
    setStreamSources([]);

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch(`/api/chat/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.sources) {
                setStreamSources(parsed.sources);
              }
              if (parsed.delta) {
                accumulated += parsed.delta;
                setStreamContent(accumulated);
              }
            } catch {
              // skip
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled, ignore
      } else {
        console.error("Chat error:", err);
      }
    } finally {
      setStreaming(false);
      setStreamContent("");
      setStreamSources([]);
      abortControllerRef.current = null;
      
      // 先清除临时消息，再刷新服务器数据
      setPendingMessage(null);
      
      // 刷新消息列表
      mutate(`/api/chat/sessions/${sessionId}/messages`);
      mutate("/api/chat/sessions");
    }
  }, [inputValue, activeSession, streaming]);

  const parseSources = (sourcesData: string | ChatSource[]): ChatSource[] => {
    if (Array.isArray(sourcesData)) return sourcesData;
    try { return JSON.parse(sourcesData); } catch { return []; }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString("zh-CN", { 
      hour: "2-digit", 
      minute: "2-digit" 
    });
  };

  // 将消息内容中的文件名转为可点击链接
  const renderMessageContent = (content: string, sources: ChatSource[]) => {
    if (!sources || sources.length === 0) return content;

    // 构建 fileName -> fileId 映射
    const fileNameToId = new Map<string, string>();
    sources.forEach(s => {
      if (s.fileName && s.fileId) {
        fileNameToId.set(s.fileName, s.fileId);
      }
    });
    if (fileNameToId.size === 0) return content;

    // 按文件名长度降序排列，避免短名匹配覆盖长名
    const sortedNames = [...fileNameToId.keys()].sort((a, b) => b.length - a.length);
    const escapedNames = sortedNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    // 匹配格式：[来源: 文件名] 或 【来源: 文件名】
    // 对于裸文件名，只匹配带扩展名的（如 xxx.pdf），避免误匹配普通词汇
    const nameWithExt = escapedNames.filter(n => /\\\.[a-zA-Z]+$/.test(n));
    const barePattern = nameWithExt.length > 0 ? `|(${nameWithExt.join('|')})` : '';

    const sourceRefPattern = escapedNames.length > 0
      ? new RegExp(`\\[来源[:\\s]*(${escapedNames.join('|')})\\]|【来源[:\\s]*(${escapedNames.join('|')})】${barePattern}`, 'g')
      : null;

    if (!sourceRefPattern) return content;

    const result: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = sourceRefPattern.exec(content)) !== null) {
      const fullMatch = match[0];
      // 确定匹配到的文件名
      const fileName = match[1] || match[2] || match[3];
      const fileId = fileName ? fileNameToId.get(fileName) : undefined;

      // 添加匹配前的文本
      if (match.index > lastIndex) {
        result.push(content.slice(lastIndex, match.index));
      }

      if (fileId) {
        const isSourceRef = fullMatch.startsWith('[') || fullMatch.startsWith('【');
        result.push(
          <button
            key={`f-${match.index}`}
            onClick={(e) => { e.stopPropagation(); router.push(`/files/${fileId}`); }}
            className="inline-flex items-center gap-0.5 text-[#0D6EFD] hover:underline font-medium cursor-pointer bg-transparent border-0 p-0 align-baseline"
            title={`查看文件: ${fileName}`}
          >
            <FileText className="h-3 w-3 inline shrink-0" />
            {isSourceRef ? fileName : fullMatch}
          </button>
        );
      } else {
        result.push(fullMatch);
      }

      lastIndex = match.index + fullMatch.length;
    }

    // 添加剩余文本
    if (lastIndex < content.length) {
      result.push(content.slice(lastIndex));
    }

    return result;
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-[#F8F9FA] min-h-0">
      {/* Session list */}
      <div className="w-72 border-r border-[#E9ECEF] flex flex-col shrink-0 bg-white h-full">
        <div className="p-4 border-b border-[#E9ECEF]">
          <Button className="w-full bg-[#0D6EFD] hover:bg-[#0A58CA] text-white" size="sm" onClick={createSession}>
            <Plus className="h-4 w-4 mr-1" />
            新对话
          </Button>
        </div>
        <ScrollArea className="flex-1" style={{ maxHeight: 'calc(100vh - 8rem)' }}>
          {sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                "group flex items-center gap-3 px-4 py-3 text-sm border-b border-[#F1F3F5] hover:bg-[#F8F9FA] transition-colors cursor-pointer",
                activeSession === session.id && "bg-[#E7F1FF]"
              )}
              onClick={() => setActiveSession(session.id)}
            >
              <MessageSquare className="h-4 w-4 shrink-0 text-[#6C757D]" />
              <div className="flex-1 min-w-0">
                <span className="truncate block text-[#212529]">{session.title}</span>
                <p className="text-xs text-[#ADB5BD] mt-0.5">
                  {new Date(session.updatedAt).toLocaleDateString("zh-CN")}
                </p>
              </div>
              <button
                onClick={(e) => deleteSession(session.id, e)}
                disabled={deletingSession === session.id}
                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-[#F8D7DA] rounded transition-opacity shrink-0"
                title="删除对话"
              >
                <Trash2 className="h-3.5 w-3.5 text-[#DC3545]" />
              </button>
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="p-6 text-center text-sm text-[#6C757D]">暂无对话记录</div>
          )}
        </ScrollArea>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden min-h-0 h-full">
        {!activeSession ? (
          <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-white to-[#F8F9FA]">
            <div className="text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#0D6EFD] to-[#0A58CA] flex items-center justify-center mx-auto mb-6 shadow-lg">
                <Bot className="h-10 w-10 text-white" />
              </div>
              <p className="text-2xl font-semibold text-[#212529] mb-2">开始一段新对话</p>
              <p className="text-[15px] text-[#6C757D]">输入问题，AI 将从您的知识库中检索相关内容并回答</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-hidden min-h-0" style={{ paddingBottom: '120px' }}>
              <ScrollArea className="h-full">
                <div className="p-6 space-y-6">
              {messages.map((msg) => (
                <div key={msg.id} className={cn("flex gap-3", msg.role === "user" && "justify-end")}>
                  {msg.role === "assistant" && (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0D6EFD] to-[#0A58CA] flex items-center justify-center shrink-0 shadow-sm">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <div className={cn(
                    "group max-w-[70%] rounded-2xl px-5 py-3.5 break-words shadow-sm",
                    msg.role === "user" 
                      ? "bg-gradient-to-br from-[#0D6EFD] to-[#0A58CA] text-white rounded-br-md" 
                      : "bg-white border border-[#E9ECEF] rounded-bl-md"
                  )}>
                    <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{renderMessageContent(msg.content, parseSources(msg.sources))}</div>
                    <div className={cn(
                      "flex items-center gap-2 mt-2",
                      msg.role === "user" ? "justify-end" : "justify-between"
                    )}>
                      <span className="text-[11px] opacity-60">{formatTime(msg.createdAt)}</span>
                      {msg.role === "assistant" && (
                        <button
                          onClick={() => copyToClipboard(msg.content, msg.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-black/5 rounded-lg transition-all"
                          title="复制"
                        >
                          {copiedId === msg.id ? (
                            <Check className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                    {msg.role === "assistant" && parseSources(msg.sources).length > 0 && (
                      <div className="mt-3 pt-3 border-t border-[#E9ECEF]">
                        <p className="text-xs font-medium mb-2 text-[#6C757D]">参考来源</p>
                        <div className="flex flex-wrap gap-2">
                          {parseSources(msg.sources).map((s, i) => (
                            <button
                              key={i}
                              onClick={() => router.push(`/files/${s.fileId}`)}
                              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#F1F3F5] hover:bg-[#E7F1FF] transition-colors border border-[#E9ECEF] hover:border-[#0D6EFD]/30 cursor-pointer"
                              title={`查看文件: ${s.fileName}`}
                            >
                              <FileText className="h-3.5 w-3.5 text-[#0D6EFD]" />
                              <span className="text-[#0D6EFD] truncate max-w-[200px]">{s.fileName}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#6C757D] to-[#495057] flex items-center justify-center shrink-0 shadow-sm">
                      <User className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
              ))}
              {streaming && streamContent && (
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0D6EFD] to-[#0A58CA] flex items-center justify-center shrink-0 shadow-sm">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                  <div className="max-w-[70%] rounded-2xl rounded-bl-md px-5 py-3.5 bg-white border border-[#E9ECEF] shadow-sm break-words">
                    <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{renderMessageContent(streamContent, streamSources)}</div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[11px] text-[#6C757D]">生成中...</span>
                      <span className="inline-block w-1.5 h-3.5 bg-[#0D6EFD]/60 animate-pulse rounded-full" />
                    </div>
                  </div>
                </div>
              )}
              {streaming && !streamContent && (
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0D6EFD] to-[#0A58CA] flex items-center justify-center shrink-0 shadow-sm">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                  <div className="rounded-2xl rounded-bl-md px-5 py-3.5 bg-white border border-[#E9ECEF] shadow-sm">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-[#0D6EFD]" />
                      <span className="text-[15px] text-[#6C757D]">思考中...</span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* 临时显示用户消息（立即显示） */}
              {pendingMessage && (
                <div className="flex gap-3 justify-end animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="max-w-[70%] rounded-2xl rounded-br-md px-5 py-3.5 bg-gradient-to-br from-[#0D6EFD] to-[#0A58CA] text-white shadow-sm break-words">
                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{pendingMessage}</p>
                    <div className="flex items-center justify-end gap-2 mt-2">
                      <span className="text-[11px] opacity-60">{formatTime(Date.now())}</span>
                    </div>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#6C757D] to-[#495057] flex items-center justify-center shrink-0 shadow-sm">
                    <User className="h-4 w-4 text-white" />
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
              </div>
              </ScrollArea>
            </div>

            {/* Input area - 悬浮在屏幕中下方 */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white to-transparent pt-8 pb-6 px-6">
              <div className="max-w-3xl mx-auto">
                <div className="flex gap-3 items-end bg-white rounded-2xl border-2 border-[#E9ECEF] shadow-lg p-2 focus-within:border-[#0D6EFD] focus-within:ring-4 focus-within:ring-[#0D6EFD]/10 transition-all">
                  <Textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="输入问题，AI 将从知识库中检索相关内容..."
                    className="min-h-[48px] max-h-[160px] resize-none pr-12 py-3 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-[15px]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                  />
                  {streaming ? (
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={stopStreaming}
                      className="shrink-0 h-11 w-11 rounded-xl shadow-sm hover:shadow-md transition-all"
                      title="停止生成"
                    >
                      <Square className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      onClick={sendMessage}
                      disabled={!inputValue.trim()}
                      className="shrink-0 h-11 w-11 rounded-xl bg-[#0D6EFD] hover:bg-[#0A58CA] shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      size="icon"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="text-center mt-2">
                  <span className="text-[11px] text-[#ADB5BD]">Enter 发送 · Shift+Enter 换行</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
