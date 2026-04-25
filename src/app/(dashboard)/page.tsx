"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FolderOpen,
  FileText,
  Network,
  MessageSquare,
  StickyNote,
  FileOutput,
  BookOpen,
  Activity,
} from "lucide-react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Stats {
  folders: number;
  files: number;
  knowledgeEntries: number;
  graphNodes: number;
  chatSessions: number;
  notes: number;
  generatedDocs: number;
}

export default function DashboardPage() {
  const { data: stats } = useSWR<Stats>("/api/stats", fetcher);

  const statCards = [
    { label: "文件夹", value: stats?.folders ?? 0, icon: FolderOpen, color: "text-blue-500" },
    { label: "文件", value: stats?.files ?? 0, icon: FileText, color: "text-emerald-500" },
    { label: "知识条目", value: stats?.knowledgeEntries ?? 0, icon: BookOpen, color: "text-violet-500" },
    { label: "图谱节点", value: stats?.graphNodes ?? 0, icon: Network, color: "text-orange-500" },
    { label: "对话", value: stats?.chatSessions ?? 0, icon: MessageSquare, color: "text-cyan-500" },
    { label: "笔记", value: stats?.notes ?? 0, icon: StickyNote, color: "text-yellow-500" },
    { label: "生成文档", value: stats?.generatedDocs ?? 0, icon: FileOutput, color: "text-pink-500" },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {statCards.map((card) => (
            <Card key={card.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                  <span className="text-xs text-muted-foreground">{card.label}</span>
                </div>
                <p className="text-2xl font-bold">{card.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              快速开始
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <QuickAction
                href="/files"
                icon={FolderOpen}
                title="添加文件夹"
                description="选择一个本地文件夹开始智能分析"
              />
              <QuickAction
                href="/chat"
                icon={MessageSquare}
                title="开始对话"
                description="通过自然语言检索和分析文件内容"
              />
              <QuickAction
                href="/notes"
                icon={StickyNote}
                title="创建笔记"
                description="用 Markdown 记录工作内容"
              />
            </div>
          </CardContent>
        </Card>
      </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <a
      href={href}
      className="flex items-start gap-3 p-4 rounded-lg border hover:bg-accent/50 transition-colors"
    >
      <Icon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
      <div>
        <p className="font-medium text-sm">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
    </a>
  );
}
