import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_EMBEDDING_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4/embeddings';
// 实测：embedding-2 对中文短文本的语义区分度远好于 embedding-3（相关 0.42~0.51 vs 无关 0.09~0.35，干净分开；
// embedding-3 基线 ~0.5，相关/无关重叠）。故默认用 embedding-2。
export const DEFAULT_EMBEDDING_MODEL = 'embedding-2';

export interface EmbeddingConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * 读取 embedding 配置：env 覆盖 > 复用 GLM settings 里的 token。
 * 默认走智谱（复用 settings-glm.json 的 key），换厂商 = 改 env（和 AgentMember 适配器同理）。
 */
export function loadEmbeddingConfig(): EmbeddingConfig {
  const apiKey = process.env.ZHIPU_API_KEY ?? readApiKeyFromSettings();
  if (!apiKey) {
    throw new Error('缺少 embedding API key：设置 ZHIPU_API_KEY 或确保 ~/.claude/settings-glm.json 里有 token');
  }
  return {
    apiKey,
    baseUrl: process.env.ZHIPU_EMBEDDING_BASE_URL ?? DEFAULT_EMBEDDING_BASE_URL,
    model: process.env.ZHIPU_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL,
  };
}

/** 从 ~/.claude/settings-glm.json 读 token（复用 GLM 的 key，和智谱原生 API 同 key 体系）。 */
function readApiKeyFromSettings(): string {
  try {
    const raw = JSON.parse(readFileSync(join(homedir(), '.claude/settings-glm.json'), 'utf8')) as {
      env?: { ANTHROPIC_AUTH_TOKEN?: string };
    };
    return raw.env?.ANTHROPIC_AUTH_TOKEN ?? '';
  } catch {
    return '';
  }
}

/** 批量把文本转成向量（一次请求），返回与输入等长的向量数组。 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const cfg = loadEmbeddingConfig();
  const res = await fetch(cfg.baseUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({ model: cfg.model, input: texts }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`embedding 请求失败 (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data?: { embedding: number[] }[] };
  return (json.data ?? []).map((d) => d.embedding);
}

/** 单条文本转向量。 */
export async function embedOne(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  if (!vector) throw new Error('embedding 返回空向量');
  return vector;
}
