import "next-auth";
import type { MembershipRole } from "@/models/membership.model";

declare module "next-auth" {
  interface User {
    _id?: string;
    name: string;
    email: string;
    username?: string;
    isVerified?: boolean;
    isAcceptingMessages?: boolean;
  }

  interface Session {
    user: {
      _id?: string;
      isVerified?: boolean;
      isAcceptingMessages?: boolean;
      username?: string;
      name?: string;
      // Active organization context (resolved server-side, switchable).
      activeOrgId?: string;
      activeOrgSlug?: string;
      activeOrgRole?: MembershipRole;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    _id?: string;
    isVerified?: boolean;
    isAcceptingMessages?: boolean;
    username?: string;
    name?: string;
    activeOrgId?: string;
    activeOrgSlug?: string;
    activeOrgRole?: MembershipRole;
  }
}
