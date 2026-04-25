import { getAIClient, getEmbeddingModelName } from "./client";

export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getAIClient();
  const model = getEmbeddingModelName();

  const response = await client.embeddings.create({
    model,
    input: text.slice(0, 2000), // text-embedding-v2限制2048 tokens，约1500-2000中文字符
  });

  return response.data[0].embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const client = getAIClient();
  const model = getEmbeddingModelName();
  const results: number[][] = [];

  // 优化：增加批量大小，减少API调用次数（API限制最大25）
  const batchSize = 25; // text-embedding-v2最大支持25
  const maxRetries = 5; // 429重试次数
  const baseDelay = 5000; // 基础等待时间5秒
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize).map((t) => t.slice(0, 2000)); // 限制2000字符
    
    // 带重试的API调用
    let response = null;
    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        response = await client.embeddings.create({
          model,
          input: batch,
        });
        break; // 成功则跳出重试循环
      } catch (error: any) {
        const is429 = error?.status === 429 || error?.error?.code === 'insufficient_quota';
        if (is429 && retry < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, retry); // 指数退避：5s, 10s, 20s, 40s
          console.log(`[Embeddings] 429 rate limited, retry ${retry + 1}/${maxRetries}, waiting ${delay/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error; // 非限流错误或重试耗尽，抛出
      }
    }
    
    results.push(...response!.data.map((d) => d.embedding));
  }

  return results;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function serializeEmbedding(embedding: number[]): Buffer {
  return Buffer.from(new Float32Array(embedding).buffer);
}

export function deserializeEmbedding(buffer: Buffer): number[] {
  return Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4));
}
