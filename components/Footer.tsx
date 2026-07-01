import React from "react";
import Link from "next/link";
import { Radio } from "lucide-react";

const Footer = () => {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-fuchsia-500 text-white">
                <Radio className="h-4 w-4" />
              </span>
              <span className="text-lg font-semibold tracking-tight text-foreground">
                Signal<span className="text-primary">HQ</span>
              </span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Turn honest, anonymous feedback into signal for your team.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <Link
              href="/signup"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Get started
            </Link>
            <Link
              href="/login"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Dashboard
            </Link>
          </nav>
        </div>

        <div className="mt-10 border-t border-border pt-6 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} SignalHQ — All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
