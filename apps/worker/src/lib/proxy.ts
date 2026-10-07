export const proxies = [
  "http://krqhgqmx:uifephb7tjm2@31.59.20.176:6754",
  "http://krqhgqmx:uifephb7tjm2@45.38.107.97:6014",
  "http://krqhgqmx:uifephb7tjm2@64.137.96.74:6641",
  "http://krqhgqmx:uifephb7tjm2@198.23.243.226:6361",
  "http://krqhgqmx:uifephb7tjm2@38.154.185.97:6370",
  "http://krqhgqmx:uifephb7tjm2@84.247.60.125:6095",
  "http://krqhgqmx:uifephb7tjm2@142.111.67.146:5611",
  "http://krqhgqmx:uifephb7tjm2@191.96.254.138:6185",
  "http://krqhgqmx:uifephb7tjm2@31.58.9.4:6077",
  "http://krqhgqmx:uifephb7tjm2@198.46.161.42:5092"
];

export function getRandomProxy(): string {
  const randomIndex = Math.floor(Math.random() * proxies.length);
  return proxies[randomIndex];
}
