"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, FileText, Calendar, CalendarDays } from "lucide-react";

interface ReportGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: (title: string, content: string) => void;
}

interface SkillInfo {
  name: string;
  title: string;
  description: string;
}

export function ReportGenerator({ open, onOpenChange, onGenerated }: ReportGeneratorProps) {
  const [type, setType] = useState<"daily" | "weekly">("daily");
  const [input, setInput] = useState("");
  const [projectName, setProjectName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [skill, setSkill] = useState("alibaba-report");
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load available skills
  useEffect(() => {
    if (open) {
      fetch("/api/reports/generate")
        .then((r) => r.json())
        .then((data) => {
          setSkills(data.skills || []);
          if (data.default) setSkill(data.default);
        })
        .catch(console.error);
    }
  }, [open]);

  const handleGenerate = async () => {
    if (!input.trim()) {
      setError("请输入工作内容");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          input,
          skill,
          projectName: projectName || undefined,
          customerName: customerName || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "生成失败");
        return;
      }

      onGenerated(data.title, data.content);
      onOpenChange(false);
      
      // Reset form
      setInput("");
      setProjectName("");
      setCustomerName("");
    } catch (err) {
      setError("请求失败: " + String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            生成工作报告
          </DialogTitle>
          <DialogDescription>
            输入工作内容，AI 将自动生成格式化的日报或周报
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Report Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">报告类型</label>
            <div className="flex gap-2">
              <Button
                variant={type === "daily" ? "default" : "outline"}
                size="sm"
                onClick={() => setType("daily")}
                className="flex-1"
              >
                <Calendar className="h-4 w-4 mr-1" />
                日报
              </Button>
              <Button
                variant={type === "weekly" ? "default" : "outline"}
                size="sm"
                onClick={() => setType("weekly")}
                className="flex-1"
              >
                <CalendarDays className="h-4 w-4 mr-1" />
                周报
              </Button>
            </div>
          </div>

          {/* Skill Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">报告模板</label>
            <Select value={skill} onValueChange={(v) => v && setSkill(v)}>
              <SelectTrigger>
                <SelectValue placeholder="选择报告模板" />
              </SelectTrigger>
              <SelectContent>
                {skills.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {skills.find((s) => s.name === skill)?.description && (
              <p className="text-xs text-muted-foreground">
                {skills.find((s) => s.name === skill)?.description}
              </p>
            )}
          </div>

          {/* Project & Customer */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">项目名称（可选）</label>
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="例如：数据分析平台"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">客户名称（可选）</label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="例如：TechCorp"
              />
            </div>
          </div>

          {/* Work Content Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">工作内容 *</label>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`请输入${type === "daily" ? "今日" : "本周"}工作内容，例如：

项目：数据分析平台
工作内容：
1. 完成了用户行为分析模块的开发
2. 修复了3个bug
3. 参加了需求评审会议
进度：开发进度70%
问题：接口文档不完整，影响联调
${type === "daily" ? "明日计划" : "下周计划"}：完成剩余接口对接`}
              rows={10}
              className="font-mono text-sm"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={handleGenerate} disabled={loading || !input.trim()}>
              {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              生成报告
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
