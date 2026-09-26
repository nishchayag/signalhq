import { describe, expect, it } from "vitest";
import { escapeCsvField, messagesToCsv } from "@/lib/csv";
import type { ThreadSource } from "@/lib/thread";

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
  function fakeMessage(overrides: Partial<ThreadSource> = {}): ThreadSource {
    return {
      content: "Great product!",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      ...overrides,
    };
  }

  it("emits a header row", () => {
    const csv = messagesToCsv([]);
    expect(csv).toBe("Content,Submitted At,Replies,Last Reply At");
  });

  it("emits a row per message with empty reply columns when unanswered", () => {
    const csv = messagesToCsv([fakeMessage()]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("Great product!,2026-01-01T00:00:00.000Z,,");
  });

  it("renders an org reply as an Org turn", () => {
    const csv = messagesToCsv([
      fakeMessage({
        replies: [
          { authorRole: "org", content: "Thanks!", createdAt: new Date("2026-01-02T00:00:00.000Z") },
        ],
      }),
    ]);
    const [, row] = csv.split("\n");
    expect(row).toBe(
      "Great product!,2026-01-01T00:00:00.000Z,Org (2026-01-02T00:00:00.000Z): Thanks!,2026-01-02T00:00:00.000Z"
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

  it("serializes the whole thread in order, one turn per line", () => {
    const csv = messagesToCsv([
      fakeMessage({
        replies: [
          { authorRole: "sender", content: "Any update?", createdAt: new Date("2026-01-03T00:00:00.000Z") },
          { authorRole: "org", content: "Looking into it", createdAt: new Date("2026-01-02T00:00:00.000Z") },
        ],
      }),
    ]);
    const body = csv.slice(csv.indexOf("\n") + 1);
    expect(body).toBe(
      'Great product!,2026-01-01T00:00:00.000Z,"Org (2026-01-02T00:00:00.000Z): Looking into it\n' +
        'Sender (2026-01-03T00:00:00.000Z): Any update?",2026-01-03T00:00:00.000Z'
    );
  });

  it("neutralizes formula triggers inside thread turns", () => {
    const csv = messagesToCsv([
      fakeMessage({
        replies: [
          { authorRole: "sender", content: "=HYPERLINK(evil)\n+cmd", createdAt: new Date("2026-01-02T00:00:00.000Z") },
          { authorRole: "org", content: "@SUM(1)", createdAt: new Date("2026-01-03T00:00:00.000Z") },
        ],
      }),
    ]);
    expect(csv).toContain("Sender (2026-01-02T00:00:00.000Z): '=HYPERLINK(evil)\n'+cmd");
    expect(csv).toContain("Org (2026-01-03T00:00:00.000Z): '@SUM(1)");
    // No line of the file starts with a raw trigger.
    for (const line of csv.split("\n")) expect(line).not.toMatch(/^[=+\-@]/);
  });
});
