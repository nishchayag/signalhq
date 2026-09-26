import { afterEach, describe, expect, it, vi } from "vitest";

const { enrichMessage, dispatchMessageEvent, hasActiveIntegrations, isAiEnabled } = vi.hoisted(() => ({
  enrichMessage: vi.fn(async () => "done"),
  dispatchMessageEvent: vi.fn(async () => {}),
  hasActiveIntegrations: vi.fn(async () => false),
  isAiEnabled: vi.fn(() => true),
}));

vi.mock("@/lib/aiEnrichment", () => ({ enrichMessage }));
vi.mock("@/lib/webhooks", () => ({ dispatchMessageEvent, hasActiveIntegrations }));
vi.mock("@/lib/ai", () => ({ isAiEnabled }));

import { afterMessageCreated } from "@/lib/messageEvents";

afterEach(() => {
  vi.clearAllMocks();
  hasActiveIntegrations.mockResolvedValue(false);
  isAiEnabled.mockReturnValue(true);
});

describe("afterMessageCreated", () => {
  it("orgs with no integrations: enriches with no deadline (unchanged from before), then dispatches (a cheap no-op)", async () => {
    hasActiveIntegrations.mockResolvedValue(false);
    await afterMessageCreated({ organizationId: "org1", messageId: "msg1", event: "message.created" });
    expect(enrichMessage).toHaveBeenCalledTimes(1);
    expect(enrichMessage).toHaveBeenCalledWith("msg1");
    expect(dispatchMessageEvent).toHaveBeenCalledWith({
      organizationId: "org1",
      messageId: "msg1",
      event: "message.created",
    });
  });

  it("orgs with integrations: enriches with a ~12s deadline before dispatching, so tags are ready in time", async () => {
    hasActiveIntegrations.mockResolvedValue(true);
    const before = Date.now();
    await afterMessageCreated({ organizationId: "org1", messageId: "msg1", event: "message.created" });
    expect(enrichMessage).toHaveBeenCalledTimes(1);
    const [id, opts] = enrichMessage.mock.calls[0] as unknown as [string, { deadline: number }];
    expect(id).toBe("msg1");
    expect(opts.deadline).toBeGreaterThanOrEqual(before + 11_000);
    expect(opts.deadline).toBeLessThanOrEqual(Date.now() + 12_000);
    expect(dispatchMessageEvent).toHaveBeenCalledTimes(1);
  });

  it("enrichment happens before dispatch (so tags can make it into the payload)", async () => {
    hasActiveIntegrations.mockResolvedValue(true);
    const order: string[] = [];
    enrichMessage.mockImplementationOnce(async () => {
      order.push("enrich");
      return "done";
    });
    dispatchMessageEvent.mockImplementationOnce(async () => {
      order.push("dispatch");
    });
    await afterMessageCreated({ organizationId: "org1", messageId: "msg1", event: "message.created" });
    expect(order).toEqual(["enrich", "dispatch"]);
  });

  it("AI off: skips enrichMessage entirely but still dispatches", async () => {
    isAiEnabled.mockReturnValue(false);
    hasActiveIntegrations.mockResolvedValue(true);
    await afterMessageCreated({ organizationId: "org1", messageId: "msg1", event: "message.followup" });
    expect(enrichMessage).not.toHaveBeenCalled();
    expect(dispatchMessageEvent).toHaveBeenCalledWith({
      organizationId: "org1",
      messageId: "msg1",
      event: "message.followup",
    });
  });

  it("a null/undefined organizationId is passed straight through to hasActiveIntegrations and dispatch", async () => {
    hasActiveIntegrations.mockResolvedValue(false);
    await afterMessageCreated({ organizationId: null, messageId: "msg1", event: "message.created" });
    expect(hasActiveIntegrations).toHaveBeenCalledWith(null);
    expect(dispatchMessageEvent).toHaveBeenCalledWith({
      organizationId: null,
      messageId: "msg1",
      event: "message.created",
    });
  });
});
