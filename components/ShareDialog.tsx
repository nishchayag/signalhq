"use client";
import { useEffect, useMemo, useState } from "react";
import { Code2, Copy, Download, Link2, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAnalytics } from "@/hooks/useAnalytics";
import { buildQrSvg, svgDataUrlToPngDataUrl, svgToDataUrl } from "@/lib/qr";
import { buildPublicUrl } from "@/lib/publicUrl";
import { buildEmbedSnippet, type EmbedSnippetTarget } from "@/lib/embedSnippet";
import type { EmbedTheme } from "@/lib/securityHeaders";

const EMBED_THEMES: { value: EmbedTheme; label: string }[] = [
  { value: "system", label: "Match device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** Triggers a browser download of `dataUrl`/`blobUrl` without navigating away. */
function triggerDownload(href: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absolute public URL to show, copy, encode as a QR and share. */
  url: string;
  title: string;
  description?: string;
  /** Used to name the downloaded files, e.g. "acme-feedback" -> "acme-feedback-qr.svg". */
  filenameBase: string;
  /** Coarse category passed to the "link_copied" event (e.g. "question", "org"). */
  copyEventLabel?: string;
  /** Offers a "Embed" tab alongside the default "Link" one — a <script>
   * snippet for public/embed.js, a theme picker and an anonymity note.
   * Omitted entirely (e.g. ReplyReceiptCard has no share dialog at all, and
   * internal questions never render one) when a target can't sensibly be
   * embedded on someone else's site. */
  embed?: EmbedSnippetTarget;
}

/** Share dialog: the link (with copy), a scannable QR code, SVG/PNG downloads,
 * the native share sheet when the browser supports it, and — when `embed` is
 * passed — an Embed tab with a copyable <script> snippet. Used for public
 * question links and an org's general feedback link. */
export default function ShareDialog({
  open,
  onOpenChange,
  url,
  title,
  description,
  filenameBase,
  copyEventLabel,
  embed,
}: ShareDialogProps) {
  const { trackEvent } = useAnalytics();
  // Keyed by the URL it encodes, so a different URL reads as "loading" without
  // resetting state inside the effect.
  const [qr, setQr] = useState<{ url: string; svg: string | null; error: boolean } | null>(null);
  const [downloadingPng, setDownloadingPng] = useState(false);
  const [tab, setTab] = useState<"link" | "embed">("link");
  const [embedTheme, setEmbedTheme] = useState<EmbedTheme>("system");
  const current = qr?.url === url ? qr : null;
  const qrSvg = current?.svg ?? null;
  const qrError = current?.error ?? false;
  const qrDataUrl = useMemo(() => (qrSvg ? svgToDataUrl(qrSvg) : null), [qrSvg]);
  // The dialog body only mounts client-side once opened, so navigator is safe here.
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const embedSnippet = embed
    ? buildEmbedSnippet(embed, embedTheme, buildPublicUrl("/embed.js"))
    : null;

  useEffect(() => {
    if (!open || !url) return;
    let cancelled = false;
    buildQrSvg(url)
      .then((svg) => {
        if (!cancelled) setQr({ url, svg, error: false });
      })
      .catch(() => {
        if (!cancelled) setQr({ url, svg: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [open, url]);

  // Reopening always starts back on the Link tab — a dialog remembering
  // "Embed" from a previous open (possibly for a different target) would be
  // a surprising default. Adjusted during render (React's documented
  // pattern for resetting state on a prop change), not in an effect, so it
  // can't trigger an extra cascading render.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setTab("link");
  }

  const copyEmbedSnippet = () => {
    if (!embedSnippet) return;
    navigator.clipboard.writeText(embedSnippet);
    toast.success("Snippet copied to clipboard!");
    if (copyEventLabel) trackEvent("embed_snippet_copied", copyEventLabel);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard!");
    if (copyEventLabel) trackEvent("link_copied", copyEventLabel);
  };

  const downloadSvg = () => {
    if (!qrSvg) return;
    const blob = new Blob([qrSvg], { type: "image/svg+xml" });
    const blobUrl = URL.createObjectURL(blob);
    triggerDownload(blobUrl, `${filenameBase}-qr.svg`);
    URL.revokeObjectURL(blobUrl);
    trackEvent("qr_downloaded", "svg");
  };

  const downloadPng = async () => {
    if (!qrDataUrl) return;
    setDownloadingPng(true);
    try {
      const pngDataUrl = await svgDataUrlToPngDataUrl(qrDataUrl, 1024);
      triggerDownload(pngDataUrl, `${filenameBase}-qr.png`);
      trackEvent("qr_downloaded", "png");
    } catch {
      toast.error("Couldn't generate the PNG");
    } finally {
      setDownloadingPng(false);
    }
  };

  const shareLink = async () => {
    try {
      await navigator.share({ title, url });
    } catch {
      // The user cancelled the share sheet, or it's genuinely unsupported —
      // either way there's nothing useful to surface.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {embed && (
          <div className="flex gap-2 rounded-lg border-2 border-ink bg-muted p-1" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "link"}
              onClick={() => setTab("link")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-bold transition ${
                tab === "link" ? "border-2 border-ink bg-card shadow-solid-sm" : "text-muted-foreground"
              }`}
            >
              <Link2 className="h-3.5 w-3.5" />
              Link
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "embed"}
              onClick={() => setTab("embed")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-bold transition ${
                tab === "embed" ? "border-2 border-ink bg-card shadow-solid-sm" : "text-muted-foreground"
              }`}
            >
              <Code2 className="h-3.5 w-3.5" />
              Embed
            </button>
          </div>
        )}

        {(!embed || tab === "link") && (
          <>
            <div className="flex items-center gap-2">
              <Input readOnly value={url} className="min-w-0 flex-1 text-sm" aria-label="Public link" />
              <Button type="button" variant="outline" size="icon" aria-label="Copy link" title="Copy link" onClick={copyLink}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex justify-center rounded-xl border-2 border-ink bg-white p-4">
              {qrError ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Couldn&apos;t generate the QR code.
                </p>
              ) : qrDataUrl ? (
                // The SVG itself is always black-on-white (see lib/qr.ts), so the
                // code stays scannable regardless of the app's light/dark theme.
                // eslint-disable-next-line @next/next/no-img-element -- a data: URL; next/image adds nothing
                <img src={qrDataUrl} alt={`QR code for ${url}`} className="h-48 w-48" width={192} height={192} />
              ) : (
                <div className="flex h-48 w-48 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={downloadSvg} disabled={!qrSvg}>
                <Download className="mr-2 h-4 w-4" />
                Download SVG
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={downloadPng} disabled={!qrDataUrl || downloadingPng}>
                {downloadingPng ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Download PNG
              </Button>
              {canShare && (
                <Button type="button" variant="outline" size="sm" onClick={shareLink}>
                  <Share2 className="mr-2 h-4 w-4" />
                  Share
                </Button>
              )}
            </div>
          </>
        )}

        {embed && tab === "embed" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">Theme</span>
              <div className="flex gap-1.5">
                {EMBED_THEMES.map((t) => (
                  <Button
                    key={t.value}
                    type="button"
                    size="sm"
                    variant={embedTheme === t.value ? "default" : "outline"}
                    onClick={() => setEmbedTheme(t.value)}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-2">
              <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg border-2 border-ink bg-card px-3 py-2 font-mono text-xs text-foreground">
                {embedSnippet}
              </pre>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Copy embed snippet"
                title="Copy embed snippet"
                onClick={copyEmbedSnippet}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Paste this where you want the widget to appear. Anyone with the page can send
              feedback through it, same as the public link.
            </p>
            <p className="rounded-lg border-2 border-ink bg-brand-yellow/25 px-3 py-2 text-xs font-medium text-foreground">
              Don&apos;t embed on a logged-in intranet if responders need to stay unidentifiable.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
