/** Shared empty state for a chart with no data in range — a fixed-height
 * placeholder so the surrounding grid doesn't jump when data does arrive. */
export default function EmptyChart({ message = "No data in this range" }: { message?: string }) {
  return (
    <div className="flex h-40 items-center justify-center text-sm font-medium text-muted-foreground">
      {message}
    </div>
  );
}
