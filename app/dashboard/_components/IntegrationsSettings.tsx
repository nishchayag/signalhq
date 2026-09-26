"use client";
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  AlertTriangle,
  Copy,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useConfirm } from "@/components/ConfirmProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import {
  INTEGRATION_EVENTS,
  INTEGRATION_MAX_PER_ORG,
  INTEGRATION_NAME_MAX,
  type IntegrationEvent,
  type IntegrationKind,
  type IntegrationLastStatus,
  type IntegrationPayloadMode,
} from "@/lib/integrationConstants";
import {
  INTEGRATION_EVENT_LABEL,
  INTEGRATION_KIND_LABEL,
  deliveryStatusInfo,
  integrationErrorMessage,
  relativeTimeFrom,
} from "@/lib/integrationsUi";

interface IntegrationRow {
  _id: string;
  kind: IntegrationKind;
  name: string;
  enabled: boolean;
  payloadMode: IntegrationPayloadMode;
  events: IntegrationEvent[];
  targetHost: string;
  secretHint: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastStatus: IntegrationLastStatus | null;
  lastHttpStatus: number | null;
  consecutiveFailures: number;
  disabledAt: string | null;
  disabledReason: string | null;
  createdAt: string;
}

const SELECT_CLASS =
  "flex h-11 w-full rounded-lg border-2 border-ink bg-card px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

interface IntegrationsSettingsProps {
  orgId: string;
}

/**
 * Org settings' Integrations tab: Slack and signed-webhook message
 * delivery. Self-fetching (GET /api/organizations/:orgId/integrations) so
 * the parent org page only wires in the tab entry — see
 * app/dashboard/organization/page.tsx. Follows the BrandingSettings
 * pattern: visible to every member, but only OWNER/ADMIN (`org:integrations`,
 * surfaced here as the server's `canManage`) get live controls. On a FREE
 * plan those controls stay visible but disabled (an upsell, not a hidden
 * section); a plain MEMBER gets a read-only list instead.
 */
export default function IntegrationsSettings({ orgId }: IntegrationsSettingsProps) {
  const { trackEvent } = useAnalytics();
  const confirm = useConfirm();

  const [loading, setLoading] = useState(true);
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [canManage, setCanManage] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<IntegrationRow | null>(null);
  const [secretDialog, setSecretDialog] = useState<{ name: string; secret: string } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // canManage: the viewer's role can act (OWNER/ADMIN). editable: it can
  // AND the plan allows it — the switches/buttons below render whenever
  // canManage is true (so an admin on FREE still sees what they'd get) but
  // are disabled unless editable.
  const editable = canManage && allowed;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/organizations/${orgId}/integrations`);
      if (res.data.success) {
        setIntegrations(res.data.integrations);
        setAllowed(!!res.data.allowed);
        setCanManage(!!res.data.canManage);
      }
    } catch {
      toast.error("Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    // Standard fetch-on-mount; `load` is a stable useCallback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const patchIntegration = async (
    integrationId: string,
    body: Record<string, unknown>,
    fallback: string
  ): Promise<IntegrationRow | null> => {
    try {
      const res = await axios.patch(`/api/organizations/${orgId}/integrations/${integrationId}`, body);
      if (res.data.success) return res.data.integration as IntegrationRow;
      toast.error(res.data.message || fallback);
      return null;
    } catch (e) {
      toast.error(integrationErrorMessage(e, fallback));
      return null;
    }
  };

  const createIntegration = async (body: Record<string, unknown>): Promise<boolean> => {
    try {
      const res = await axios.post(`/api/organizations/${orgId}/integrations`, body);
      if (!res.data.success) {
        toast.error(res.data.message || "Failed to add integration");
        return false;
      }
      const integration = res.data.integration as IntegrationRow;
      setIntegrations((prev) => [...prev, integration]);
      trackEvent("integration_created", integration.kind);
      if (res.data.signingSecret) {
        setSecretDialog({ name: integration.name, secret: res.data.signingSecret });
      } else {
        toast.success("Integration added");
      }
      return true;
    } catch (e) {
      toast.error(integrationErrorMessage(e, "Failed to add integration"));
      return false;
    }
  };

  const updateIntegration = async (integrationId: string, body: Record<string, unknown>): Promise<boolean> => {
    const updated = await patchIntegration(integrationId, body, "Failed to update integration");
    if (!updated) return false;
    setIntegrations((prev) => prev.map((i) => (i._id === integrationId ? updated : i)));
    toast.success("Integration updated");
    return true;
  };

  const toggleEnabled = async (row: IntegrationRow, enabled: boolean) => {
    setTogglingId(row._id);
    const updated = await patchIntegration(row._id, { enabled }, "Failed to update integration");
    if (updated) setIntegrations((prev) => prev.map((i) => (i._id === row._id ? updated : i)));
    setTogglingId(null);
  };

  const sendTest = async (row: IntegrationRow) => {
    setTestingId(row._id);
    try {
      const res = await axios.post(`/api/organizations/${orgId}/integrations/${row._id}/test`);
      if (!res.data.success) {
        toast.error(res.data.message || "Test failed");
        return;
      }
      const { ok, status, httpStatus } = res.data as {
        ok: boolean;
        status: IntegrationLastStatus;
        httpStatus?: number;
      };
      trackEvent("integration_tested", row.kind);
      toast[ok ? "success" : "error"](
        ok
          ? "Test event delivered"
          : httpStatus != null
            ? `Test failed (HTTP ${httpStatus})`
            : "Test failed — couldn't reach the target"
      );
      const now = new Date().toISOString();
      setIntegrations((prev) =>
        prev.map((i) =>
          i._id === row._id
            ? {
                ...i,
                lastAttemptAt: now,
                lastStatus: status,
                lastHttpStatus: httpStatus ?? i.lastHttpStatus,
                lastSuccessAt: ok ? now : i.lastSuccessAt,
              }
            : i
        )
      );
    } catch (e) {
      toast.error(integrationErrorMessage(e, "Test failed"));
    } finally {
      setTestingId(null);
    }
  };

  const rotateSecret = async (row: IntegrationRow) => {
    let result: { integration: IntegrationRow; signingSecret: string } | null = null;
    const ok = await confirm({
      title: `Rotate the signing secret for "${row.name}"?`,
      description: "The old secret stops working immediately — update your endpoint with the new one.",
      confirmLabel: "Rotate secret",
      destructive: true,
      action: async () => {
        const res = await axios.post(`/api/organizations/${orgId}/integrations/${row._id}/rotate-secret`);
        result = res.data;
      },
    });
    if (!ok || !result) return;
    const { integration, signingSecret } = result as { integration: IntegrationRow; signingSecret: string };
    setIntegrations((prev) => prev.map((i) => (i._id === row._id ? integration : i)));
    setSecretDialog({ name: integration.name, secret: signingSecret });
  };

  const deleteIntegration = async (row: IntegrationRow) => {
    const ok = await confirm({
      title: `Delete "${row.name}"?`,
      description: "It stops receiving new feedback immediately. This can't be undone.",
      confirmLabel: "Delete integration",
      destructive: true,
      action: () => axios.delete(`/api/organizations/${orgId}/integrations/${row._id}`),
    });
    if (!ok) return;
    toast.success("Integration deleted");
    setIntegrations((prev) => prev.filter((i) => i._id !== row._id));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!allowed && (
        <Card className="bg-brand-yellow/25">
          <CardContent className="p-4">
            <p className="font-bold text-foreground">Integrations are available on Pro</p>
            <p className="text-sm text-muted-foreground">
              Upgrade to send new feedback straight to Slack or your own webhook endpoint.
              Switch plans from the Plan tab — pricing isn&apos;t decided yet, so you can try
              it for free during early access.
            </p>
          </CardContent>
        </Card>
      )}
      {allowed && !canManage && (
        <p className="text-sm text-muted-foreground">
          Only owners and admins can manage integrations.
        </p>
      )}

      {canManage && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            onClick={() => setAddOpen(true)}
            disabled={!editable || integrations.length >= INTEGRATION_MAX_PER_ORG}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add integration
          </Button>
          {integrations.length >= INTEGRATION_MAX_PER_ORG && (
            <p className="text-xs text-muted-foreground">
              You can have up to {INTEGRATION_MAX_PER_ORG} integrations.
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        {integrations.length === 0 && (
          <p className="text-sm text-muted-foreground/70">No integrations yet.</p>
        )}
        {integrations.map((row) => {
          const status = deliveryStatusInfo(row.lastStatus, row.lastHttpStatus);
          return (
            <Card key={row._id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="shrink-0 rounded-md border-2 border-ink bg-secondary px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-secondary-foreground">
                        {INTEGRATION_KIND_LABEL[row.kind]}
                      </span>
                      <p className="min-w-0 truncate font-semibold text-foreground">{row.name}</p>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground" title={row.targetHost}>
                      {row.targetHost}
                    </p>
                  </div>
                  {canManage && !row.disabledAt && (
                    <Switch
                      aria-label={`${row.enabled ? "Disable" : "Enable"} ${row.name}`}
                      checked={row.enabled}
                      disabled={!editable || togglingId === row._id}
                      onCheckedChange={(checked) => toggleEnabled(row, checked)}
                    />
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="rounded-md border border-ink/40 px-1.5 py-0.5 text-muted-foreground">
                    {row.payloadMode === "full" ? "Full" : "Nudge"}
                  </span>
                  {row.events.map((event) => (
                    <span
                      key={event}
                      className="rounded-md border border-ink/40 px-1.5 py-0.5 text-muted-foreground"
                    >
                      {INTEGRATION_EVENT_LABEL[event]}
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      status.tone === "success"
                        ? "bg-brand-mint"
                        : status.tone === "danger"
                          ? "bg-destructive"
                          : "bg-muted-foreground/40"
                    }`}
                  />
                  <span
                    className={status.tone === "danger" ? "font-medium text-destructive" : "text-muted-foreground"}
                  >
                    {status.text}
                  </span>
                  {row.lastAttemptAt && (
                    <span className="text-muted-foreground/70">· {relativeTimeFrom(row.lastAttemptAt)}</span>
                  )}
                </div>

                {row.disabledAt && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-ink bg-brand-yellow/25 px-3 py-2">
                    <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-foreground">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Auto-disabled after repeated failures
                    </p>
                    {editable && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleEnabled(row, true)}
                        disabled={togglingId === row._id}
                      >
                        {togglingId === row._id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Re-enable"
                        )}
                      </Button>
                    )}
                  </div>
                )}

                {canManage && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => sendTest(row)}
                      disabled={!editable || testingId === row._id}
                    >
                      {testingId === row._id ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Send test
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditTarget(row)}
                      disabled={!editable}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    {row.kind === "webhook" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => rotateSecret(row)}
                        disabled={!editable}
                      >
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                        Rotate secret
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteIntegration(row)}
                      disabled={!editable}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5 text-destructive" />
                      Delete
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <IntegrationFormDialog
        open={addOpen}
        mode="create"
        onOpenChange={setAddOpen}
        onSubmit={createIntegration}
      />
      {editTarget && (
        <IntegrationFormDialog
          open
          mode="edit"
          integration={editTarget}
          onOpenChange={(v) => !v && setEditTarget(null)}
          onSubmit={(body) => updateIntegration(editTarget._id, body)}
        />
      )}
      <SigningSecretDialog data={secretDialog} onClose={() => setSecretDialog(null)} />
    </div>
  );
}

// Add/edit dialog. `kind` is fixed after creation (the schema rejects it on
// PATCH), and `url` is optional on edit — the target URL is select:false
// and never sent back to the client, so a blank field means "keep it".
function IntegrationFormDialog({
  open,
  mode,
  integration,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  integration?: IntegrationRow | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const isEdit = mode === "edit";

  const [kind, setKind] = useState<IntegrationKind>(integration?.kind ?? "webhook");
  const [name, setName] = useState(integration?.name ?? "");
  const [url, setUrl] = useState("");
  const [payloadMode, setPayloadMode] = useState<IntegrationPayloadMode>(integration?.payloadMode ?? "full");
  const [events, setEvents] = useState<IntegrationEvent[]>(integration?.events ?? [...INTEGRATION_EVENTS]);
  const [submitting, setSubmitting] = useState(false);

  // Re-seed the form whenever the dialog opens for a (possibly different)
  // integration — adjusted during render, same pattern as BrandingSettings'
  // prop-change reset.
  const seedKey = isEdit ? (integration?._id ?? null) : "create";
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (open && seedKey !== seededFor) {
    setSeededFor(seedKey);
    setKind(integration?.kind ?? "webhook");
    setName(integration?.name ?? "");
    setUrl("");
    setPayloadMode(integration?.payloadMode ?? "full");
    setEvents(integration?.events ?? [...INTEGRATION_EVENTS]);
  }

  const toggleEvent = (event: IntegrationEvent) =>
    setEvents((prev) => (prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]));

  const nameValid = name.trim().length > 0 && name.length <= INTEGRATION_NAME_MAX;
  const urlValid = isEdit || url.trim().length > 0;
  const eventsValid = events.length > 0;
  const canSubmit = nameValid && urlValid && eventsValid && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const trimmedUrl = url.trim();
      const body: Record<string, unknown> = isEdit
        ? { name: name.trim(), payloadMode, events, ...(trimmedUrl && { url: trimmedUrl }) }
        : { kind, name: name.trim(), url: trimmedUrl, payloadMode, events };
      const ok = await onSubmit(body);
      if (ok) onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit integration" : "Add integration"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this integration's name, target, payload or events."
              : "Connect Slack or a webhook so new feedback reaches it too."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="integration-kind">Kind</Label>
              <select
                id="integration-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as IntegrationKind)}
                className={SELECT_CLASS}
                disabled={submitting}
              >
                <option value="webhook">Webhook</option>
                <option value="slack">Slack</option>
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="integration-name">Name</Label>
              <span className="text-xs text-muted-foreground">
                {name.length}/{INTEGRATION_NAME_MAX}
              </span>
            </div>
            <Input
              id="integration-name"
              value={name}
              maxLength={INTEGRATION_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === "slack" ? "#product-feedback" : "Internal alerts"}
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="integration-url">{isEdit ? "New URL (optional)" : "URL"}</Label>
            <Input
              id="integration-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={
                kind === "slack" ? "https://hooks.slack.com/services/…" : "https://example.com/webhooks/signalhq"
              }
              disabled={submitting}
              className="truncate"
            />
            {isEdit && (
              <p className="truncate text-xs text-muted-foreground" title={integration?.targetHost}>
                Currently posting to {integration?.targetHost}. Leave blank to keep it.
              </p>
            )}
          </div>

          <fieldset className="space-y-2" disabled={submitting}>
            <legend className="text-sm font-bold text-foreground">Payload</legend>
            <div role="radiogroup" aria-label="Payload mode" className="space-y-2">
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border-2 border-ink p-3 has-[:checked]:bg-secondary">
                <input
                  type="radio"
                  name="payload-mode"
                  value="full"
                  checked={payloadMode === "full"}
                  onChange={() => setPayloadMode("full")}
                  className="mt-0.5 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">Full (default)</span>
                  <span className="block text-xs text-muted-foreground">
                    Posts feedback text to everyone in the channel, including team-scoped questions.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border-2 border-ink p-3 has-[:checked]:bg-secondary">
                <input
                  type="radio"
                  name="payload-mode"
                  value="nudge"
                  checked={payloadMode === "nudge"}
                  onChange={() => setPayloadMode("nudge")}
                  className="mt-0.5 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">Nudge</span>
                  <span className="block text-xs text-muted-foreground">
                    Only says new feedback arrived, with a link — no text leaves SignalHQ.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          <fieldset className="space-y-2" disabled={submitting}>
            <legend className="text-sm font-bold text-foreground">Events</legend>
            <div className="space-y-1.5">
              {INTEGRATION_EVENTS.map((event) => (
                <label key={event} className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={events.includes(event)}
                    onChange={() => toggleEvent(event)}
                    className="h-4 w-4 accent-primary"
                  />
                  {INTEGRATION_EVENT_LABEL[event]}
                </label>
              ))}
            </div>
            {!eventsValid && <p className="text-xs text-destructive">Choose at least one event.</p>}
          </fieldset>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Add integration"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const VERIFY_SNIPPET = `const crypto = require("node:crypto");

function verifySignalHQSignature(secret, rawBody, headers) {
  const timestamp = headers["x-signalhq-timestamp"];
  const signature = (headers["x-signalhq-signature"] || "").replace(/^v1=/, "");

  // Reject anything older than 5 minutes.
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}`;

// Shown once, right after create/rotate — the secret is never stored in
// component state anywhere but here, and is cleared the moment this closes.
function SigningSecretDialog({
  data,
  onClose,
}: {
  data: { name: string; secret: string } | null;
  onClose: () => void;
}) {
  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.secret);
      toast.success("Secret copied");
    } catch {
      toast.error("Couldn't copy — select and copy it manually");
    }
  };

  return (
    <Dialog open={!!data} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Signing secret{data ? ` for "${data.name}"` : ""}</DialogTitle>
          <DialogDescription>
            Copy it now — you won&apos;t see it again. Use it to verify that a delivery really
            came from SignalHQ.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={data?.secret ?? ""}
            className="min-w-0 flex-1 truncate font-mono text-sm"
            aria-label="Signing secret"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Copy signing secret"
            title="Copy signing secret"
            onClick={copy}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>

        <Accordion type="single" collapsible>
          <AccordionItem value="verify">
            <AccordionTrigger className="text-sm font-semibold">Verify signatures</AccordionTrigger>
            <AccordionContent>
              <pre className="overflow-x-auto rounded-lg border-2 border-ink bg-secondary p-3 text-xs">
                <code>{VERIFY_SNIPPET}</code>
              </pre>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
