"use client";

import { useCallback, useEffect, useState } from "react";
import { Gauge, RefreshCw } from "lucide-react";

type Usage = {
  bandwidthUsedBytes: number;
  bandwidthLimitGb: number;
  periodEndsAt: string | null;
  fetchedAt: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export default function ProxyBandwidthCard() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/proxy/usage", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load proxy usage.");
      setUsage(payload as Usage);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load proxy usage.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const usedGb = usage ? usage.bandwidthUsedBytes / 1024 ** 3 : 0;
  const hasLimit = Boolean(usage && usage.bandwidthLimitGb > 0);
  const percent = hasLimit && usage
    ? Math.min(100, (usedGb / usage.bandwidthLimitGb) * 100)
    : 0;
  const remainingGb = hasLimit && usage
    ? Math.max(0, usage.bandwidthLimitGb - usedGb)
    : null;

  return (
    <section className="relative mb-6 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 shadow-xl shadow-black/10 backdrop-blur-xl">
      <div className="pointer-events-none absolute -right-14 -top-20 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/15 bg-cyan-400/[0.08] text-cyan-300">
            <Gauge className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Proxy bandwidth</h2>
            <p className="mt-0.5 text-xs text-slate-500">Webshare · current billing period</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="Refresh Webshare bandwidth"
          className="inline-flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-400 transition hover:border-white/15 hover:bg-white/[0.07] hover:text-slate-200 disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="relative px-5 py-5 sm:px-6 sm:py-6">
        {error ? (
          <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.05] px-4 py-3 text-sm text-amber-200/90">
            {error}
          </div>
        ) : usage ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Used this period</p>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    {formatBytes(usage.bandwidthUsedBytes)}
                  </span>
                  <span className="text-sm text-slate-500">
                    {hasLimit ? `of ${usage.bandwidthLimitGb.toLocaleString()} GB` : "· unlimited plan"}
                  </span>
                </div>
              </div>

              {hasLimit && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-3.5 py-2.5 text-right">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Remaining</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-200">{remainingGb!.toFixed(2)} GB</p>
                </div>
              )}
            </div>

            {hasLimit && (
              <div className="mt-5">
                <div
                  className="h-2 overflow-hidden rounded-full bg-slate-800/90 ring-1 ring-inset ring-white/[0.03]"
                  role="progressbar"
                  aria-label="Webshare bandwidth used"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(percent)}
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 shadow-[0_0_14px_rgba(34,211,238,0.25)] transition-[width] duration-700 ease-out"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="mt-2 text-xs font-medium text-cyan-200/80">
                  {percent.toFixed(1)}% of plan used
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-white/[0.06] pt-3 text-xs text-slate-500">
              <span>
                {usage.periodEndsAt
                  ? `Renews ${new Date(usage.periodEndsAt).toLocaleDateString()}`
                  : `Updated ${new Date(usage.fetchedAt).toLocaleTimeString()}`}
              </span>
              <span>Usage refreshes every 5 minutes</span>
            </div>
          </>
        ) : (
          <div className="animate-pulse space-y-4" aria-label="Loading bandwidth usage">
            <div className="h-3 w-28 rounded bg-white/[0.07]" />
            <div className="h-9 w-48 rounded bg-white/[0.07]" />
            <div className="h-2 w-full rounded-full bg-white/[0.06]" />
          </div>
        )}
      </div>
    </section>
  );
}
