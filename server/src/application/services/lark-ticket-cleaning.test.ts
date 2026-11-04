import { buildLarkTicketCleaningProjection } from "./lark-ticket-cleaning.js";

describe("Lark Ticket hyperlink cleaning", () => {
  it("reads the hyperlink URL ahead of its display label for thread deduplication and AI context", () => {
    const url = "https://applink.larksuite.com/client/thread/open?threadid=omt_ticket&messageid=om_root";
    expect(buildLarkTicketCleaningProjection({
      "Lark Message Link": { text: "Lark thread", link: url },
      "Details Description": "Question",
    })).toMatchObject({ larkMessageLink: url, detailDescription: "Question" });
    expect(buildLarkTicketCleaningProjection({ "Lark Message Link": [{ text: "Topic", link: url }] }).larkMessageLink).toBe(url);
  });
});
