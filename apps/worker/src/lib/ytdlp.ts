import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { resolve } from "node:path";

/** Build yt-dlp auth args from a cookie jar stored outside the source tree. */
export async function getYtDlpCookieArgs(): Promise<string[]> {
  const configuredPath = process.env.YTDLP_COOKIES_FILE?.trim();
  if (!configuredPath) return [];

  const cookiePath = resolve(configuredPath);
  try {
    await access(cookiePath, constants.R_OK);
    if (!(await stat(cookiePath)).isFile()) throw new Error("Cookie path is not a file");
  } catch {
    throw new Error("YTDLP_COOKIES_FILE is set, but the worker cannot read that file.");
  }

  return ["--cookies", cookiePath];
}
