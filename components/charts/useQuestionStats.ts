"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { apiError } from "@/lib/apiError";
import { CURRENT_TZ, type QuestionStats } from "@/lib/analyticsTypes";

/**
 * Fetches GET /api/analytics/questions/[id] for the Results panel. No range
 * picker here (spans the question's whole lifetime by default, per the
 * route's own default) — just tz.
 */
export function useQuestionStats(questionId: string | undefined) {
  const [data, setData] = useState<QuestionStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const requestId = useRef(0);

  const fetchStats = useCallback(async () => {
    if (!questionId) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    setRateLimited(false);
    try {
      const res = await axios.get(`/api/analytics/questions/${questionId}`, {
        params: { tz: CURRENT_TZ() },
      });
      if (id !== requestId.current) return;
      if (res.data.success) setData(res.data as QuestionStats);
      else setError(res.data.message || "Failed to load stats");
    } catch (err) {
      if (id !== requestId.current) return;
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        setRateLimited(true);
      } else if (axios.isAxiosError(err) && err.response?.status === 403) {
        // Internal question, viewer isn't OWNER/ADMIN — not an error, just no panel.
        setData(null);
      } else {
        setError(apiError(err, "Failed to load results"));
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [questionId]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setData(null);
    fetchStats();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [fetchStats]);

  return { data, loading, error, rateLimited, retry: fetchStats };
}
