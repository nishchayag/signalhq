import React from "react";
import Link from "next/link";
import { Zap } from "lucide-react";

const Footer = () => {
  return (
    <footer className="border-t-2 border-ink bg-background">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-ink bg-brand-yellow text-ink shadow-solid-sm">
                <Zap className="h-4.5 w-4.5" strokeWidth={2.5} />
              </span>
              <span className="text-xl font-black tracking-tight text-foreground">
                Signal<span className="text-primary">HQ</span>
              </span>
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
