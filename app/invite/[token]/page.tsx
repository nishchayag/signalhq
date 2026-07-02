"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface InviteInfo {
  email: string;
  role: string;
  status: string;
  valid: boolean;
  organization: { name: string; slug: string } | null;
}

export default function AcceptInvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { data: session, status, update } = useSession();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`/api/invitations/${token}`);
        if (res.data.success) setInfo(res.data.invitation);
      } catch {
        setInfo(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const accept = async () => {
    setAccepting(true);
    try {
      const res = await axios.post("/api/invitations/accept", { token });
      if (res.data.success) {
        toast.success("Invitation accepted!");
        // Switch the active org to the one just joined, then go manage it.
        if (res.data.organization?._id) {
          await update({ activeOrgId: res.data.organization._id });
        }
        router.push("/dashboard/organization");
      } else {
        toast.error(res.data.message || "Failed to accept");
      }
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast.error(msg || "Failed to accept invitation");
    } finally {
      setAccepting(false);
    }
  };

  const wrap = (children: React.ReactNode) => (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden bg-dot-grid px-4">
      <Card className="relative z-10 w-full max-w-md shadow-solid-lg">{children}</Card>
    </div>
  );

  if (loading || status === "loading") {
    return wrap(
      <CardContent className="py-12 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </CardContent>
    );
  }

  if (!info || !info.organization) {
    return wrap(
      <CardContent className="py-10 text-center">
        <h2 className="text-xl font-black mb-2">Invitation not found</h2>
        <p className="text-muted-foreground">
          This invitation link is invalid or no longer exists.
        </p>
      </CardContent>
    );
  }

  if (!info.valid) {
    return wrap(
      <CardContent className="py-10 text-center">
        <h2 className="text-xl font-black mb-2">
          This invitation is {info.status.toLowerCase()}
        </h2>
        <p className="text-muted-foreground">
          Ask an organization admin to send you a new one.
        </p>
      </CardContent>
    );
  }

  return wrap(
    <>
      <CardHeader>
        <span className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 border-ink bg-brand-pink text-ink text-xl font-black">
          {info.organization.name.charAt(0).toUpperCase()}
        </span>
        <CardTitle className="text-center text-2xl font-black">
          Join {info.organization.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-center space-y-4">
        <p className="text-muted-foreground">
          You&apos;ve been invited to join{" "}
          <strong>{info.organization.name}</strong> as a{" "}
          <strong>{info.role.toLowerCase()}</strong>.
        </p>
        <p className="text-sm text-muted-foreground">Invitation sent to {info.email}</p>

        {session ? (
          <Button onClick={accept} disabled={accepting} className="w-full" size="lg">
            {accepting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Accepting...
              </>
            ) : (
              "Accept invitation"
            )}
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Log in or sign up with <strong>{info.email}</strong> to accept.
            </p>
            <Button asChild className="w-full">
              <Link href={`/login?callbackUrl=/invite/${token}`}>Log in</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/signup?callbackUrl=/invite/${token}`}>
                Create an account
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </>
  );
}
