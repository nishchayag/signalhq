import Link from "next/link";
import { PLAN_DISPLAY, type Plan } from "@/lib/plans";

export const PLAN_CHIP: Record<Plan, string> = {
  FREE: "bg-brand-yellow",
  PRO: "bg-brand-mint",
  ENTERPRISE: "bg-brand-blue",
};

const PlanBadge = ({ plan }: { plan: Plan }) => (
  <Link
    href="/dashboard/organization"
    className={`inline-flex items-center rounded-lg border-2 border-ink px-2.5 py-1 text-xs font-bold text-ink ${PLAN_CHIP[plan]}`}
  >
    {PLAN_DISPLAY[plan].name}
  </Link>
);

export default PlanBadge;
