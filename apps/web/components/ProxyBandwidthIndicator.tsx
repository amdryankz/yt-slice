"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

export default function ProxyBandwidthIndicator() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const activeRequest = useRef<AbortController | null>(null);

  const loadUsage = useCallback(() => {
    if (activeRequest.current) return;
    const request = new AbortController();
    activeRequest.current = request;
    void fetch("/api/proxy/usage", { cache: "no-store", signal: request.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (request.signal.aborted) return;
        if (!response.ok) throw new Error(payload.error || "Could not load proxy usage.");
        setUsage(payload as Usage);
        setError(null);
      })
      .catch((err) => {
        if (!request.signal.aborted) {
          setError(err instanceof Error ? err.message : "Could not load proxy usage.");
        }
      })
      .finally(() => {
        if (activeRequest.current === request) {
          activeRequest.current = null;
          setLoading(false);
        }
      });
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    loadUsage();
  }, [loadUsage]);

  useEffect(() => {
    loadUsage();
    const interval = window.setInterval(refresh, 5 * 60 * 1000);
    return () => {
      window.clearInterval(interval);
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [loadUsage, refresh]);

  const usedGb = usage ? usage.bandwidthUsedBytes / 1024 ** 3 : 0;
  const limit = usage && usage.bandwidthLimitGb > 0 ? usage.bandwidthLimitGb : null;
  const percent = limit === null ? 0 : Math.min(100, (usedGb / limit) * 100);
  const usedLabel = usage ? formatBytes(usage.bandwidthUsedBytes) : loading ? "Loading…" : "Unavailable";
  const limitLabel = limit === null ? null : `${limit.toLocaleString()} GB`;

  return (
    <details
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape" && event.currentTarget.open) {
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 whitespace-nowrap rounded-lg border border-white/10 bg-white/5 px-3 text-xs transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 [&::-webkit-details-marker]:hidden">
        <Gauge aria-hidden="true" className="size-4 shrink-0 text-cyan-300" />
        <span className="font-medium text-slate-300">Proxy<span className="sr-only sm:not-sr-only"> bandwidth</span></span>
        <span aria-live="polite" className={`tabular-nums ${error ? "text-amber-300" : "text-cyan-100"}`}>
          {usedLabel}{limitLabel && <span className="hidden text-slate-400 sm:inline"> / {limitLabel}</span>}
        </span>
      </summary>

      <section aria-label="Proxy bandwidth details" className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw_-_2rem)] space-y-4 rounded-xl border border-white/10 bg-slate-900 p-4 text-sm shadow-xl shadow-black/30">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-100">Proxy bandwidth</h2>
            <p className="mt-0.5 text-xs text-slate-400">Webshare · current billing period</p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw aria-hidden="true" className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {error && <p role="status" className="rounded-lg bg-amber-400/10 p-2 text-xs text-amber-200">{error}</p>}

        {usage ? (
          <>
            <dl className="flex justify-between gap-3 tabular-nums">
              <div>
                <dt className="text-xs text-slate-400">Used</dt>
                <dd className="font-semibold text-slate-100">
                  {usedLabel} <span className="text-xs font-normal text-slate-400">{limitLabel ? `of ${limitLabel}` : "· unlimited"}</span>
                </dd>
              </div>
              {limit !== null && (
                <div className="text-right">
                  <dt className="text-xs text-slate-400">Remaining</dt>
                  <dd className="font-semibold text-slate-100">{Math.max(0, limit - usedGb).toFixed(2)} GB</dd>
                </div>
              )}
            </dl>

            {limit !== null && (
              <div
                className="h-1.5 overflow-hidden rounded-full bg-slate-800"
                role="progressbar"
                aria-label="Webshare bandwidth used"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(percent)}
              >
                <div className="h-full rounded-full bg-cyan-400 transition-[width]" style={{ width: `${percent}%` }} />
              </div>
            )}

            <p className="text-xs text-slate-400">
              {usage.periodEndsAt
                ? `Renews ${new Date(usage.periodEndsAt).toLocaleDateString()}`
                : `Updated ${new Date(usage.fetchedAt).toLocaleTimeString()}`}
            </p>
          </>
        ) : loading && (
          <span className="block text-xs text-slate-400" role="status">Loading bandwidth usage…</span>
        )}
      </section>
    </details>
  );
}
