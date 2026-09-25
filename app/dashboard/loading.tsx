import { PageLoader } from "@/components/Loader";

// Route-transition fallback for the dashboard. Deliberately not at the app
// root: a root Suspense boundary starts streaming before a page runs, so
// every public redirect()/notFound() would ship as HTTP 200.
export default function Loading() {
  return <PageLoader />;
}
