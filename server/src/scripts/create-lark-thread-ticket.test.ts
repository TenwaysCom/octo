import { parseArgs } from "./create-lark-thread-ticket.js";

describe("single Lark thread ticket CLI", () => {
  it("requires a single explicit chat/message and defaults to preview", () => {
    expect(parseArgs(["--chat-id", "oc_test", "--message-id", "om_root"])).toMatchObject({ chatId: "oc_test", messageId: "om_root", apply: false });
    expect(parseArgs(["--", "--chat-id", "oc_test", "--message-id", "om_root", "--apply"])).toMatchObject({ apply: true });
    expect(() => parseArgs(["--chat-id", "oc_test"])).toThrow();
    expect(() => parseArgs(["--chat-id", "oc_test", "--message-id", "om_root", "--all"])).toThrow();
    expect(parseArgs(["--chat-id", "oc_test", "--thread-link", "https://applink.larksuite.com/client/thread/open?threadid=123"])).toMatchObject({ threadLink: expect.stringContaining("threadid=123"), apply: false });
    expect(() => parseArgs(["--chat-id", "oc_test", "--message-id", "om_root", "--thread-link", "https://applink.larksuite.com/client/thread/open?threadid=123"])).toThrow();
  });
});
