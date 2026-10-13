const PROXY_URL_ENV = "WEBSHARE_PROXY_URL";

/** Return the Webshare proxy URL without exposing its credentials in logs. */
export function getProxyUrl(): string {
  const proxyUrl = process.env[PROXY_URL_ENV]?.trim();

  if (!proxyUrl) {
    throw new Error(`${PROXY_URL_ENV} is missing from the worker environment.`);
  }

  try {
    const parsed = new URL(proxyUrl);
    if (!["http:", "https:", "socks5:"].includes(parsed.protocol)) {
      throw new Error("Unsupported proxy protocol");
    }
    if (!parsed.hostname) {
      throw new Error("Proxy host is required");
    }
  } catch {
    throw new Error(`${PROXY_URL_ENV} must be a valid proxy URL, such as http://user:password@p.webshare.io:80.`);
  }

  return proxyUrl;
}

export function getProxyLabel(proxyUrl: string): string {
  try {
    const parsed = new URL(proxyUrl);
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return "configured proxy";
  }
}
