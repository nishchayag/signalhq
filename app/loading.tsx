import { PageLoader } from "@/components/Loader";

// Route-transition fallback for every segment without its own loading.tsx.
export default function Loading() {
  return <PageLoader />;
}
