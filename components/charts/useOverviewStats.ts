"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { apiError } from "@/lib/apiError";
import { CURRENT_TZ, type OverviewStats } from "@/lib/analyticsTypes";

export type RangePreset = "7d" | "30d" | "90d" | "12m";

export function presetToRange(
  preset: RangePreset,
  now: Date = new Date()
): { from: string; to: string; bucket?: "day" | "week" } {
  const to = new Date(now);
  const from = new Date(to);
  if (preset === "7d") from.setDate(from.getDate() - 6);
  else if (preset === "30d") from.setDate(from.getDate() - 29);
  else if (preset === "90d") from.setDate(from.getDate() - 89);
  else from.setMonth(from.getMonth() - 12);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  return { from: ymd(from), to: ymd(to), bucket: preset === "12m" ? "week" : undefined };
}

/**
 * Fetches GET /api/analytics/overview for the active org, re-fetching
 * whenever the range preset or team filter changes. Distinguishes a real
 * error from a 429 (rate limited) so the page can show the right state —
 * "refetch keeps the frame": the previous render is kept (not cleared) while
 * a refetch is in flight, so the charts don't flash empty on every filter
 * change.
 */
export function useOverviewStats(opts: { orgId: string | undefined; preset: RangePreset; teamId: string }) {
  const { orgId, preset, teamId } = opts;
  const [data, setData] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const requestId = useRef(0);

  const fetchStats = useCallback(async () => {
    if (!orgId) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    setRateLimited(false);
    try {
      const { from, to, bucket } = presetToRange(preset);
      const res = await axios.get("/api/analytics/overview", {
        params: { from, to, tz: CURRENT_TZ(), ...(bucket ? { bucket } : {}), ...(teamId ? { teamId } : {}) },
      });
      if (id !== requestId.current) return;
      if (res.data.success) setData(res.data as OverviewStats);
      else setError(res.data.message || "Failed to load analytics");
    } catch (err) {
      if (id !== requestId.current) return;
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        setRateLimited(true);
      } else {
        setError(apiError(err, "Failed to load analytics"));
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [orgId, preset, teamId]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    fetchStats();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [fetchStats]);

  return { data, loading, error, rateLimited, retry: fetchStats };
}
