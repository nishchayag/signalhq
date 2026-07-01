"use client";
import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import axios from "axios";
import { toast } from "sonner";
import { Building2, Check, ChevronDown, Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Org {
  _id: string;
  name: string;
  slug: string;
  role: string;
}

export default function OrgSwitcher() {
  const { data: session, update } = useSession();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const activeOrgId = session?.user?.activeOrgId;

  const fetchOrgs = async () => {
    try {
      const res = await axios.get("/api/organizations");
      if (res.data.success) setOrgs(res.data.organizations);
    } catch (error) {
      console.error("Error loading organizations:", error);
    }
  };

  useEffect(() => {
    if (session) fetchOrgs();
  }, [session]);

  const active =
    orgs.find((o) => o._id === activeOrgId) || orgs[0] || null;

  const switchOrg = async (orgId: string) => {
    if (orgId === activeOrgId) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      await update({ activeOrgId: orgId });
      // Reload so every org-scoped view re-fetches against the new context.
      window.location.reload();
    } catch (error) {
      console.error("Error switching organization:", error);
      toast.error("Failed to switch organization");
      setSwitching(false);
    }
  };

  const createOrg = async () => {
    if (newName.trim().length < 2) {
      toast.error("Name must be at least 2 characters");
      return;
    }
    setCreating(true);
    try {
      const res = await axios.post("/api/organizations", { name: newName });
      if (res.data.success) {
        toast.success("Organization created");
        setShowCreate(false);
        setNewName("");
        await update({ activeOrgId: res.data.organization._id });
        window.location.reload();
      } else {
        toast.error(res.data.message || "Failed to create organization");
      }
    } catch (error) {
      console.error("Error creating organization:", error);
      toast.error("Failed to create organization");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        className="w-full flex items-center justify-between gap-2 p-3 rounded-lg border border-border bg-background hover:bg-accent transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Building2 className="h-4 w-4 flex-shrink-0 text-primary" />
          <span className="truncate text-sm font-medium">
            {switching ? "Switching..." : active?.name || "No organization"}
          </span>
        </span>
        {switching ? (
          <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && !switching && (
        <div className="absolute z-20 mt-1 w-full bg-popover text-popover-foreground border border-border rounded-lg shadow-lg py-1">
          {orgs.map((o) => (
            <button
              key={o._id}
              onClick={() => switchOrg(o._id)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="truncate">{o.name}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {o.role}
                </span>
              </span>
              {o._id === active?._id && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </button>
          ))}
          <div className="border-t border-border mt-1 pt-1">
            <button
              onClick={() => {
                setOpen(false);
                setShowCreate(true);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-accent"
            >
              <Plus className="h-4 w-4" />
              New organization
            </button>
          </div>
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={(v) => !creating && setShowCreate(v)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Create organization</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="orgName">Name</Label>
            <Input
              id="orgName"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Acme Inc."
              disabled={creating}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreate(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={createOrg} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
