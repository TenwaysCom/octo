/**
 * PR Meegle Lookup DTO
 *
 * Zod schemas for request/response validation
 */

import { z } from "zod";

/**
 * Request schema for PR Meegle lookup
 */
export const PrMeegleLookupRequestSchema = z.object({
  // PR 描述文本
  prDescription: z.string(),
  // PR 标题（可选，也会被扫描）
  prTitle: z.string().optional(),
  // 用户 ID（用于 Meegle 认证）
  masterUserId: z.string(),
  // Meegle 基础 URL（可选）
  meegleBaseUrl: z.string().optional(),
  // 指定项目 key（可选，默认使用环境变量中的 DEFAULT_MEEGLE_PROJECT_KEY）
  projectKey: z.string().optional(),
  // 字段映射配置（用于提取 sprint、feature 等字段）
  fieldMapping: z.object({
    sprint: z.string().optional(),
    feature: z.string().optional(),
  }).optional(),
});

export type PrMeegleLookupRequest = z.infer<typeof PrMeegleLookupRequestSchema>;

/**
 * 提取的 Meegle ID 信息
 */
export interface ExtractedMeegleId {
  // 原始文本
  raw: string;
  // 解析出的 key（如 m-123）
  key: string;
  // projectKey（如 m）
  projectKey: string;
  // 数字 ID（如 123）
  numericId: string;
}

/**
 * 工作项信息
 */
export interface WorkitemInfo {
  // 工作项 ID
  id: string;
  // 工作项 key（如 M-123）
  key: string;
  // 标题
  name: string;
  // 类型
  type: string;
  // 状态
  status: string;
  // 负责人
  assignee?: string;
  // Sprint
  sprint?: string;
  // 功能信息
  feature?: string;
  // 其他字段
  fields: Record<string, unknown>;
  // Meegle URL
  url?: string;
}

/**
 * 响应结构
 */
export interface PrMeegleLookupResult {
  ok: boolean;
  data?: {
    // 提取的 Meegle IDs
    extractedIds: ExtractedMeegleId[];
    // 查询到的工作项信息
    workitems: WorkitemInfo[];
    // 未找到的 IDs
    notFound: string[];
  };
  error?: {
    errorCode: string;
    errorMessage: string;
  };
}

/**
 * Validate request input
 */
export function validatePrMeegleLookupRequest(input: unknown): PrMeegleLookupRequest {
  return PrMeegleLookupRequestSchema.parse(input);
}
