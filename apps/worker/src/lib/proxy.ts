export const proxies = [
  "http://ggzcmfnt:dtm8nm5zxsdm@31.59.20.176:6754",
  "http://ggzcmfnt:dtm8nm5zxsdm@31.56.127.193:7684",
  "http://ggzcmfnt:dtm8nm5zxsdm@45.38.107.97:6014",
  "http://ggzcmfnt:dtm8nm5zxsdm@38.154.203.95:5863",
  "http://ggzcmfnt:dtm8nm5zxsdm@198.105.121.200:6462",
  "http://ggzcmfnt:dtm8nm5zxsdm@64.137.96.74:6641",
  "http://ggzcmfnt:dtm8nm5zxsdm@198.23.243.226:6361",
  "http://ggzcmfnt:dtm8nm5zxsdm@38.154.185.97:6370",
  "http://ggzcmfnt:dtm8nm5zxsdm@142.111.67.146:5611",
  "http://ggzcmfnt:dtm8nm5zxsdm@191.96.254.138:6185"
];

export function getRandomProxy(): string {
  const randomIndex = Math.floor(Math.random() * proxies.length);
  return proxies[randomIndex];
}
