import { z } from "zod";

export const wikiQuestionSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  keywords: z.array(z.string().trim().min(1).max(120)).transform((keywords) => {
    const seen = new Set<string>();
    return keywords.filter((keyword) => {
      const key = keyword.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 20);
  }),
  objects: z.array(z.string().trim().min(1).max(120)).max(10),
  environments: z.array(z.enum(["EU Odoo 17", "UK Odoo 17", "US Odoo 18"])).max(3),
}).strict();
export type WikiQuestion = z.infer<typeof wikiQuestionSchema>;

export interface WikiQaProgress {
  actionRunId: string;
  layer: "server";
  module: "wiki-qa";
  stage: string;
  phase: "extract" | "retrieve" | "rerank" | "evidence" | "answer";
  status: "started" | "completed" | "failed" | "cancelled";
  message: string;
  errorCode?: string;
}

export interface WikiSourceEvidence {
  id: string;
  path: string;
  content: string;
  complete: boolean;
}

export interface WikiCandidate {
  id: string;
  path: string;
  title: string;
  status: "draft" | "confirmed" | "unknown";
  environments: string[];
  content: string;
  sourceEvidence: WikiSourceEvidence[];
  limitations: string[];
  historicalOnly: boolean;
}

export const wikiRankingSchema = z.object({
  matches: z.array(z.object({
    candidateId: z.string().min(1),
    applicability: z.enum(["applicable", "historical_reference"]),
    conditionsMatched: z.boolean().default(false),
    evidenceIds: z.array(z.string().min(1)).max(12),
    limitations: z.array(z.string().max(500)).max(6),
  }).strict()).max(5),
}).strict();

export interface WikiKnowledgeEvidence extends Omit<WikiCandidate, "id" | "historicalOnly"> {
  sourceId: number;
  applicability: "applicable" | "historical_reference";
}

export interface WikiKnowledgeReader {
  search(input: WikiQuestion & { signal?: AbortSignal }): Promise<WikiCandidate[]>;
  selectEvidence?(input: { candidate: WikiCandidate; question: WikiQuestion; evidenceIds: string[]; signal?: AbortSignal }): WikiSourceEvidence[];
}

export class WikiQaError extends Error {
  constructor(
    readonly code: "WIKI_QA_UNAVAILABLE" | "WIKI_QA_OUTPUT_INVALID" | "WIKI_QA_REFERENCE_INVALID" | "WIKI_QA_MODEL_FAILED",
    message: string,
    readonly diagnostic: { layer: "server" | "adapter"; module: string; stage: string; actionRunId?: string },
  ) {
    super(message);
    this.name = "WikiQaError";
  }
}
