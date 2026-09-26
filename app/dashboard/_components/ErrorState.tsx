import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown instead of an empty state when a fetch actually failed, so "we
 * couldn't load this" never masquerades as "there's nothing here yet".
 */
export default function ErrorState({
  message,
  onRetry,
  compact = false,
}: {
  message: string;
  onRetry: () => void;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={`rounded-2xl border-2 border-destructive bg-destructive/10 text-center ${
        compact ? "rounded-xl px-3 py-6" : "px-4 py-12"
      }`}
    >
      <AlertTriangle
        className={`mx-auto text-destructive ${compact ? "mb-2 h-6 w-6" : "mb-3 h-10 w-10"}`}
      />
      <p className={`font-bold text-foreground ${compact ? "text-sm" : "text-lg"}`}>{message}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        <RotateCw className="mr-1.5 h-4 w-4" />
        Try again
      </Button>
    </div>
  );
}
