"use client";
import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createQuestionSchema,
  CreateQuestionRequest,
} from "@/schemas/questionSchema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { IQuestion } from "@/models/question.model";

interface CreateQuestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onQuestionCreated: (question: IQuestion) => void;
}

interface Team {
  _id: string;
  name: string;
  isMember: boolean;
}

export default function CreateQuestionDialog({
  open,
  onOpenChange,
  onQuestionCreated,
}: CreateQuestionDialogProps) {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateQuestionRequest>({
    resolver: zodResolver(createQuestionSchema),
    defaultValues: { visibility: "public" },
  });

  // Load the active org's teams when the dialog opens so the question can be
  // scoped to one. Members only see teams they belong to (they can't create
  // questions for teams they aren't part of, and wouldn't see them afterwards).
  useEffect(() => {
    if (!open) return;
    const orgId = session?.user?.activeOrgId;
    if (!orgId) return;
    (async () => {
      try {
        const res = await axios.get(`/api/organizations/${orgId}/teams`);
        if (res.data.success) {
          const all: Team[] = res.data.teams;
          const isMemberRole = session?.user?.activeOrgRole === "MEMBER";
          setTeams(isMemberRole ? all.filter((t) => t.isMember) : all);
        }
      } catch (error) {
        console.error("Error loading teams:", error);
      }
    })();
  }, [open, session]);

  const onSubmit = async (data: CreateQuestionRequest) => {
    setLoading(true);
    try {
      const response = await axios.post("/api/questions", data);
      if (response.data.success) {
        onQuestionCreated(response.data.question);
        reset();
        onOpenChange(false);
      } else {
        toast.error(response.data.message || "Failed to create question");
      }
    } catch (error) {
      console.error("Error creating question:", error);
      toast.error("Failed to create question");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Question</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="questionText">Question *</Label>
            <Textarea
              id="questionText"
              {...register("questionText")}
              placeholder="What would you like to ask your audience?"
              className="min-h-[80px] resize-none"
              disabled={loading}
            />
            {errors.questionText && (
              <p className="text-sm text-destructive">
                {errors.questionText.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              {...register("description")}
              placeholder="Add context or instructions for your question..."
              className="min-h-[60px] resize-none"
              disabled={loading}
            />
            {errors.description && (
              <p className="text-sm text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="visibility">Who can answer</Label>
            <select
              id="visibility"
              {...register("visibility")}
              disabled={loading}
              className="flex h-11 w-full rounded-lg border-2 border-ink bg-card px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="public">Public — anyone with the link can respond</option>
              <option value="internal">
                Internal — only your team can privately answer
              </option>
            </select>
          </div>

          {teams.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="teamId">Team (Optional)</Label>
              <select
                id="teamId"
                {...register("teamId")}
                disabled={loading}
                className="flex h-11 w-full rounded-lg border-2 border-ink bg-card px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Organization-wide (no team)</option>
                {teams.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Question"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
