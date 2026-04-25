import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { recordTokenUsage } from "./token-tracker";

export interface AISettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  embeddingModel: string;
  visionModel: string;
}

function getSettings(): AISettings {
  const settingsPath = path.join(process.cwd(), "data", "settings.json");
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    }
  } catch {
    // ignore
  }
  return {
    apiKey: process.env.DASHSCOPE_API_KEY || "",
    baseUrl: process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: process.env.DASHSCOPE_MODEL || "qwen-plus",
    embeddingModel: process.env.DASHSCOPE_EMBEDDING_MODEL || "text-embedding-v3",
    visionModel: process.env.DASHSCOPE_VISION_MODEL || "qwen-vl-max",
  };
}

export function getAIClient() {
  const settings = getSettings();
  return new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl,
  });
}

export function getModelName() {
  return getSettings().model;
}

export function getEmbeddingModelName() {
  return getSettings().embeddingModel;
}

export function getVisionModelName() {
  return getSettings().visionModel;
}

export async function chatCompletion(
  messages: OpenAI.ChatCompletionMessageParam[],
  options?: { temperature?: number; maxTokens?: number; trackTokens?: boolean }
) {
  const client = getAIClient();
  const model = getModelName();

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 2000,
  });

  // Track token usage (enabled by default)
  if (options?.trackTokens !== false && response.usage) {
    await recordTokenUsage(
      model,
      response.usage.prompt_tokens,
      response.usage.completion_tokens
    );
  }

  return response.choices[0]?.message?.content || "";
}

export async function chatCompletionStream(
  messages: OpenAI.ChatCompletionMessageParam[],
  options?: { temperature?: number; maxTokens?: number }
) {
  const client = getAIClient();
  const model = getModelName();

  const stream = await client.chat.completions.create({
    model,
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 4000,
    stream: true,
  });

  return stream;
}

/**
 * Chat completion with full response including usage stats
 */
export async function chatCompletionWithUsage(
  messages: OpenAI.ChatCompletionMessageParam[],
  options?: { temperature?: number; maxTokens?: number }
) {
  const client = getAIClient();
  const model = getModelName();

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 2000,
  });

  // Track token usage
  if (response.usage) {
    await recordTokenUsage(
      model,
      response.usage.prompt_tokens,
      response.usage.completion_tokens
    );
  }

  return {
    content: response.choices[0]?.message?.content || "",
    usage: response.usage,
    model,
  };
}
