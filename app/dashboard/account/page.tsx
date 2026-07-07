"use client";
import React, { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { toast } from "sonner";
import Link from "next/link";
import { Bell, CreditCard, Loader2, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import PlanBadge from "@/components/PlanBadge";
import { PLAN_DISPLAY } from "@/lib/plans";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

type NotificationPreference = "immediate" | "daily" | "off";

const NOTIFICATION_OPTIONS: {
  value: NotificationPreference;
  label: string;
  description: string;
}[] = [
  {
    value: "immediate",
    label: "Immediately",
    description: "Email me as soon as I get a message",
  },
  {
    value: "daily",
    label: "Daily digest",
    description: "One email a day summarizing new messages",
  },
  {
    value: "off",
    label: "Off",
    description: "Don't email me about new messages",
  },
];

export default function AccountSettingsPage() {
  const { data: session } = useSession();
  const activePlan = session?.user?.activeOrgPlan;
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [blockingOrgs, setBlockingOrgs] = useState<
    { _id: string; name: string }[]
  >([]);
  const [notificationPreference, setNotificationPreference] =
    useState<NotificationPreference | null>(null);
  const [savingPreference, setSavingPreference] = useState(false);

  useEffect(() => {
    axios
      .get("/api/account/notifications")
      .then((res) => {
        if (res.data.success) {
          setNotificationPreference(res.data.notificationPreference);
        }
      })
      .catch(() => {
        // Silently fall back to no selection shown; the user can still
        // pick a preference and it'll save normally.
      });
  }, []);

  const handleNotificationChange = async (value: NotificationPreference) => {
    const previous = notificationPreference;
    setNotificationPreference(value);
    setSavingPreference(true);
    try {
      const res = await axios.patch("/api/account/notifications", {
        notificationPreference: value,
      });
      if (res.data.success) {
        toast.success("Notification preference updated");
      } else {
        setNotificationPreference(previous);
        toast.error(res.data.message || "Failed to update preference");
      }
    } catch {
      setNotificationPreference(previous);
      toast.error("Failed to update preference");
    } finally {
      setSavingPreference(false);
    }
  };

  const handleDelete = async () => {
    if (!password) {
      toast.error("Enter your password to confirm");
      return;
    }
    setDeleting(true);
    setBlockingOrgs([]);
    try {
      const res = await axios.delete("/api/account/delete", {
        data: { password },
      });
      if (res.data.success) {
        toast.success("Your account has been deleted");
        await signOut({ redirect: false });
        router.push("/");
      } else {
        toast.error(res.data.message);
      }
    } catch (error) {
      const data = axios.isAxiosError(error) ? error.response?.data : null;
      if (data?.blockingOrgs) setBlockingOrgs(data.blockingOrgs);
      toast.error(data?.message || "Failed to delete account");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-black tracking-tight text-foreground">
            Account settings
          </h1>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            Back to dashboard
          </Button>
        </div>

        <Card className="mb-6">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <User className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-bold text-foreground">Your account</h2>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{session?.user?.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Username</dt>
                <dd className="font-medium">{session?.user?.username}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium">{session?.user?.email}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-bold text-foreground">Plan &amp; billing</h2>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {activePlan && <PlanBadge plan={activePlan} />}
                <p className="text-sm text-muted-foreground">
                  {activePlan
                    ? PLAN_DISPLAY[activePlan].tagline
                    : "Your current organization's plan"}
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href="/pricing">View plans</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-bold text-foreground">Notifications</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Choose how you want to hear about new messages.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              {NOTIFICATION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={savingPreference || notificationPreference === null}
                  onClick={() => handleNotificationChange(option.value)}
                  className={`flex-1 rounded-lg border-2 border-ink p-3 text-left transition-colors disabled:opacity-60 ${
                    notificationPreference === option.value
                      ? "bg-brand-yellow"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  <p className="text-sm font-bold text-foreground">
                    {option.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {option.description}
                  </p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/50">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              <h2 className="font-bold text-foreground">Danger zone</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Permanently delete your account. This removes any
              organization(s) you own alone (and their questions, messages,
              teams, and invitations), and your membership in any
              organization you don&apos;t own. This can&apos;t be undone.
            </p>

            {blockingOrgs.length > 0 && (
              <div className="mb-4 rounded-lg border-2 border-destructive/50 bg-destructive/5 p-3 text-sm">
                <p className="font-semibold text-foreground">
                  Can&apos;t delete yet — you own{" "}
                  {blockingOrgs.length === 1 ? "an organization" : "organizations"}{" "}
                  with other members:
                </p>
                <ul className="mt-1.5 list-disc pl-5">
                  {blockingOrgs.map((org) => (
                    <li key={org._id}>{org.name}</li>
                  ))}
                </ul>
                <p className="mt-1.5 text-muted-foreground">
                  Transfer ownership or remove the other members first, from
                  Organization settings.
                </p>
              </div>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete my account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes your account and cannot be
                    undone. Enter your password to confirm.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-2">
                  <Label htmlFor="confirmPassword">Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="mt-1.5"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel
                    disabled={deleting}
                    onClick={() => setPassword("")}
                  >
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} disabled={deleting}>
                    {deleting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      "Delete account"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
