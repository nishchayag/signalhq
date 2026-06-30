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
  Copy,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { can } from "@/lib/permissions";
import type { MembershipRole } from "@/models/membership.model";

type Tab = "members" | "invitations" | "teams" | "settings";

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
  const { data: session } = useSession();
  const router = useRouter();
  const orgId = session?.user?.activeOrgId;
  const role = session?.user?.activeOrgRole as MembershipRole | undefined;
  const orgSlug = session?.user?.activeOrgSlug;

  const [tab, setTab] = useState<Tab>("members");
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [inviteTeam, setInviteTeam] = useState("");
  const [inviting, setInviting] = useState(false);

  // Team form
  const [teamName, setTeamName] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [manageTeam, setManageTeam] = useState<Team | null>(null);

  // Settings
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [m, t] = await Promise.all([
        axios.get(`/api/organizations/${orgId}/members`),
        axios.get(`/api/organizations/${orgId}/teams`),
      ]);
      if (m.data.success) setMembers(m.data.members);
      if (t.data.success) setTeams(t.data.teams);
      if (can(role, "member:invite")) {
        const inv = await axios.get(`/api/organizations/${orgId}/invitations`);
        if (inv.data.success) setInvites(inv.data.invitations);
      }
    } catch (error) {
      console.error("Error loading organization:", error);
      toast.error("Failed to load organization");
    } finally {
      setLoading(false);
    }
  }, [orgId, role]);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  if (!orgId) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        No active organization.
      </div>
    );
  }

  // ---- Member actions ----
  const changeRole = async (m: Member, newRole: "ADMIN" | "MEMBER") => {
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
    if (!confirm(`Remove ${m.name} from the organization?`)) return;
    try {
      const res = await axios.delete(
        `/api/organizations/${orgId}/members/${m.membershipId}`
      );
      if (res.data.success) {
        toast.success("Member removed");
        setMembers((prev) =>
          prev.filter((x) => x.membershipId !== m.membershipId)
        );
      } else toast.error(res.data.message);
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast.error(msg || "Failed to remove member");
    }
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

  const revokeInvite = async (id: string) => {
    try {
      const res = await axios.delete(
        `/api/organizations/${orgId}/invitations/${id}`
      );
      if (res.data.success) {
        toast.success("Invitation revoked");
        setInvites((prev) => prev.filter((i) => i._id !== id));
      }
    } catch {
      toast.error("Failed to revoke");
    }
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
    } catch {
      toast.error("Failed to create team");
    } finally {
      setCreatingTeam(false);
    }
  };

  const deleteTeam = async (t: Team) => {
    if (!confirm(`Delete team "${t.name}"? Its questions become org-level.`))
      return;
    try {
      const res = await axios.delete(
        `/api/organizations/${orgId}/teams/${t._id}`
      );
      if (res.data.success) {
        toast.success("Team deleted");
        setTeams((prev) => prev.filter((x) => x._id !== t._id));
      }
    } catch {
      toast.error("Failed to delete team");
    }
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
    } catch {
      toast.error("Failed to rename");
    } finally {
      setRenaming(false);
    }
  };

  const deleteOrg = async () => {
    if (
      !confirm(
        "Delete this organization and ALL its data? This cannot be undone."
      )
    )
      return;
    try {
      const res = await axios.delete(`/api/organizations/${orgId}`);
      if (res.data.success) {
        toast.success("Organization deleted");
        window.location.href = "/dashboard";
      } else toast.error(res.data.message);
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast.error(msg || "Failed to delete");
    }
  };

  const leaveOrg = async () => {
    const self = members.find((m) => m.isSelf);
    if (!self) return;
    if (!confirm("Leave this organization?")) return;
    try {
      const res = await axios.delete(
        `/api/organizations/${orgId}/members/${self.membershipId}`
      );
      if (res.data.success) {
        toast.success("You left the organization");
        window.location.href = "/dashboard";
      } else toast.error(res.data.message);
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast.error(msg || "Failed to leave");
    }
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "members", label: "Members", icon: <Users className="h-4 w-4" /> },
    { key: "invitations", label: "Invitations", icon: <Mail className="h-4 w-4" /> },
    { key: "teams", label: "Teams", icon: <FolderKanban className="h-4 w-4" /> },
    { key: "settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Organization settings
          </h1>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            Back to dashboard
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
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
                            <span className="text-xs text-gray-400">(you)</span>
                          )}
                        </p>
                        <p className="text-sm text-gray-500 truncate">
                          @{m.username} · {m.email}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {m.role === "OWNER" || !can(role, "member:role") || m.isSelf ? (
                          <span className="text-xs uppercase tracking-wide text-gray-500 px-2">
                            {m.role}
                          </span>
                        ) : (
                          <select
                            value={m.role}
                            onChange={(e) =>
                              changeRole(m, e.target.value as "ADMIN" | "MEMBER")
                            }
                            className="text-sm border border-gray-200 rounded-md px-2 py-1"
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
                              onClick={() => removeMember(m)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
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
                          className="text-sm border border-gray-200 rounded-md px-2 py-2"
                        >
                          <option value="MEMBER">Member</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                        <select
                          value={inviteTeam}
                          onChange={(e) => setInviteTeam(e.target.value)}
                          className="text-sm border border-gray-200 rounded-md px-2 py-2"
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
                  <p className="text-sm text-gray-500">
                    You don&apos;t have permission to invite members.
                  </p>
                )}

                <div className="space-y-2">
                  <p className="font-medium text-sm text-gray-700">
                    Pending invitations
                  </p>
                  {invites.length === 0 && (
                    <p className="text-sm text-gray-400">No pending invitations.</p>
                  )}
                  {invites.map((i) => (
                    <Card key={i._id}>
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{i.email}</p>
                          <p className="text-xs text-gray-500">
                            {i.role} · expires{" "}
                            {new Date(i.expiresAt).toLocaleDateString()}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => revokeInvite(i._id)}
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
                    <p className="text-sm text-gray-400">No teams yet.</p>
                  )}
                  {teams.map((t) => (
                    <Card key={t._id}>
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{t.name}</p>
                          <p className="text-xs text-gray-500">
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
                              onClick={() => deleteTeam(t)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
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
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `${window.location.origin}/o/${orgSlug}`
                          );
                          toast.success("Link copied");
                        }}
                      >
                        <Copy className="h-4 w-4" />
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

                <Card>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium">Leave organization</p>
                      <p className="text-sm text-gray-500">
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
                  <Card className="border-red-200">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-red-700">
                          Delete organization
                        </p>
                        <p className="text-sm text-gray-500">
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
                className="flex items-center gap-2 px-2 py-2 rounded hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(m.userId)}
                  onChange={() => toggle(m.userId)}
                />
                <span className="text-sm">
                  {m.name}{" "}
                  <span className="text-gray-400">@{m.username}</span>
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
