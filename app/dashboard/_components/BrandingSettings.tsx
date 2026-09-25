"use client";
import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import PublicBrandHeader from "@/components/PublicBrandHeader";
import { useConfirm } from "@/components/ConfirmProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { apiError } from "@/lib/apiError";
import { can } from "@/lib/permissions";
import { resizeAndEncodeLogo, LogoEncodeError } from "@/lib/logoEncode";
import { WELCOME_TEXT_MAX } from "@/lib/brandingConstants";
import { ACCENT_BG, ACCENT_LABEL, BRANDING_ACCENTS, type BrandingAccent } from "@/lib/brandingUi";
import type { MembershipRole } from "@/models/membership.model";

export interface BrandingSettingsValue {
  accent: BrandingAccent;
  welcomeText: string;
  logoVersion: number;
}

interface BrandingSettingsProps {
  orgId: string;
  orgSlug?: string;
  orgName: string;
  role: MembershipRole | undefined;
  branding: BrandingSettingsValue;
  /** Does the org's current plan allow branding to render/serve at all? */
  brandingAllowed: boolean;
  /**
   * Whether an OrgAsset logo row actually exists (from GET
   * /api/organizations/:orgId's `hasLogo`). Deliberately separate from
   * `branding.logoVersion` — the backend bumps logoVersion on delete too
   * (so a stale cached `?v=` URL never collides with the next upload), so
   * `logoVersion > 0` is true right after a removal and would build a
   * preview/public <img> that 404s.
   */
  hasLogo: boolean;
  onBrandingChange: (branding: BrandingSettingsValue) => void;
  onHasLogoChange: (hasLogo: boolean) => void;
}

function brandingErrorMessage(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e)) {
    const status = e.response?.status;
    const data = e.response?.data as { message?: string; code?: string } | undefined;
    if (status === 403 && data?.code === "PLAN_UPGRADE_REQUIRED") {
      return data.message || "Branding is available on the Pro plan and up.";
    }
    if (status === 413) {
      return data?.message || "That image is too large — try a smaller one.";
    }
    if (status === 400) {
      return data?.message || "That wasn't accepted — check the image or text and try again.";
    }
  }
  return apiError(e, fallback);
}

/**
 * Org settings' Branding tab: accent color, welcome text and a logo for the
 * org's public pages (app/o/[orgSlug]/**). Visible to every member (the
 * settings themselves aren't secret — see the GET /api/organizations/:orgId
 * route), but only OWNER/ADMIN (`org:branding`) get live controls; everyone
 * else sees a read-only view. FREE orgs see the same section with an
 * upsell banner and disabled controls, never a hidden section — a
 * downgrade keeps the stored values visible even though they don't render
 * publicly (lib/branding.ts#getEffectiveBranding).
 */
export default function BrandingSettings({
  orgId,
  orgSlug,
  orgName,
  role,
  branding,
  brandingAllowed,
  hasLogo,
  onBrandingChange,
  onHasLogoChange,
}: BrandingSettingsProps) {
  const { trackEvent } = useAnalytics();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canEdit = can(role, "org:branding");
  const editable = canEdit && brandingAllowed;

  const [accent, setAccent] = useState<BrandingAccent>(branding.accent);
  const [welcomeText, setWelcomeText] = useState(branding.welcomeText);
  const [logoVersion, setLogoVersion] = useState(branding.logoVersion);
  const [logoPresent, setLogoPresent] = useState(hasLogo);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Object URL for a just-picked file, shown immediately while it uploads —
  // swapped for the real ?v= URL (via logoVersion) once the server confirms.
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);

  // Re-seed local drafts when the parent's stored `branding` object changes
  // underneath us (a fresh GET after mount, or a save from this component —
  // the parent only ever replaces this object via setState, never mutates
  // it, so a reference check is enough). Adjusted during render rather than
  // in an effect, per React's guidance for resetting state from props.
  const [prevBranding, setPrevBranding] = useState(branding);
  if (branding !== prevBranding) {
    setPrevBranding(branding);
    setAccent(branding.accent);
    setWelcomeText(branding.welcomeText);
    setLogoVersion(branding.logoVersion);
  }

  // Same reset-on-prop-change treatment for `hasLogo`, which lives outside
  // `branding` (it isn't part of the accent/welcomeText/logoVersion PATCH
  // response shape).
  const [prevHasLogo, setPrevHasLogo] = useState(hasLogo);
  if (hasLogo !== prevHasLogo) {
    setPrevHasLogo(hasLogo);
    setLogoPresent(hasLogo);
  }

  useEffect(
    () => () => {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    },
    [pendingPreviewUrl]
  );

  const dirty = accent !== branding.accent || welcomeText !== branding.welcomeText;

  const save = async () => {
    if (!editable || !dirty || saving) return;
    setSaving(true);
    try {
      const res = await axios.patch(`/api/organizations/${orgId}/branding`, {
        accent,
        welcomeText,
      });
      if (res.data.success) {
        toast.success("Branding saved");
        trackEvent("branding_saved", accent);
        onBrandingChange(res.data.branding);
      } else {
        toast.error(res.data.message || "Failed to save branding");
      }
    } catch (e) {
      toast.error(brandingErrorMessage(e, "Failed to save branding"));
    } finally {
      setSaving(false);
    }
  };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file || !editable || uploading) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }

    setUploading(true);
    let objectUrl: string | null = null;
    try {
      const { blob, contentType } = await resizeAndEncodeLogo(file);
      objectUrl = URL.createObjectURL(blob);
      setPendingPreviewUrl(objectUrl);

      const form = new FormData();
      form.append("file", blob, contentType === "image/webp" ? "logo.webp" : "logo.png");
      const res = await axios.post(`/api/organizations/${orgId}/branding/logo`, form);
      if (res.data.success) {
        toast.success("Logo uploaded");
        trackEvent("logo_uploaded", contentType === "image/webp" ? "webp" : "png");
        setLogoVersion(res.data.logoVersion);
        setLogoPresent(true);
        onBrandingChange({ accent, welcomeText, logoVersion: res.data.logoVersion });
        onHasLogoChange(true);
      } else {
        toast.error(res.data.message || "Failed to upload logo");
      }
    } catch (err) {
      if (err instanceof LogoEncodeError) {
        toast.error(err.message);
      } else {
        toast.error(brandingErrorMessage(err, "Failed to upload logo"));
      }
    } finally {
      setUploading(false);
      setPendingPreviewUrl(null);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  };

  const removeLogo = async () => {
    const ok = await confirm({
      title: "Remove the logo?",
      description: "Public pages will show the default initial chip instead.",
      confirmLabel: "Remove logo",
      destructive: true,
      action: () => axios.delete(`/api/organizations/${orgId}/branding/logo`),
    });
    if (!ok) return;
    // Mirrors the server's own bump on delete (see the logo route), so a
    // cached pre-delete `?v=` URL never collides with the next upload.
    const nextVersion = logoVersion + 1;
    setLogoVersion(nextVersion);
    setLogoPresent(false);
    toast.success("Logo removed");
    onBrandingChange({ accent, welcomeText, logoVersion: nextVersion });
    onHasLogoChange(false);
  };

  const publicLogoUrl =
    orgSlug && brandingAllowed && logoPresent
      ? `/api/o/${orgSlug}/logo?v=${logoVersion}`
      : null;
  const previewSrc = pendingPreviewUrl ?? publicLogoUrl;

  return (
    <div className="space-y-6">
      {!brandingAllowed && (
        <Card className="bg-brand-yellow/25">
          <CardContent className="p-4">
            <p className="font-bold text-foreground">Branding is available on Pro</p>
            <p className="text-sm text-muted-foreground">
              Upgrade to add a logo, an accent color and a welcome message to your public
              pages. Switch plans from the Plan tab — pricing isn&apos;t decided yet, so
              you can try it for free during early access.
            </p>
          </CardContent>
        </Card>
      )}
      {brandingAllowed && !canEdit && (
        <p className="text-sm text-muted-foreground">
          Only owners and admins can edit branding.
        </p>
      )}

      <Card>
        <CardContent className="space-y-5 p-4">
          <fieldset disabled={!editable} className="space-y-2">
            <legend className="text-sm font-bold text-foreground">Accent color</legend>
            <div role="radiogroup" aria-label="Accent color" className="flex items-center gap-2">
              {BRANDING_ACCENTS.map((c) => (
                <label
                  key={c}
                  className={editable ? "cursor-pointer" : "cursor-not-allowed"}
                >
                  <input
                    type="radio"
                    name="branding-accent"
                    value={c}
                    checked={accent === c}
                    disabled={!editable}
                    onChange={() => setAccent(c)}
                    className="peer sr-only"
                  />
                  <span
                    aria-label={ACCENT_LABEL[c]}
                    title={ACCENT_LABEL[c]}
                    className={`block h-8 w-8 rounded-full border-2 border-ink ${ACCENT_BG[c]} transition-shadow peer-checked:ring-2 peer-checked:ring-ring peer-checked:ring-offset-2 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50`}
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="branding-welcome">Welcome text</Label>
              <span className="text-xs text-muted-foreground">
                {welcomeText.length}/{WELCOME_TEXT_MAX}
              </span>
            </div>
            <Textarea
              id="branding-welcome"
              value={welcomeText}
              onChange={(e) => setWelcomeText(e.target.value.slice(0, WELCOME_TEXT_MAX))}
              disabled={!editable}
              maxLength={WELCOME_TEXT_MAX}
              placeholder="Say a bit about your team, or how you use feedback..."
              className="min-h-[90px] resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label>Logo</Label>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-ink bg-card">
                {previewSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a same-origin API route / local blob preview, not a next/image-managed asset
                  <img
                    src={previewSrc}
                    alt="Logo preview"
                    className="h-full w-full object-contain p-1"
                  />
                ) : (
                  <span className="text-lg font-black text-muted-foreground">
                    {orgName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!editable || uploading}
                >
                  {uploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {logoPresent ? "Replace logo" : "Upload logo"}
                </Button>
                {logoPresent && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={removeLogo}
                    disabled={!editable || uploading}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Remove
                  </Button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFileSelected}
                disabled={!editable}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              PNG, JPEG or WebP. Resized to 256px and compressed to 100KB automatically.
            </p>
          </div>

          {editable && (
            <div className="flex justify-end">
              <Button onClick={save} disabled={!dirty || saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save branding
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <p className="mb-2 text-sm font-bold text-foreground">Preview</p>
        <Card>
          <CardContent className="rounded-xl bg-dot-grid p-6">
            <PublicBrandHeader
              orgName={orgName}
              branding={{ accent, welcomeText, logoUrl: previewSrc }}
              fallbackSubtitle="Share anonymous feedback — your identity is never revealed"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
