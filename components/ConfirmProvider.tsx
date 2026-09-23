"use client";

import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiError } from "@/lib/apiError";
import { cn } from "@/lib/utils";

export type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for deletes/removals. */
  destructive?: boolean;
  /** Typed confirmation: the confirm button stays disabled until the user
   *  types exactly this (e.g. the org name before deleting it). */
  requireText?: string;
  /** Work to run on confirm. The dialog stays open with a spinner until it
   *  settles; if it throws, the error is shown inside the dialog and the
   *  user can retry or cancel. */
  action?: () => Promise<unknown> | unknown;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * `const confirm = useConfirm(); if (await confirm({...})) ...`
 * Resolves true once confirmed (and, if given, once `action` succeeded);
 * false if cancelled. Replaces native window.confirm().
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}

export default function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    // A second confirm while one is open cancels the first.
    resolver.current?.(false);
    setOptions(opts);
    setError(null);
    setTyped("");
    setPending(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
    setPending(false);
  };

  const typedOk = !options?.requireText || typed.trim() === options.requireText;

  const onConfirm = async (e: React.MouseEvent) => {
    // AlertDialogAction closes on click unless the event is default-
    // prevented — keep it open so the spinner and any error are visible.
    e.preventDefault();
    if (!options || pending || !typedOk) return;
    if (!options.action) return settle(true);
    setPending(true);
    setError(null);
    try {
      await options.action();
      settle(true);
    } catch (err) {
      setError(apiError(err));
      setPending(false);
    }
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={options !== null}
        onOpenChange={(open) => {
          // Escape / overlay click must not abandon an in-flight action.
          if (!open && !pending) settle(false);
        }}
      >
        {options && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{options.title}</AlertDialogTitle>
              {options.description && (
                <AlertDialogDescription asChild={typeof options.description !== "string"}>
                  {typeof options.description === "string" ? (
                    options.description
                  ) : (
                    <div>{options.description}</div>
                  )}
                </AlertDialogDescription>
              )}
            </AlertDialogHeader>

            {options.requireText && (
              <div className="space-y-2">
                <Label htmlFor="confirm-typed">
                  Type <span className="font-mono font-bold">{options.requireText}</span> to confirm
                </Label>
                <Input
                  id="confirm-typed"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  disabled={pending}
                  autoFocus
                />
              </div>
            )}

            {error && (
              <p role="alert" className="rounded-lg border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {error}
              </p>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>{options.cancelLabel ?? "Cancel"}</AlertDialogCancel>
              <AlertDialogAction
                onClick={onConfirm}
                disabled={pending || !typedOk}
                className={cn(options.destructive && buttonVariants({ variant: "destructive" }))}
              >
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {options.confirmLabel ?? "Confirm"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}
