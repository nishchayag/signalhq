"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import Loader from "@/components/Loader";
import { Card, CardContent } from "@/components/ui/card";
import { formatAnswer, type MessageAnswer } from "@/lib/answers";

interface ThreadEntry {
  authorRole: "member" | "org";
  content: string;
  createdAt: string;
}

interface ThreadSummary {
  _id: string;
  content: string;
  answer?: MessageAnswer;
  createdAt: string;
  replies: ThreadEntry[];
  authorUserId: { _id: string; name: string; username: string } | null;
}

export default function QuestionRepliesPage() {
  const params = useParams<{ questionId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [questionText, setQuestionText] = useState("");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/questions/${params.questionId}/replies`);
      if (res.data.success) {
        setQuestionText(res.data.question.questionText);
        setThreads(res.data.threads);
      } else {
        toast.error(res.data.message || "Failed to load replies");
      }
    } catch (error) {
      const msg = axios.isAxiosError(error) ? error.response?.data?.message : null;
      toast.error(msg || "Failed to load replies");
    } finally {
      setLoading(false);
    }
  }, [params.questionId]);

  useEffect(() => {
    // Standard fetch-on-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const lastActivity = (thread: ThreadSummary) => {
    const last = thread.replies[thread.replies.length - 1];
    return last ? last.createdAt : thread.createdAt;
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              Replies
            </h1>
            {questionText && (
              <p className="mt-1 text-muted-foreground">{questionText}</p>
            )}
          </div>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            Back to dashboard
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader size="sm" />
          </div>
        ) : threads.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-ink/40 py-16 text-center">
            <MessageSquare className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
            <h3 className="mb-1 text-lg font-bold text-foreground">
              No answers yet
            </h3>
            <p className="text-muted-foreground">
              Each team member&apos;s private thread will show up here once they answer.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {threads.map((thread) => (
              <Link
                key={thread._id}
                href={`/dashboard/questions/${params.questionId}/replies/${thread._id}`}
              >
                <Card className="pop cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-foreground truncate">
                          {thread.authorUserId?.name || "Unknown member"}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          @{thread.authorUserId?.username || "unknown"}
                        </span>
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        {thread.answer && (
                          <span className="shrink-0 rounded-md border-2 border-ink bg-brand-blue/30 px-1.5 py-0.5 text-xs font-bold text-foreground">
                            {formatAnswer(thread.answer)}
                          </span>
                        )}
                        <span className="truncate">{thread.content}</span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        {thread.replies.length > 0
                          ? `${thread.replies.length} follow-up${thread.replies.length === 1 ? "" : "s"} — `
                          : ""}
                        last activity{" "}
                        {formatDistanceToNow(new Date(lastActivity(thread)), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
