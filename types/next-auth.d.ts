import type { DefaultSession } from "next-auth";
import type { MembershipRole } from "@/models/membership.model";
import type { OrganizationPlan } from "@/models/organization.model";

declare module "next-auth" {
  interface User {
    _id?: string;
    name: string;
    email: string;
    username?: string;
    isVerified?: boolean;
  }

  interface Session {
    user: {
      _id?: string;
      isVerified?: boolean;
      username?: string;
      name?: string;
      // Active organization context (resolved server-side, switchable).
      activeOrgId?: string;
      activeOrgSlug?: string;
      activeOrgRole?: MembershipRole;
      activeOrgPlan?: OrganizationPlan;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    _id?: string;
    isVerified?: boolean;
    username?: string;
    name?: string;
    activeOrgId?: string;
    activeOrgSlug?: string;
    activeOrgRole?: MembershipRole;
    activeOrgPlan?: OrganizationPlan;
  }
}
