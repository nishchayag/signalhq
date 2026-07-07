import { describe, expect, it } from "vitest";
import { escapeCsvField, messagesToCsv } from "@/lib/csv";
import type { IMessage } from "@/models/message.model";

describe("escapeCsvField", () => {
  it("leaves a plain field untouched", () => {
    expect(escapeCsvField("hello world")).toBe("hello world");
  });

  it("quotes a field containing a comma", () => {
    expect(escapeCsvField("hello, world")).toBe('"hello, world"');
  });

  it("quotes and doubles embedded quotes", () => {
    expect(escapeCsvField('she said "hi"')).toBe('"she said ""hi"""');
  });

  it("quotes a field containing a newline", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it.each(["=", "+", "-", "@"])(
    "neutralizes a leading %s to prevent spreadsheet formula execution",
    (trigger) => {
      const payload = `${trigger}HYPERLINK(http://evil.example)`;
      expect(escapeCsvField(payload)).toBe(`'${payload}`);
    }
  );

  it("does not neutralize a formula-trigger character mid-field", () => {
    expect(escapeCsvField("total = 5")).toBe("total = 5");
  });

  it("quotes a neutralized field that also contains a comma", () => {
    expect(escapeCsvField("=SUM(A1,A2)")).toBe('"\'=SUM(A1,A2)"');
  });
});

describe("messagesToCsv", () => {
  function fakeMessage(overrides: Partial<IMessage> = {}): IMessage {
    return {
      content: "Great product!",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      ...overrides,
    } as IMessage;
  }

  it("emits a header row", () => {
    const csv = messagesToCsv([]);
    expect(csv).toBe("Content,Submitted At,Reply,Replied At");
  });

  it("emits a row per message with empty reply columns when unanswered", () => {
    const csv = messagesToCsv([fakeMessage()]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("Great product!,2026-01-01T00:00:00.000Z,,");
  });

  it("includes reply content and timestamp when present", () => {
    const csv = messagesToCsv([
      fakeMessage({
        reply: {
          content: "Thanks!",
          repliedAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      }),
    ]);
    const [, row] = csv.split("\n");
    expect(row).toBe(
      "Great product!,2026-01-01T00:00:00.000Z,Thanks!,2026-01-02T00:00:00.000Z"
    );
  });

  it("escapes content containing a comma", () => {
    const csv = messagesToCsv([fakeMessage({ content: "Nice, thanks" })]);
    const [, row] = csv.split("\n");
    expect(row.startsWith('"Nice, thanks"')).toBe(true);
  });

  it("neutralizes formula-triggering content from an anonymous submitter", () => {
    const csv = messagesToCsv([
      fakeMessage({ content: "=HYPERLINK(http://evil.example)" }),
    ]);
    const [, row] = csv.split("\n");
    expect(row.startsWith("'=HYPERLINK")).toBe(true);
  });
});
