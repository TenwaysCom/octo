import { describe, expect, it } from "vitest";
import { createTestPostgresDatabase } from "./test-db.js";
import { PostgresSupportKnowledgeStore } from "./support-knowledge-store.js";

describe("PostgresSupportKnowledgeStore", () => {
  it("returns only approved, redacted document and historical-case chunks with citations", async () => {
    const { db } = await createTestPostgresDatabase();
    const store = new PostgresSupportKnowledgeStore(db);
    const document = await store.upsertApprovedDocument({
      sourceKind: "controlled_document",
      sourceRef: "docs/support-qa/vpn-cert-reset",
      title: "VPN certificate reset",
      redactedSummary: "Use the approved VPN certificate reset instructions.",
      tags: ["VPN", "certificate"],
      approvedBy: "ou_owner",
      approvedAt: "2026-09-01T08:00:00.000Z",
    });
    await store.replaceRedactedChunks({
      documentId: document.id,
      chunks: ["Reset the VPN certificate. Contact jane@example.com only through the approved channel."],
    });
    const caseDocument = await store.upsertApprovedDocument({
      sourceKind: "approved_case",
      sourceRef: "case:LT-100:segment-1",
      title: "VPN certificate expired resolution",
      tags: ["VPN"],
      approvedBy: "ou_reviewer",
      approvedAt: "2026-09-01T09:00:00.000Z",
    });
    await store.replaceRedactedChunks({
      documentId: caseDocument.id,
      chunks: ["A support engineer reset the certificate and the requester confirmed recovery."],
    });

    await expect(store.searchApproved({ query: "VPN cannot connect", limit: 5 })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceKind: "controlled_document",
        sourceRef: "docs/support-qa/vpn-cert-reset",
        redactedContent: expect.stringContaining("[EMAIL]"),
      }),
      expect.objectContaining({
        sourceKind: "approved_case",
        sourceRef: "case:LT-100:segment-1",
      }),
    ]));

    await store.revoke({ documentId: caseDocument.id });
    await expect(store.searchApproved({ query: "VPN", limit: 5 })).resolves.not.toEqual(expect.arrayContaining([
      expect.objectContaining({ documentId: caseDocument.id }),
    ]));
  });

  it("does not retain chunks for a document that is no longer approved", async () => {
    const { db } = await createTestPostgresDatabase();
    const store = new PostgresSupportKnowledgeStore(db);
    const document = await store.upsertApprovedDocument({
      sourceKind: "approved_case",
      sourceRef: "case:LT-101:segment-1",
      title: "Login error",
      approvedBy: "ou_reviewer",
      approvedAt: "2026-09-01T09:00:00.000Z",
    });
    await store.revoke({ documentId: document.id });

    await expect(store.replaceRedactedChunks({
      documentId: document.id,
      chunks: ["This must not be persisted."],
    })).rejects.toThrow("SUPPORT_KNOWLEDGE_DOCUMENT_NOT_APPROVED");
  });
});
