import { z } from "zod";
import { redactSupportText } from "./support-ticket-analysis.js";

export const MAX_KCS_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_KCS_IMAGE_BASE64 = Math.ceil(MAX_KCS_IMAGE_BYTES / 3) * 4;
export const kcsImageMediaType = z.enum(["image/png", "image/jpeg"]);
export const kcsImageKey = z.string().max(256).regex(/^[A-Za-z0-9_-]+$/);

const imageSignatures = {
  "image/png": Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  "image/jpeg": Buffer.from([255, 216, 255]),
};

export function kcsImageType(bytes: Buffer) {
  if (bytes.length > MAX_KCS_IMAGE_BYTES) return undefined;
  return kcsImageMediaType.options.find((mediaType) => {
    const signature = imageSignatures[mediaType];
    return bytes.subarray(0, signature.length).equals(signature);
  });
}

export const kcsVisionInput = z.object({
  media_type: kcsImageMediaType,
  data_base64: z.string().min(4).max(MAX_KCS_IMAGE_BASE64),
}).strict().transform(({ media_type, data_base64 }, ctx) => {
  const bytes = Buffer.from(data_base64, "base64");
  if (bytes.toString("base64") === data_base64 && kcsImageType(bytes) === media_type) {
    return { bytes, mediaType: media_type, imageDataUri: `data:${media_type};base64,${data_base64}` };
  }
  ctx.addIssue({ code: "custom", message: "Invalid KCS image data." });
  return z.NEVER;
});

const MAX_OBSERVATION_LENGTH = 1200;
const MAX_LABEL_LENGTH = 200;
const MAX_LIMITATIONS_LENGTH = 400;

function truncateText(text: string, limit: number) {
  return text.slice(0, limit).trimEnd().replace(/[\uD800-\uDFFF]/gu, "\uFFFD");
}

function normalizeLabels(value: unknown, limit: number) {
  const labels = new Set<string>();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== "string") continue;
      const label = truncateText(redactSupportText(item), MAX_LABEL_LENGTH);
      if (label) labels.add(label);
      if (labels.size === limit) break;
    }
  }
  return [...labels];
}

export const kcsVisionEvidence = z.object({
  observation: z.string().trim().min(1).max(MAX_OBSERVATION_LENGTH),
  visible_text: z.unknown().optional(),
  limitations: z.unknown().optional(),
}).transform(({ observation, visible_text, limitations }) => {
  const scope = typeof limitations === "string"
    ? redactSupportText(limitations)
    : normalizeLabels(limitations, 5).join("；");
  return {
    observation: truncateText(redactSupportText(observation), MAX_OBSERVATION_LENGTH),
    visible_text: normalizeLabels(visible_text, 6),
    limitations: truncateText(scope, MAX_LIMITATIONS_LENGTH) || "识读范围仅限这张图片中的可见内容。",
  };
});
