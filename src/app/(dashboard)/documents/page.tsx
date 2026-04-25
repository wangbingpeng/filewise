"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  FileOutput,
  Plus,
  Download,
  Trash2,
  Loader2,
  FileText,
  Presentation,
  File,
} from "lucide-react";
import useSWR, { mutate } from "swr";
import { useState, useCallback } from "react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface GeneratedDoc {
  id: string;
  title: string;
  format: string;
  docType: string;
  content: string;
  fileSize: number | null;
  status: string;
  error: string | null;
  createdAt: number;
}

const FORMAT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  pptx: Presentation,
  docx: FileText,
  markdown: File,
};

const FORMAT_LABELS: Record<string, string> = {
  pptx: "PowerPoint",
  docx: "Word",
  markdown: "Markdown",
};

const TYPE_LABELS: Record<string, string> = {
  report: "报告",
  summary: "摘要",
  presentation: "演示文稿",
  analysis: "分析",
};

export default function DocumentsPage() {
  const { data: documents = [] } = useSWR<GeneratedDoc[]>("/api/documents", fetcher);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    format: "markdown",
    docType: "report",
    prompt: "",
  });

  const createDocument = useCallback(async () => {
    if (!form.title.trim()) return;
    setCreating(true);
    try {
      await fetch("/api/documents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          format: form.format,
          docType: form.docType,
          prompt: form.prompt,
          sourceFileIds: [],
        }),
      });
      setDialogOpen(false);
      setForm({ title: "", format: "markdown", docType: "report", prompt: "" });
      mutate("/api/documents");
    } finally {
      setCreating(false);
    }
  }, [form]);

  const deleteDocument = useCallback(async (docId: string) => {
    await fetch(`/api/documents/${docId}`, { method: "DELETE" });
    mutate("/api/documents");
  }, []);

  const downloadDocument = useCallback((docId: string) => {
    window.open(`/api/documents/${docId}/download`, "_blank");
  }, []);

  const hasGenerating = documents.some((d) => d.status === "generating");
  useSWR(hasGenerating ? "/api/documents" : null, fetcher, { refreshInterval: 3000 });

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex justify-end mb-4">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="h-4 w-4 mr-1" />
              生成文档
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>生成新文档</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">文档标题</label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="输入文档标题"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">文档格式</label>
                  <div className="flex gap-2 mt-1">
                    {["markdown", "docx", "pptx"].map((fmt) => (
                      <Button key={fmt} variant={form.format === fmt ? "default" : "outline"} size="sm" onClick={() => setForm({ ...form, format: fmt })}>
                        {FORMAT_LABELS[fmt]}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">文档类型</label>
                  <div className="flex gap-2 mt-1">
                    {["report", "summary", "presentation", "analysis"].map((t) => (
                      <Button key={t} variant={form.docType === t ? "default" : "outline"} size="sm" onClick={() => setForm({ ...form, docType: t })}>
                        {TYPE_LABELS[t]}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">补充说明 (可选)</label>
                  <Textarea
                    value={form.prompt}
                    onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                    placeholder="描述你希望文档包含的内容..."
                    className="mt-1"
                    rows={3}
                  />
                </div>
                <Button className="w-full" onClick={createDocument} disabled={creating || !form.title.trim()}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileOutput className="h-4 w-4 mr-1" />}
                  开始生成
                </Button>
              </div>
            </DialogContent>
          </Dialog>
      </div>
      
      {documents.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-muted-foreground">
            <FileOutput className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <p>暂无生成文档</p>
            <p className="text-sm mt-1">点击“生成文档”开始创建</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => {
            const Icon = FORMAT_ICONS[doc.format] || File;
            return (
              <Card key={doc.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary shrink-0" />
                      <CardTitle className="text-sm font-medium line-clamp-1">{doc.title}</CardTitle>
                    </div>
                    <Badge variant={doc.status === "ready" ? "default" : doc.status === "generating" ? "secondary" : "destructive"}>
                      {doc.status === "ready" ? "完成" : doc.status === "generating" ? "生成中" : "失败"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                    <span>{FORMAT_LABELS[doc.format]}</span>
                    <span>|</span>
                    <span>{TYPE_LABELS[doc.docType]}</span>
                    {doc.fileSize && (<><span>|</span><span>{(doc.fileSize / 1024).toFixed(1)} KB</span></>)}
                  </div>
                  {doc.error && <p className="text-xs text-destructive mb-2">{doc.error}</p>}
                  {doc.status === "generating" && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      正在生成...
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">{new Date(doc.createdAt).toLocaleString("zh-CN")}</span>
                    <div className="flex gap-1">
                      {doc.status === "ready" && (
                        <Button variant="ghost" size="sm" onClick={() => downloadDocument(doc.id)}>
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => deleteDocument(doc.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
