import { Button } from "@/components/ui/button";

export default function LoadMoreButton({
  onClick,
  loading,
}: {
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex justify-center pt-2">
      <Button variant="outline" onClick={onClick} disabled={loading}>
        {loading ? "Loading…" : "Load more"}
      </Button>
    </div>
  );
}
