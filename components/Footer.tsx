import React from "react";
import Link from "next/link";
import Logo from "@/components/Logo";

const Footer = () => {
  return (
    <footer className="border-t-2 border-ink bg-background">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <Logo markClassName="h-10 w-10" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Turn honest, anonymous feedback into signal for your team.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-8 gap-y-3 text-sm font-semibold">
            <Link
              href="/signup"
              className="text-foreground hover:text-primary transition-colors"
            >
              Get started
            </Link>
            <Link
              href="/login"
              className="text-foreground hover:text-primary transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/dashboard"
              className="text-foreground hover:text-primary transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/terms"
              className="text-foreground hover:text-primary transition-colors"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="text-foreground hover:text-primary transition-colors"
            >
              Privacy
            </Link>
          </nav>
        </div>

        <div className="mt-10 border-t-2 border-ink pt-6 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} SignalHQ — All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
