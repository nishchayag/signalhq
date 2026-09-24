"use client";
import React, { useEffect, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { toast } from "sonner";
import Link from "next/link";
import { Bell, CreditCard, KeyRound, Loader2, Trash2, User } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { apiError } from "@/lib/apiError";
import { Card, CardContent } from "@/components/ui/card";
import PlanBadge from "@/components/PlanBadge";
import { PLAN_DISPLAY } from "@/lib/plans";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

function ProfileCard() {
  const { data: session, update } = useSession();
  const sessionName = session?.user?.name ?? "";
  const [name, setName] = useState(sessionName);
  const [saving, setSaving] = useState(false);

  // The session loads after first render; re-seed the field whenever the
  // session's name changes (first load, or the refresh after a save).
  const [seededFrom, setSeededFrom] = useState(sessionName);
  if (seededFrom !== sessionName) {
    setSeededFrom(sessionName);
    setName(sessionName);
  }

  const trimmed = name.trim();
  const dirty = trimmed !== sessionName;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) return;
    setSaving(true);
    try {
      const res = await axios.patch("/api/account/profile", { name: trimmed });
      // Bare update(): the jwt callback re-reads the name from the DB, so
      // the navbar picks it up without a reload.
      await update();
      setName(res.data.name);
      toast.success("Name updated");
    } catch (error) {
      toast.error(apiError(error, "Failed to update name"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <User className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-bold text-foreground">Profile</h2>
        </div>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label htmlFor="profileName">Name</Label>
            <div className="mt-1.5 flex gap-2">
              <Input
                id="profileName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                disabled={saving || !session}
                autoComplete="name"
              />
              <Button type="submit" disabled={saving || !dirty || !trimmed}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
          <div>
            <Label htmlFor="profileUsername">Username</Label>
            <Input
              id="profileUsername"
              value={session?.user?.username ?? ""}
              readOnly
              disabled
              className="mt-1.5"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Usernames can&apos;t be changed: yours is part of your share
              links.
            </p>
          </div>
          <div>
            <Label htmlFor="profileEmail">Email</Label>
            <Input
              id="profileEmail"
              value={session?.user?.email ?? ""}
              readOnly
              disabled
              className="mt-1.5"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Changing your email isn&apos;t supported yet.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const { data: session } = useSession();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit =
    !!currentPassword && !!newPassword && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const username = session?.user?.username;
    setSaving(true);
    try {
      await axios.post("/api/account/password", { currentPassword, newPassword });
    } catch (error) {
      toast.error(apiError(error, "Failed to change password"));
      setSaving(false);
      return;
    }

    // The change bumped tokenVersion, which revokes this session too —
    // quietly sign it back in with the new password.
    const result = username
      ? await signIn("credentials", {
          identifier: username,
          password: newPassword,
          redirect: false,
        })
      : undefined;
    setSaving(false);
    if (!result?.ok || result.error) {
      toast.success("Password changed. Please sign in again.");
      router.push("/login");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Password changed");
  };

  return (
    <Card className="mb-6">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-bold text-foreground">Password</h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Lets password managers associate the new password with the account. */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={session?.user?.username ?? ""}
            readOnly
            hidden
          />
          <div>
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              disabled={saving}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              disabled={saving}
              className="mt-1.5"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              At least 8 characters, with an uppercase letter, a lowercase
              letter, a number and a special character.
            </p>
          </div>
          <div>
            <Label htmlFor="confirmNewPassword">Confirm new password</Label>
            <Input
              id="confirmNewPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              disabled={saving}
              aria-invalid={mismatch}
              className="mt-1.5"
            />
            {mismatch && (
              <p role="alert" className="mt-1 text-xs font-medium text-destructive">
                Passwords don&apos;t match.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Other devices will be signed out.
            </p>
            <Button type="submit" disabled={saving || !canSubmit}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Changing...
                </>
              ) : (
                "Change password"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

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
  const [aiDigestSummary, setAiDigestSummary] = useState(true);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [savingAiDigest, setSavingAiDigest] = useState(false);

  useEffect(() => {
    axios
      .get("/api/account/notifications")
      .then((res) => {
        if (res.data.success) {
          setNotificationPreference(res.data.notificationPreference);
          setAiDigestSummary(res.data.aiDigestSummary !== false);
          setAiAvailable(res.data.aiAvailable === true);
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

  const handleAiDigestChange = async (value: boolean) => {
    const previous = aiDigestSummary;
    setAiDigestSummary(value);
    setSavingAiDigest(true);
    try {
      const res = await axios.patch("/api/account/notifications", {
        aiDigestSummary: value,
      });
      if (res.data.success) {
        toast.success(value ? "AI summaries turned on" : "AI summaries turned off");
      } else {
        setAiDigestSummary(previous);
        toast.error(res.data.message || "Failed to update preference");
      }
    } catch {
      setAiDigestSummary(previous);
      toast.error("Failed to update preference");
    } finally {
      setSavingAiDigest(false);
    }
  };

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent) => {
    // AlertDialogAction closes on click unless default-prevented; keep the
    // dialog open so the spinner, a missing password, or the server's reason
    // (e.g. orgs blocking deletion) stay visible in it.
    e.preventDefault();
    if (!password) {
      setDeleteError("Enter your password to confirm.");
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    setBlockingOrgs([]);
    try {
      const res = await axios.delete("/api/account/delete", {
        data: { password },
      });
      if (res.data.success) {
        toast.success("Your account has been deleted");
        await signOut({ redirect: false });
        router.push("/");
        return;
      }
      setDeleteError(res.data.message || "Failed to delete account");
    } catch (error) {
      const data = axios.isAxiosError(error) ? error.response?.data : null;
      if (data?.blockingOrgs) setBlockingOrgs(data.blockingOrgs);
      setDeleteError(apiError(error, "Failed to delete account"));
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

        <ProfileCard />
        <PasswordCard />

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
                      ? "bg-brand-yellow on-brand-fill"
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
            {/* Only the daily digest carries a summary; immediate emails stay plain. */}
            {aiAvailable && notificationPreference === "daily" && (
              <div className="mt-4 flex items-start justify-between gap-4 rounded-lg border-2 border-ink bg-background p-3">
                <div>
                  <Label htmlFor="ai-digest-summary" className="text-sm font-bold text-foreground">
                    Include an AI summary in digest emails
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    A few bullet points on new anonymous feedback, for organizations you own or admin.
                  </p>
                </div>
                <Switch
                  id="ai-digest-summary"
                  className="mt-0.5 border-2 border-ink"
                  checked={aiDigestSummary}
                  disabled={savingAiDigest}
                  onCheckedChange={handleAiDigestChange}
                />
              </div>
            )}
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

            <AlertDialog
              open={deleteOpen}
              onOpenChange={(open) => {
                if (deleting) return; // don't abandon an in-flight delete
                setDeleteOpen(open);
                if (!open) {
                  setPassword("");
                  setDeleteError(null);
                }
              }}
            >
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
                    disabled={deleting}
                    autoFocus
                  />
                </div>
                {deleteError && (
                  <div
                    role="alert"
                    className="rounded-lg border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
                  >
                    {deleteError}
                    {blockingOrgs.length > 0 && (
                      <ul className="mt-1 list-disc pl-5">
                        {blockingOrgs.map((o) => (
                          <li key={o._id}>{o.name}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={deleting}
                    className={buttonVariants({ variant: "destructive" })}
                  >
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
