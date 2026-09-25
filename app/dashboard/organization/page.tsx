"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { toast } from "sonner";
import {
  Users,
  Mail,
  FolderKanban,
  Settings,
  Trash2,
  Loader2,
  LogOut,
  CreditCard,
  Check,
  History,
  Tag,
  Pencil,
  Share2,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Loader from "@/components/Loader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import ShareDialog from "@/components/ShareDialog";
import BrandingSettings, {
  type BrandingSettingsValue,
} from "@/app/dashboard/_components/BrandingSettings";
import { can } from "@/lib/permissions";
import { useConfirm } from "@/components/ConfirmProvider";
import { apiError } from "@/lib/apiError";
import { buildPublicUrl } from "@/lib/publicUrl";
import type { MembershipRole } from "@/models/membership.model";
import { PLAN_ORDER, PLAN_LIMITS, PLAN_DISPLAY, type Plan } from "@/lib/plans";
import { LABEL_COLORS, LABEL_NAME_MAX, ORG_MAX_LABELS, type LabelColor } from "@/lib/triageConstants";
import type { LabelView } from "@/lib/labels";

type Tab =
  | "members"
  | "invitations"
  | "teams"
  | "labels"
  | "branding"
  | "settings"
  | "plan"
  | "activity";

const LABEL_COLOR_BG: Record<LabelColor, string> = {
  yellow: "bg-brand-yellow",
  pink: "bg-brand-pink",
  mint: "bg-brand-mint",
  blue: "bg-brand-blue",
};

interface ActivityEntry {
  _id: string;
  action: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  actor: { name: string; username: string } | null;
}

const ACTIVITY_LABELS: Record<string, string> = {
  "organization.renamed": "renamed the organization",
  "organization.deleted": "deleted the organization",
  "organization.plan_changed": "changed the plan",
  "organization.ownership_transferred": "transferred ownership",
  "member.role_changed": "changed a member's role",
  "member.removed": "removed a member",
  "member.left": "left the organization",
  "team.created": "created a team",
  "team.updated": "updated a team",
  "team.deleted": "deleted a team",
  "invitation.created": "invited a member",
  "invitation.revoked": "revoked an invitation",
  "label.created": "created a label",
  "label.updated": "updated a label",
  "label.deleted": "deleted a label",
};

function describeActivity(entry: ActivityEntry): string {
  const meta = entry.metadata || {};
  switch (entry.action) {
    case "organization.renamed":
      return `Renamed the organization from "${meta.from}" to "${meta.to}"`;
    case "organization.plan_changed":
      return `Changed the plan from ${meta.from} to ${meta.to}`;
    case "member.role_changed":
      return `Changed a member's role from ${meta.from} to ${meta.to}`;
    case "invitation.created":
      return `Invited ${meta.email} as ${meta.role}`;
    case "invitation.revoked":
      return `Revoked the invitation for ${meta.email}`;
    case "team.created":
    case "team.updated":
    case "team.deleted":
    case "label.created":
    case "label.deleted":
      return `${ACTIVITY_LABELS[entry.action]}: "${meta.name}"`;
    case "label.updated":
      return meta.from
        ? `Renamed a label from "${meta.from}" to "${meta.name}"`
        : `${ACTIVITY_LABELS[entry.action]}: "${meta.name}"`;
    default:
      return ACTIVITY_LABELS[entry.action] || entry.action;
  }
}

interface Member {
  membershipId: string;
  userId: string;
  name: string;
  username: string;
  email: string;
  role: MembershipRole;
  isSelf: boolean;
}
interface Invitation {
  _id: string;
  email: string;
  role: string;
  expiresAt: string;
}
interface Team {
  _id: string;
  name: string;
  slug: string;
  memberCount: number;
}

export default function OrganizationPage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const confirm = useConfirm();
  const orgId = session?.user?.activeOrgId;
  const role = session?.user?.activeOrgRole as MembershipRole | undefined;
  const orgSlug = session?.user?.activeOrgSlug;

  const [tab, setTab] = useState<Tab>("members");
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [labels, setLabels] = useState<LabelView[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [activityCursor, setActivityCursor] = useState<string | null>(null);
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  const [plan, setPlan] = useState<Plan>("FREE");
  const [orgName, setOrgName] = useState("");
  const [branding, setBranding] = useState<BrandingSettingsValue>({
    accent: "yellow",
    welcomeText: "",
    logoVersion: 0,
  });
  const [brandingAllowed, setBrandingAllowed] = useState(false);
  const [hasLogo, setHasLogo] = useState(false);
  const [switchingPlan, setSwitchingPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [inviteTeam, setInviteTeam] = useState("");
  const [inviting, setInviting] = useState(false);

  // Team form
  const [teamName, setTeamName] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [manageTeam, setManageTeam] = useState<Team | null>(null);

  // Labels
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState<LabelColor>("yellow");
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelName, setEditingLabelName] = useState("");
  const [savingLabelId, setSavingLabelId] = useState<string | null>(null);

  // Settings
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const [transferring, setTransferring] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [org, m, t, l] = await Promise.all([
        axios.get(`/api/organizations/${orgId}`),
        axios.get(`/api/organizations/${orgId}/members`),
        axios.get(`/api/organizations/${orgId}/teams`),
        axios.get(`/api/organizations/${orgId}/labels`),
      ]);
      if (org.data.success) {
        setPlan(org.data.organization.plan);
        setOrgName(org.data.organization.name);
        if (org.data.branding) setBranding(org.data.branding);
        setBrandingAllowed(!!org.data.brandingAllowed);
        setHasLogo(!!org.data.hasLogo);
      }
      if (m.data.success) setMembers(m.data.members);
      if (t.data.success) setTeams(t.data.teams);
      if (l.data.success) setLabels(l.data.labels);
      if (can(role, "member:invite")) {
        const inv = await axios.get(`/api/organizations/${orgId}/invitations`);
        if (inv.data.success) setInvites(inv.data.invitations);
      }
      if (can(role, "org:viewActivity")) {
        const act = await axios.get(`/api/organizations/${orgId}/activity`);
        if (act.data.success) {
          setActivity(act.data.activity);
          setActivityHasMore(act.data.hasMore);
          setActivityCursor(act.data.nextCursor);
        }
      }
    } catch (error) {
      console.error("Error loading organization:", error);
      toast.error("Failed to load organization");
    } finally {
      setLoading(false);
    }
  }, [orgId, role]);

  const loadMoreActivity = async () => {
    if (!orgId || !activityCursor) return;
    setActivityLoadingMore(true);
    try {
      const res = await axios.get(`/api/organizations/${orgId}/activity`, {
        params: { before: activityCursor },
      });
      if (res.data.success) {
        setActivity((prev) => [...prev, ...res.data.activity]);
        setActivityHasMore(res.data.hasMore);
        setActivityCursor(res.data.nextCursor);
      }
    } catch {
      toast.error("Failed to load more activity");
    } finally {
      setActivityLoadingMore(false);
    }
  };

  useEffect(() => {
    // Standard fetch-on-mount/session-change; `load` is a stable useCallback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (session) load();
  }, [session, load]);

  if (!orgId) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        No active organization.
      </div>
    );
  }

  // ---- Member actions ----
  const changeRole = async (m: Member, newRole: "ADMIN" | "MEMBER") => {
    // Promotions apply straight away; a demotion takes access away, so ask.
    if (m.role === "ADMIN" && newRole === "MEMBER") {
      const ok = await confirm({
        title: `Make ${m.name} a member?`,
        description: "They'll lose admin access: managing members, teams and questions, and replying to feedback.",
        confirmLabel: "Change role",
      });
      if (!ok) return;
    }
    try {
      const res = await axios.patch(
        `/api/organizations/${orgId}/members/${m.membershipId}`,
        { role: newRole }
      );
      if (res.data.success) {
        toast.success("Role updated");
        setMembers((prev) =>
          prev.map((x) =>
            x.membershipId === m.membershipId ? { ...x, role: newRole } : x
          )
        );
      } else toast.error(res.data.message);
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast.error(msg || "Failed to update role");
    }
  };

  const removeMember = async (m: Member) => {
    const ok = await confirm({
      title: `Remove ${m.name}?`,
      description: "They'll lose access to this organization and its teams immediately.",
      confirmLabel: "Remove member",
      destructive: true,
      action: () => axios.delete(`/api/organizations/${orgId}/members/${m.membershipId}`),
    });
    if (!ok) return;
    toast.success("Member removed");
    setMembers((prev) => prev.filter((x) => x.membershipId !== m.membershipId));
  };

  // ---- Invitations ----
  const sendInvite = async () => {
    if (!inviteEmail.trim()) return toast.error("Enter an email");
    setInviting(true);
    try {
      const res = await axios.post(`/api/organizations/${orgId}/invitations`, {
        email: inviteEmail,
        role: inviteRole,
        teamId: inviteTeam || undefined,
      });
      if (res.data.success) {
        toast.success(res.data.message);
        setInviteEmail("");
        setInviteTeam("");
        load();
      } else toast.error(res.data.message);
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast.error(msg || "Failed to send invite");
    } finally {
      setInviting(false);
    }
  };

  const revokeInvite = async (invite: Invitation) => {
    const ok = await confirm({
      title: `Revoke the invitation to ${invite.email}?`,
      description: "Their invite link will stop working. You can invite them again later.",
      confirmLabel: "Revoke",
      destructive: true,
      action: () => axios.delete(`/api/organizations/${orgId}/invitations/${invite._id}`),
    });
    if (!ok) return;
    toast.success("Invitation revoked");
    setInvites((prev) => prev.filter((i) => i._id !== invite._id));
  };

  // ---- Teams ----
  const createTeam = async () => {
    if (teamName.trim().length < 2) return toast.error("Name too short");
    setCreatingTeam(true);
    try {
      const res = await axios.post(`/api/organizations/${orgId}/teams`, {
        name: teamName,
      });
      if (res.data.success) {
        toast.success("Team created");
        setTeamName("");
        load();
      } else toast.error(res.data.message);
    } catch (e) {
      // A 403 here is the plan's team limit — show the server's explanation
      // and a way forward instead of a generic "Failed".
      const atLimit = axios.isAxiosError(e) && e.response?.status === 403;
      toast.error(apiError(e, "Failed to create team"), {
        action: atLimit ? { label: "View plans", onClick: () => setTab("plan") } : undefined,
      });
    } finally {
      setCreatingTeam(false);
    }
  };

  const deleteTeam = async (t: Team) => {
    const ok = await confirm({
      title: `Delete the "${t.name}" team?`,
      description: "Its questions become organization-wide. Members stay in the organization.",
      confirmLabel: "Delete team",
      destructive: true,
      action: () => axios.delete(`/api/organizations/${orgId}/teams/${t._id}`),
    });
    if (!ok) return;
    toast.success("Team deleted");
    setTeams((prev) => prev.filter((x) => x._id !== t._id));
  };

  // ---- Labels ----
  const createLabel = async () => {
    if (!newLabelName.trim()) return toast.error("Enter a name");
    setCreatingLabel(true);
    try {
      const res = await axios.post(`/api/organizations/${orgId}/labels`, {
        name: newLabelName.trim(),
        color: newLabelColor,
      });
      if (res.data.success) {
        toast.success("Label created");
        setLabels((prev) => [...prev, res.data.label]);
        setNewLabelName("");
      } else {
        toast.error(res.data.message);
      }
    } catch (e) {
      toast.error(apiError(e, "Failed to create label"));
    } finally {
      setCreatingLabel(false);
    }
  };

  const startRenameLabel = (label: LabelView) => {
    setEditingLabelId(label._id);
    setEditingLabelName(label.name);
  };

  const saveRenameLabel = async (labelId: string) => {
    const name = editingLabelName.trim();
    if (!name) return toast.error("Name is required");
    setSavingLabelId(labelId);
    try {
      const res = await axios.patch(`/api/organizations/${orgId}/labels/${labelId}`, { name });
      if (res.data.success) {
        setLabels((prev) => prev.map((l) => (l._id === labelId ? res.data.label : l)));
        setEditingLabelId(null);
      } else {
        toast.error(res.data.message);
      }
    } catch (e) {
      toast.error(apiError(e, "Failed to rename label"));
    } finally {
      setSavingLabelId(null);
    }
  };

  const recolorLabel = async (label: LabelView, color: LabelColor) => {
    if (color === label.color) return;
    setSavingLabelId(label._id);
    try {
      const res = await axios.patch(`/api/organizations/${orgId}/labels/${label._id}`, { color });
      if (res.data.success) {
        setLabels((prev) => prev.map((l) => (l._id === label._id ? res.data.label : l)));
      } else {
        toast.error(res.data.message);
      }
    } catch (e) {
      toast.error(apiError(e, "Failed to recolor label"));
    } finally {
      setSavingLabelId(null);
    }
  };

  const deleteLabel = async (label: LabelView) => {
    const ok = await confirm({
      title: `Delete the "${label.name}" label?`,
      description: "It's removed from every message that carries it. This can't be undone.",
      confirmLabel: "Delete label",
      destructive: true,
      action: () => axios.delete(`/api/organizations/${orgId}/labels/${label._id}`),
    });
    if (!ok) return;
    toast.success("Label deleted");
    setLabels((prev) => prev.filter((l) => l._id !== label._id));
  };

  // ---- Settings ----
  const renameOrg = async () => {
    if (renameValue.trim().length < 2) return toast.error("Name too short");
    setRenaming(true);
    try {
      const res = await axios.patch(`/api/organizations/${orgId}`, {
        name: renameValue,
      });
      if (res.data.success) {
        toast.success("Organization renamed. Reloading…");
        window.location.reload();
      } else toast.error(res.data.message);
    } catch (e) {
      toast.error(apiError(e, "Failed to rename"));
    } finally {
      setRenaming(false);
    }
  };

  const transferOwnership = async () => {
    if (!transferTarget) return toast.error("Choose a member first");
    const target = members.find((m) => m.membershipId === transferTarget);
    setTransferring(true);
    const ok = await confirm({
      title: `Make ${target?.name ?? "this member"} the owner?`,
      description:
        "They'll control billing, settings and deletion of this organization. You'll become an admin, and only the new owner can transfer it back.",
      confirmLabel: "Transfer ownership",
      destructive: true,
      action: () =>
        axios.patch(`/api/organizations/${orgId}/transfer-ownership`, { membershipId: transferTarget }),
    });
    setTransferring(false);
    if (!ok) return;
    toast.success("Ownership transferred. Reloading…");
    await update();
    window.location.reload();
  };

  const deleteOrg = async () => {
    const ok = await confirm({
      title: "Delete this organization?",
      description:
        "Every question, message, team and invitation in it is permanently deleted. Members lose access. This can't be undone.",
      confirmLabel: "Delete organization",
      destructive: true,
      // Typed confirmation for the one truly irreversible, org-wide action.
      requireText: orgName || orgSlug || undefined,
      action: () => axios.delete(`/api/organizations/${orgId}`),
    });
    if (!ok) return;
    toast.success("Organization deleted");
    // The JWT still carries this org as activeOrgId; a bare update()
    // re-validates it in the jwt callback, which falls back to the user's
    // oldest remaining membership. Without it, dashboard requests keep
    // 403ing against the deleted org.
    await update();
    window.location.href = "/dashboard";
  };

  // ---- Plan ----
  const switchPlan = async (newPlan: Plan) => {
    setSwitchingPlan(newPlan);
    try {
      const res = await axios.patch(`/api/organizations/${orgId}/plan`, {
        plan: newPlan,
      });
      if (res.data.success) {
        toast.success(`Switched to ${PLAN_DISPLAY[newPlan].name}`);
        setPlan(newPlan);
        // Refresh the session so the navbar's plan badge updates immediately.
        await update();
      } else {
        toast.error(res.data.message);
      }
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast.error(msg || "Failed to switch plan");
    } finally {
      setSwitchingPlan(null);
    }
  };

  const leaveOrg = async () => {
    const self = members.find((m) => m.isSelf);
    if (!self) return;
    const ok = await confirm({
      title: "Leave this organization?",
      description: "You'll lose access to its questions and feedback. An admin would have to invite you back.",
      confirmLabel: "Leave",
      destructive: true,
      action: () => axios.delete(`/api/organizations/${orgId}/members/${self.membershipId}`),
    });
    if (!ok) return;
    toast.success("You left the organization");
    await update(); // drop the now-invalid activeOrgId (see deleteOrg)
    window.location.href = "/dashboard";
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "members", label: "Members", icon: <Users className="h-4 w-4" /> },
    { key: "invitations", label: "Invitations", icon: <Mail className="h-4 w-4" /> },
    { key: "teams", label: "Teams", icon: <FolderKanban className="h-4 w-4" /> },
    ...(can(role, "org:labels")
      ? [{ key: "labels" as Tab, label: "Labels", icon: <Tag className="h-4 w-4" /> }]
      : []),
    { key: "branding", label: "Branding", icon: <Palette className="h-4 w-4" /> },
    { key: "plan", label: "Plan", icon: <CreditCard className="h-4 w-4" /> },
    ...(can(role, "org:viewActivity")
      ? [{ key: "activity" as Tab, label: "Activity", icon: <History className="h-4 w-4" /> }]
      : []),
    { key: "settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-black tracking-tight text-foreground">
            Organization settings
          </h1>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            Back to dashboard
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b-2 border-ink">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold border-b-4 -mb-0.5 transition-colors ${
                tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader size="sm" />
          </div>
        ) : (
          <>
            {tab === "members" && (
              <div className="space-y-3">
                {members.map((m) => (
                  <Card key={m.membershipId}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {m.name}{" "}
                          {m.isSelf && (
                            <span className="text-xs text-muted-foreground/70">(you)</span>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          @{m.username} · {m.email}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {m.role === "OWNER" || !can(role, "member:role") || m.isSelf ? (
                          <span className="text-xs uppercase tracking-wide text-muted-foreground px-2">
                            {m.role}
                          </span>
                        ) : (
                          <select
                            value={m.role}
                            onChange={(e) =>
                              changeRole(m, e.target.value as "ADMIN" | "MEMBER")
                            }
                            className="text-sm border-2 border-ink bg-card text-foreground rounded-lg px-2 py-1 font-medium"
                          >
                            <option value="ADMIN">ADMIN</option>
                            <option value="MEMBER">MEMBER</option>
                          </select>
                        )}
                        {can(role, "member:remove") &&
                          !m.isSelf &&
                          m.role !== "OWNER" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              aria-label={`Remove ${m.name}`}
                              title={`Remove ${m.name}`}
                              onClick={() => removeMember(m)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {tab === "invitations" && (
              <div className="space-y-6">
                {can(role, "member:invite") ? (
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <p className="font-medium">Invite a member</p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          type="email"
                          placeholder="email@example.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                        />
                        <select
                          value={inviteRole}
                          onChange={(e) =>
                            setInviteRole(e.target.value as "ADMIN" | "MEMBER")
                          }
                          className="text-sm border-2 border-ink bg-card text-foreground rounded-lg px-2 py-2 font-medium"
                        >
                          <option value="MEMBER">Member</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                        <select
                          value={inviteTeam}
                          onChange={(e) => setInviteTeam(e.target.value)}
                          className="text-sm border-2 border-ink bg-card text-foreground rounded-lg px-2 py-2 font-medium"
                        >
                          <option value="">No team</option>
                          {teams.map((t) => (
                            <option key={t._id} value={t._id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        <Button onClick={sendInvite} disabled={inviting}>
                          {inviting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Invite"
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    You don&apos;t have permission to invite members.
                  </p>
                )}

                <div className="space-y-2">
                  <p className="font-medium text-sm text-foreground">
                    Pending invitations
                  </p>
                  {invites.length === 0 && (
                    <p className="text-sm text-muted-foreground/70">No pending invitations.</p>
                  )}
                  {invites.map((i) => (
                    <Card key={i._id}>
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{i.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {i.role} · expires{" "}
                            {new Date(i.expiresAt).toLocaleDateString()}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => revokeInvite(i)}
                        >
                          Revoke
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {tab === "teams" && (
              <div className="space-y-6">
                {can(role, "team:create") && (
                  <Card>
                    <CardContent className="p-4 flex gap-2">
                      <Input
                        placeholder="New team name"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                      />
                      <Button onClick={createTeam} disabled={creatingTeam}>
                        {creatingTeam ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Create"
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                )}
                <div className="space-y-2">
                  {teams.length === 0 && (
                    <p className="text-sm text-muted-foreground/70">No teams yet.</p>
                  )}
                  {teams.map((t) => (
                    <Card key={t._id}>
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{t.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {t.memberCount} member
                            {t.memberCount === 1 ? "" : "s"}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {can(role, "team:update") && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setManageTeam(t)}
                            >
                              Members
                            </Button>
                          )}
                          {can(role, "team:delete") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              aria-label={`Delete team ${t.name}`}
                              title={`Delete team ${t.name}`}
                              onClick={() => deleteTeam(t)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {tab === "labels" && can(role, "org:labels") && (
              <div className="space-y-6">
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <p className="font-medium">New label</p>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <Input
                        placeholder="Label name"
                        value={newLabelName}
                        maxLength={LABEL_NAME_MAX}
                        onChange={(e) => setNewLabelName(e.target.value)}
                      />
                      <div className="flex items-center gap-1.5">
                        {LABEL_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={`${c} label color`}
                            aria-pressed={newLabelColor === c}
                            onClick={() => setNewLabelColor(c)}
                            className={`h-7 w-7 shrink-0 rounded-full border-2 ${LABEL_COLOR_BG[c]} ${
                              newLabelColor === c ? "border-ink ring-2 ring-ring" : "border-ink/40"
                            }`}
                          />
                        ))}
                      </div>
                      <Button onClick={createLabel} disabled={creatingLabel || labels.length >= ORG_MAX_LABELS}>
                        {creatingLabel ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
                      </Button>
                    </div>
                    {labels.length >= ORG_MAX_LABELS && (
                      <p className="text-xs text-muted-foreground">
                        An organization can have at most {ORG_MAX_LABELS} labels.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <div className="space-y-2">
                  {labels.length === 0 && (
                    <p className="text-sm text-muted-foreground/70">No labels yet.</p>
                  )}
                  {labels.map((label) => (
                    <Card key={label._id}>
                      <CardContent className="p-3 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          {editingLabelId === label._id ? (
                            <Input
                              autoFocus
                              value={editingLabelName}
                              maxLength={LABEL_NAME_MAX}
                              onChange={(e) => setEditingLabelName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveRenameLabel(label._id);
                                if (e.key === "Escape") setEditingLabelId(null);
                              }}
                              className="h-8 max-w-[220px]"
                            />
                          ) : (
                            <span className="truncate text-sm font-medium">{label.name}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {LABEL_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              aria-label={`Set color ${c}`}
                              aria-pressed={label.color === c}
                              disabled={savingLabelId === label._id}
                              onClick={() => recolorLabel(label, c)}
                              className={`h-5 w-5 shrink-0 rounded-full border-2 ${LABEL_COLOR_BG[c]} ${
                                label.color === c ? "border-ink ring-2 ring-ring" : "border-ink/40"
                              }`}
                            />
                          ))}
                        </div>
                        <div className="flex items-center gap-1">
                          {editingLabelId === label._id ? (
                            <Button
                              size="sm"
                              onClick={() => saveRenameLabel(label._id)}
                              disabled={savingLabelId === label._id}
                            >
                              {savingLabelId === label._id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "Save"
                              )}
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              aria-label={`Rename ${label.name}`}
                              title={`Rename ${label.name}`}
                              onClick={() => startRenameLabel(label)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            aria-label={`Delete ${label.name}`}
                            title={`Delete ${label.name}`}
                            onClick={() => deleteLabel(label)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {tab === "branding" && (
              <BrandingSettings
                orgId={orgId}
                orgSlug={orgSlug}
                orgName={orgName}
                role={role}
                branding={branding}
                brandingAllowed={brandingAllowed}
                hasLogo={hasLogo}
                onBrandingChange={setBranding}
                onHasLogoChange={setHasLogo}
              />
            )}

            {tab === "plan" && (
              <div className="space-y-6">
                <Card className="bg-brand-yellow/25">
                  <CardContent className="p-4">
                    <p className="font-bold text-foreground">
                      All plans are free during early access
                    </p>
                    <p className="text-sm text-muted-foreground">
                      No credit card required. Pricing isn&apos;t decided yet —
                      switch tiers freely to unlock more teams.
                    </p>
                  </CardContent>
                </Card>

                <p className="text-sm text-muted-foreground">
                  Using {teams.length} of{" "}
                  {PLAN_LIMITS[plan].maxTeams ?? "unlimited"} teams on the{" "}
                  <span className="font-bold text-foreground">
                    {PLAN_DISPLAY[plan].name}
                  </span>{" "}
                  plan.
                </p>

                <div className="grid gap-4 sm:grid-cols-3">
                  {PLAN_ORDER.map((p) => {
                    const isActive = p === plan;
                    const limit = PLAN_LIMITS[p].maxTeams;
                    return (
                      <Card
                        key={p}
                        className={isActive ? "bg-brand-mint/25" : undefined}
                      >
                        <CardContent className="p-4 space-y-3">
                          <div>
                            <p className="font-black text-lg text-foreground">
                              {PLAN_DISPLAY[p].name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {PLAN_DISPLAY[p].tagline}
                            </p>
                          </div>
                          <p className="text-2xl font-black text-foreground">
                            {p === "FREE" ? "Free" : "???"}
                          </p>
                          <ul className="space-y-1.5 text-sm text-foreground">
                            {PLAN_DISPLAY[p].features.map((f) => (
                              <li key={f} className="flex items-start gap-1.5">
                                <Check className="h-4 w-4 shrink-0 text-primary" />
                                {f}
                              </li>
                            ))}
                          </ul>
                          {isActive ? (
                            <span className="inline-block rounded-lg border-2 border-ink bg-secondary px-3 py-1.5 text-sm font-bold text-foreground">
                              Current plan
                            </span>
                          ) : can(role, "org:billing") ? (
                            <Button
                              variant="outline"
                              className="w-full"
                              disabled={switchingPlan !== null}
                              onClick={() => switchPlan(p)}
                            >
                              {switchingPlan === p ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "Switch to this plan"
                              )}
                            </Button>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              {limit !== null
                                ? `Up to ${limit} teams`
                                : "Unlimited teams"}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === "activity" && (
              <div className="space-y-2">
                {activity.length === 0 && (
                  <p className="text-sm text-muted-foreground/70">
                    No activity recorded yet.
                  </p>
                )}
                {activity.map((entry) => (
                  <Card key={entry._id}>
                    <CardContent className="p-3">
                      <p className="text-sm">
                        <span className="font-medium">
                          {entry.actor?.name || "Someone"}
                        </span>{" "}
                        {describeActivity(entry)}
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        {new Date(entry.createdAt).toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                ))}

                {activityHasMore && (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="outline"
                      onClick={loadMoreActivity}
                      disabled={activityLoadingMore}
                    >
                      {activityLoadingMore ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Load more"
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {tab === "settings" && (
              <div className="space-y-6">
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <Label>Public feedback link</Label>
                    <div className="flex gap-2">
                      <Input readOnly value={`/o/${orgSlug}`} />
                      <Button
                        variant="outline"
                        aria-label="Share feedback link"
                        title="Share feedback link"
                        onClick={() => setShareOpen(true)}
                      >
                        <Share2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {can(role, "org:rename") && (
                  <Card>
                    <CardContent className="p-4 space-y-2">
                      <Label htmlFor="rename">Rename organization</Label>
                      <div className="flex gap-2">
                        <Input
                          id="rename"
                          placeholder="New name"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                        />
                        <Button onClick={renameOrg} disabled={renaming}>
                          {renaming ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Save"
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {can(role, "org:transferOwnership") && (
                  <Card>
                    <CardContent className="p-4 space-y-2">
                      <Label htmlFor="transfer">Transfer ownership</Label>
                      <p className="text-sm text-muted-foreground">
                        Hand off the OWNER role to another member. You&apos;ll
                        become an admin.
                      </p>
                      <div className="flex gap-2">
                        <select
                          id="transfer"
                          value={transferTarget}
                          onChange={(e) => setTransferTarget(e.target.value)}
                          className="flex h-10 flex-1 rounded-lg border-2 border-ink bg-card px-3 text-sm font-medium"
                        >
                          <option value="">Choose a member…</option>
                          {members
                            .filter((m) => !m.isSelf && m.role !== "OWNER")
                            .map((m) => (
                              <option key={m.membershipId} value={m.membershipId}>
                                {m.name} (@{m.username})
                              </option>
                            ))}
                        </select>
                        <Button
                          variant="outline"
                          onClick={transferOwnership}
                          disabled={transferring || !transferTarget}
                        >
                          {transferring ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Transfer"
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium">Leave organization</p>
                      <p className="text-sm text-muted-foreground">
                        Remove yourself from this organization.
                      </p>
                    </div>
                    <Button variant="outline" onClick={leaveOrg}>
                      <LogOut className="h-4 w-4 mr-2" />
                      Leave
                    </Button>
                  </CardContent>
                </Card>

                {can(role, "org:delete") && (
                  <Card className="border-destructive/30">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-destructive">
                          Delete organization
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Permanently delete this org and all its data.
                        </p>
                      </div>
                      <Button variant="destructive" onClick={deleteOrg}>
                        Delete
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {manageTeam && (
        <ManageTeamDialog
          orgId={orgId}
          team={manageTeam}
          allMembers={members}
          onClose={() => setManageTeam(null)}
          onSaved={() => {
            setManageTeam(null);
            load();
          }}
        />
      )}

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        url={buildPublicUrl(`/o/${orgSlug}`)}
        title="Share your feedback link"
        description="Share this link or QR code to collect anonymous feedback."
        filenameBase={`${orgSlug}-feedback`}
        copyEventLabel="org"
      />
    </div>
  );
}

// Dialog to set a team's member set from the org's members.
function ManageTeamDialog({
  orgId,
  team,
  allMembers,
  onClose,
  onSaved,
}: {
  orgId: string;
  team: Team;
  allMembers: Member[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(
          `/api/organizations/${orgId}/teams/${team._id}`
        );
        if (res.data.success) {
          setSelected(
            res.data.team.members.map((m: { userId: string }) => m.userId)
          );
        }
      } catch {
        toast.error("Failed to load team");
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId, team._id]);

  const toggle = (userId: string) =>
    setSelected((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );

  const save = async () => {
    setSaving(true);
    try {
      const res = await axios.patch(
        `/api/organizations/${orgId}/teams/${team._id}`,
        { memberIds: selected }
      );
      if (res.data.success) {
        toast.success("Team updated");
        onSaved();
      } else toast.error(res.data.message);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{team.name} — members</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-1 max-h-[320px] overflow-y-auto">
            {allMembers.map((m) => (
              <label
                key={m.userId}
                className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-secondary cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(m.userId)}
                  onChange={() => toggle(m.userId)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-sm">
                  {m.name}{" "}
                  <span className="text-muted-foreground/70">@{m.username}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
