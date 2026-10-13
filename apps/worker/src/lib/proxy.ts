const PROXY_URL_ENV = "WEBSHARE_PROXY_URL";
const API_KEY_ENV = "WEBSHARE_API_KEY";
const API_BASE = "https://proxy.webshare.io/api/v2";
const PROXY_CACHE_TTL_MS = 5 * 60 * 1000;

type WebshareProxy = {
  valid: boolean;
  username: string;
  password: string;
  proxy_address: string | null;
  port: number;
};

type WebshareProxyResponse = {
  results?: WebshareProxy[];
};

let cachedProxyList: { mode: "direct" | "backbone"; expiresAt: number; proxies: WebshareProxy[] } | null = null;

function getConfiguredProxyUrl(): URL {
  const value = process.env[PROXY_URL_ENV]?.trim();
  if (!value) {
    throw new Error(`${PROXY_URL_ENV} is missing from the worker environment.`);
  }

  try {
    const parsed = new URL(value);
    if (!["http:", "https:", "socks5:"].includes(parsed.protocol) || !parsed.hostname) {
      throw new Error("Unsupported proxy URL");
    }
    return parsed;
  } catch {
    throw new Error(`${PROXY_URL_ENV} must be a valid proxy URL, such as http://user:password@p.webshare.io:80.`);
  }
}

async function getWebshareProxyList(
  apiKey: string,
  mode: "direct" | "backbone",
): Promise<WebshareProxy[]> {
  if (cachedProxyList?.mode === mode && cachedProxyList.expiresAt > Date.now()) {
    return cachedProxyList.proxies;
  }

  const query = new URLSearchParams({ mode, page: "1", page_size: "100" });
  const response = await fetch(`${API_BASE}/proxy/list/?${query}`, {
    headers: { Authorization: `Token ${apiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`Webshare proxy list returned ${response.status}.`);
  }

  const body = (await response.json()) as WebshareProxyResponse;
  const proxies = (body.results ?? []).filter((proxy) =>
    proxy.valid && proxy.username && proxy.password && proxy.port && (mode === "backbone" || proxy.proxy_address),
  );

  if (proxies.length === 0) {
    throw new Error("Webshare returned no valid proxies.");
  }

  cachedProxyList = { mode, expiresAt: Date.now() + PROXY_CACHE_TTL_MS, proxies };
  return proxies;
}

function toProxyUrl(proxy: WebshareProxy, configured: URL, mode: "direct" | "backbone"): string {
  const host = mode === "backbone" ? configured.hostname : proxy.proxy_address ?? configured.hostname;
  const port = mode === "backbone" ? configured.port || String(proxy.port) : String(proxy.port);
  const url = new URL(`${configured.protocol}//${host}:${port}`);
  url.username = proxy.username;
  url.password = proxy.password;
  return url.toString();
}

/** Select a different valid Webshare proxy for each retry when an API key is available. */
export async function getProxyUrl(excludedProxyHosts: ReadonlySet<string> = new Set()): Promise<string> {
  const configured = getConfiguredProxyUrl();
  const apiKey = process.env[API_KEY_ENV]?.trim();
  if (!apiKey) return configured.toString();

  const mode = configured.hostname.toLowerCase() === "p.webshare.io" ? "backbone" : "direct";
  try {
    const proxies = await getWebshareProxyList(apiKey, mode);
    const available = proxies.filter((proxy) => {
      const url = toProxyUrl(proxy, configured, mode);
      return !excludedProxyHosts.has(new URL(url).host.toLowerCase());
    });
    const choices = available.length > 0 ? available : proxies;
    const selected = choices[Math.floor(Math.random() * choices.length)];
    if (!selected) return configured.toString();
    return toProxyUrl(selected, configured, mode);
  } catch (error) {
    console.warn("[Proxy] Could not load the Webshare proxy list; using the configured proxy URL.", error instanceof Error ? error.message : "unknown error");
    return configured.toString();
  }
}

export function getProxyLabel(proxyUrl: string): string {
  try {
    const parsed = new URL(proxyUrl);
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return "configured proxy";
  }
}
