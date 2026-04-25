import { NextResponse } from "next/server";
import { getAIClient, getModelName, getVisionModelName } from "@/lib/ai/client";

export async function POST(request: Request) {
  const body = await request.json();
  const { type } = body; // "chat" | "vision"

  try {
    const client = getAIClient();

    if (type === "vision") {
      // Test vision model accessibility
      // Vision models can usually handle text-only requests too
      const model = getVisionModelName();

      if (!model) {
        return NextResponse.json(
          { success: false, error: "多模态模型未配置" },
          { status: 400 }
        );
      }

      const response = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "user",
            content: "请回复：多模态模型API连接测试成功",
          },
        ],
        max_tokens: 50,
      });

      return NextResponse.json({
        success: true,
        model,
        response: response.choices[0]?.message?.content || "",
        usage: response.usage,
      });
    } else {
      // Test chat model with a simple question
      const model = getModelName();

      const response = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: "请回复：API测试成功" }],
        max_tokens: 50,
      });

      return NextResponse.json({
        success: true,
        model,
        response: response.choices[0]?.message?.content || "",
        usage: response.usage,
      });
    }
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      {
        success: false,
        error: err.message,
        details: (error as any).error?.message || err.message,
      },
      { status: 400 }
    );
  }
}
