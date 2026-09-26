import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import NewMessageEmail from "@/emailTemplates/newMessageEmail";

const base = {
  name: "Sam",
  count: 3,
  dashboardUrl: "https://example.test/dashboard",
  settingsUrl: "https://example.test/dashboard/account#notifications",
};

describe("NewMessageEmail", () => {
  it("renders the plain count email without an AI section when no summaries", async () => {
    const html = await render(NewMessageEmail(base));
    expect(html).toContain("3 new messages");
    expect(html).not.toContain("AI summary");
    expect(html).not.toContain("Generated automatically");
  });

  it("links the settings footer text to settingsUrl and declares a light color scheme", async () => {
    const html = await render(NewMessageEmail(base));
    expect(html).toContain(`href="${base.settingsUrl}"`);
    expect(html).toContain('name="color-scheme" content="light"');
    expect(html).toContain('name="supported-color-schemes" content="light"');
  });

  it("renders one AI summary section per org, with bullets, and escapes HTML", async () => {
    const html = await render(
      NewMessageEmail({
        ...base,
        aiSummaries: [
          { orgName: "Acme", bullets: ["Meetings run long", "<script>alert(1)</script>"] },
          { orgName: "Beta <b>", bullets: ["Pay concerns"] },
        ],
      })
    );
    expect(html).toContain("AI summary · <!-- -->Acme");
    expect(html).toContain("Meetings run long");
    expect(html).toContain("Pay concerns");
    expect(html).toContain("Generated automatically — open the dashboard for the full messages.");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("Beta <b>");
  });
});
