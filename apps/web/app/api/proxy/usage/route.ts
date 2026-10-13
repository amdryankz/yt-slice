export const dynamic = "force-dynamic";

const API_BASE = "https://proxy.webshare.io/api/v2";

type WebshareSubscription = {
  plan?: number;
  start_date?: string;
  end_date?: string;
};

type WebsharePlan = {
  bandwidth_limit?: number;
};

type WebshareStats = {
  bandwidth_total?: number;
};

async function webshareGet<T>(path: string): Promise<T> {
  const token = process.env.WEBSHARE_API_KEY;
  if (!token) throw new Error("Webshare API key is not configured.");

  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Token ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`Webshare returned ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

export async function GET() {
  if (!process.env.WEBSHARE_API_KEY) {
    return Response.json(
      { error: "Add WEBSHARE_API_KEY to the web server environment to show bandwidth usage." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const subscription = await webshareGet<WebshareSubscription>("/subscription/");
    if (!subscription.plan || !subscription.start_date) {
      throw new Error("Webshare did not return an active plan.");
    }

    const now = new Date();
    const query = new URLSearchParams({
      timestamp__gte: subscription.start_date,
      timestamp__lte: now.toISOString(),
    });
    const [plan, stats] = await Promise.all([
      webshareGet<WebsharePlan>(`/subscription/plan/${subscription.plan}/`),
      webshareGet<WebshareStats>(`/stats/aggregate/?${query.toString()}`),
    ]);

    return Response.json(
      {
        bandwidthUsedBytes: Math.max(0, stats.bandwidth_total ?? 0),
        bandwidthLimitGb: Math.max(0, plan.bandwidth_limit ?? 0),
        periodEndsAt: subscription.end_date ?? null,
        fetchedAt: now.toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[Webshare] Failed to retrieve proxy usage:", error);
    return Response.json(
      { error: "Could not load Webshare bandwidth. Check the API key and try again." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
