"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TokenUsageChart } from "@/components/token-usage-chart";
function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-medium leading-none">{children}</label>;
}
import { useState, useEffect } from "react";
import { CheckCircle, XCircle, Loader2, TrendingUp, Zap, Calendar, Hash } from "lucide-react";

interface TestResult {
  success: boolean;
  model?: string;
  response?: string;
  error?: string;
  details?: string;
}

interface DailyUsage {
  date: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestCount: number;
}

interface TokenUsageSummary {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalRequests: number;
  uniqueModels: number;
}

interface TokenUsageData {
  summary: TokenUsageSummary;
  dailyUsage: DailyUsage[];
  dateRange: { startDate: string; endDate: string };
}

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://dashscope.aliyuncs.com/compatible-mode/v1");
  const [model, setModel] = useState("qwen-plus");
  const [embeddingModel, setEmbeddingModel] = useState("text-embedding-v3");
  const [visionModel, setVisionModel] = useState("qwen-vl-max");
  const [saved, setSaved] = useState(false);

  const [chatTesting, setChatTesting] = useState(false);
  const [visionTesting, setVisionTesting] = useState(false);
  const [chatResult, setChatResult] = useState<TestResult | null>(null);
  const [visionResult, setVisionResult] = useState<TestResult | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageData | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.apiKey) setApiKey(data.apiKey);
        if (data.baseUrl) setBaseUrl(data.baseUrl);
        if (data.model) setModel(data.model);
        if (data.embeddingModel) setEmbeddingModel(data.embeddingModel);
        if (data.visionModel) setVisionModel(data.visionModel);
      })
      .catch(() => {});

    // Fetch token usage data
    fetch("/api/token-usage?days=30")
      .then((r) => r.json())
      .then((data) => setTokenUsage(data))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, baseUrl, model, embeddingModel, visionModel }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async (type: "chat" | "vision") => {
    if (type === "chat") {
      setChatTesting(true);
      setChatResult(null);
    } else {
      setVisionTesting(true);
      setVisionResult(null);
    }

    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();

      if (type === "chat") {
        setChatResult(data);
      } else {
        setVisionResult(data);
      }
    } catch (err) {
      if (type === "chat") {
        setChatResult({ success: false, error: String(err) });
      } else {
        setVisionResult({ success: false, error: String(err) });
      }
    } finally {
      if (type === "chat") {
        setChatTesting(false);
      } else {
        setVisionTesting(false);
      }
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI 服务配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>
            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>对话模型</Label>
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="qwen-plus"
                />
              </div>
              <div className="space-y-2">
                <Label>Embedding 模型</Label>
                <Input
                  value={embeddingModel}
                  onChange={(e) => setEmbeddingModel(e.target.value)}
                  placeholder="text-embedding-v3"
                />
              </div>
              <div className="space-y-2">
                <Label>多模态模型</Label>
                <Input
                  value={visionModel}
                  onChange={(e) => setVisionModel(e.target.value)}
                  placeholder="qwen-vl-max"
                />
              </div>
            </div>
            <Button onClick={handleSave}>
              {saved ? "已保存" : "保存设置"}
            </Button>
          </CardContent>
      </Card>

      <Card>
          <CardHeader>
            <CardTitle className="text-base">API 连接测试</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Chat Model Test */}
            <div className="flex items-start gap-4 p-4 rounded-lg border">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium">对话模型测试</span>
                  <Badge variant="outline">{model || "未配置"}</Badge>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTest("chat")}
                  disabled={chatTesting}
                >
                  {chatTesting ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-1" />
                  )}
                  {chatTesting ? "测试中..." : "测试连接"}
                </Button>
                {chatResult && (
                  <div className={`mt-3 text-sm ${chatResult.success ? "text-green-600" : "text-red-600"}`}>
                    <div className="flex items-center gap-1">
                      {chatResult.success ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      <span>{chatResult.success ? "连接成功" : "连接失败"}</span>
                    </div>
                    {chatResult.response && (
                      <p className="mt-1 text-muted-foreground">
                        响应: {chatResult.response.slice(0, 100)}
                      </p>
                    )}
                    {chatResult.error && (
                      <p className="mt-1 text-red-500">
                        错误: {chatResult.details || chatResult.error}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Vision Model Test */}
            <div className="flex items-start gap-4 p-4 rounded-lg border">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium">多模态模型测试</span>
                  <Badge variant="outline">{visionModel || "未配置"}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  用于文档图片解析、扫描件处理
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTest("vision")}
                  disabled={visionTesting}
                >
                  {visionTesting ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-1" />
                  )}
                  {visionTesting ? "测试中..." : "测试连接"}
                </Button>
                {visionResult && (
                  <div className={`mt-3 text-sm ${visionResult.success ? "text-green-600" : "text-red-600"}`}>
                    <div className="flex items-center gap-1">
                      {visionResult.success ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      <span>{visionResult.success ? "连接成功" : "连接失败"}</span>
                    </div>
                    {visionResult.response && (
                      <p className="mt-1 text-muted-foreground">
                        响应: {visionResult.response.slice(0, 100)}
                      </p>
                    )}
                    {visionResult.error && (
                      <p className="mt-1 text-red-500">
                        错误: {visionResult.details || visionResult.error}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
        </CardContent>
      </Card>

      {/* Token Usage Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Token 消耗统计
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
            {/* Summary Stats */}
            {tokenUsage?.summary && (
              <div className="grid grid-cols-4 gap-4">
                <div className="flex flex-col p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <Zap className="h-3 w-3" />
                    总消耗
                  </div>
                  <div className="text-lg font-semibold">
                    {tokenUsage.summary.totalTokens.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">tokens</div>
                </div>
                <div className="flex flex-col p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <Hash className="h-3 w-3" />
                    请求数
                  </div>
                  <div className="text-lg font-semibold">
                    {tokenUsage.summary.totalRequests.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">requests</div>
                </div>
                <div className="flex flex-col p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    提示词
                  </div>
                  <div className="text-lg font-semibold">
                    {tokenUsage.summary.totalPromptTokens.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">prompt</div>
                </div>
                <div className="flex flex-col p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    补全
                  </div>
                  <div className="text-lg font-semibold">
                    {tokenUsage.summary.totalCompletionTokens.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">completion</div>
                </div>
              </div>
            )}

            {/* Chart */}
            <div className="mt-4">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                <Calendar className="h-3 w-3" />
                最近 30 天消耗趋势
              </div>
              <div className="border rounded-lg p-4">
                <TokenUsageChart
                  data={tokenUsage?.dailyUsage || []}
                  height={200}
                />
              </div>
            </div>

            {!tokenUsage?.summary?.totalTokens && (
              <div className="text-center text-sm text-muted-foreground py-4">
                暂无 token 消耗记录，开始使用 AI 功能后将自动记录
              </div>
            )}
          </CardContent>
      </Card>
    </div>
  );
}
