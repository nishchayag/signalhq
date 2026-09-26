"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { User } from "next-auth";
import { Menu, X, LayoutDashboard, LogOut, Settings, User as UserIcon } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import PlanBadge from "@/components/PlanBadge";
import Logo from "@/components/Logo";

const Navbar = () => {
  const { data: session } = useSession();
  const currUser: User = session?.user as User;
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 w-full border-b-2 border-ink bg-background">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <Logo markClassName="h-10 w-10 transition-transform group-hover:-translate-y-0.5" />
          </Link>

          {/* Desktop */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle />
            {session ? (
              <>
                {session?.user?.activeOrgPlan && (
                  <PlanBadge plan={session.user.activeOrgPlan} />
                )}
                <span className="hidden lg:inline text-sm font-medium text-muted-foreground">
                  {currUser?.name || currUser?.email}
                </span>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary transition-colors"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Link>
                <button
                  onClick={() => signOut()}
                  className="inline-flex items-center gap-2 rounded-lg border-2 border-ink bg-card px-3 py-2 text-sm font-semibold text-foreground pop"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              </>
            ) : (
              <>
                {/* Marketing surface for visitors; logged-in users find plans
                    under Account settings → Plan & billing. */}
                <Link
                  href="/pricing"
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary transition-colors"
                >
                  Pricing
                </Link>
                <Link
                  href="/login"
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary transition-colors"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex items-center rounded-lg border-2 border-ink bg-primary px-4 py-2 text-sm font-bold text-primary-foreground pop"
                >
                  Get started
                </Link>
              </>
            )}
          </div>

          {/* Mobile trigger */}
          <div className="flex md:hidden items-center gap-2">
            <ThemeToggle />
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border-2 border-ink bg-card text-foreground pop"
              onClick={() => setIsOpen(!isOpen)}
              aria-label="Toggle menu"
            >
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isOpen && (
        <div className="md:hidden border-t-2 border-ink bg-background px-6 py-4">
          {session ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-sm font-medium text-muted-foreground">
                  {currUser?.name || currUser?.email}
                </span>
                {session?.user?.activeOrgPlan && (
                  <PlanBadge plan={session.user.activeOrgPlan} />
                )}
              </div>
              <Link
                href="/dashboard"
                onClick={() => setIsOpen(false)}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
              <Link
                href="/dashboard/organization"
                onClick={() => setIsOpen(false)}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
              >
                <Settings className="h-4 w-4" />
                Organization settings
              </Link>
              <Link
                href="/dashboard/account"
                onClick={() => setIsOpen(false)}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
              >
                <UserIcon className="h-4 w-4" />
                Account settings
              </Link>
              <button
                onClick={() => {
                  signOut();
                  setIsOpen(false);
                }}
                className="inline-flex items-center gap-2 rounded-lg border-2 border-ink bg-card px-3 py-2 text-sm font-semibold text-foreground"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Link
                href="/pricing"
                onClick={() => setIsOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
              >
                Pricing
              </Link>
              <Link
                href="/login"
                onClick={() => setIsOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                onClick={() => setIsOpen(false)}
                className="rounded-lg border-2 border-ink bg-primary px-4 py-2.5 text-center text-sm font-bold text-primary-foreground"
              >
                Get started
              </Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
