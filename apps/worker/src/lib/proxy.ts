export const proxies = [
  "http://krqhgqmx:uifephb7tjm2@31.59.20.176:6754",
  "http://krqhgqmx:uifephb7tjm2@92.113.242.158:6742",
  "http://krqhgqmx:uifephb7tjm2@38.154.203.95:5863",
  "http://krqhgqmx:uifephb7tjm2@198.105.121.200:6462",
  "http://krqhgqmx:uifephb7tjm2@64.137.96.74:6641",
  "http://krqhgqmx:uifephb7tjm2@38.154.185.97:6370",
  "http://krqhgqmx:uifephb7tjm2@142.111.67.146:5611",
  "http://krqhgqmx:uifephb7tjm2@191.96.254.138:6185",
  "http://krqhgqmx:uifephb7tjm2@23.229.19.94:8689",
  "http://krqhgqmx:uifephb7tjm2@2.57.20.2:6983"
];

export function getRandomProxy(): string {
  const randomIndex = Math.floor(Math.random() * proxies.length);
  return proxies[randomIndex];
}
