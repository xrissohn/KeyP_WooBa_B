import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

export async function fetchJson<T>(url: URL | string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
    headers: { accept: "application/json", ...init.headers },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}: ${body.slice(0, 300)}`);
  }
  return response.json() as Promise<T>;
}

function isPrivateIp(address: string): boolean {
  if (address === "::1" || address === "0:0:0:0:0:0:0:1") return true;
  if (address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:")) return true;
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mapped) return isPrivateIp(mapped);
  if (isIP(address) !== 4) return false;
  const [a = 0, b = 0] = address.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

async function assertPublicUrl(url: URL): Promise<void> {
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Only HTTP(S) feed URLs are allowed");
  if (url.username || url.password) throw new Error("Feed URL credentials are not allowed");
  if (["localhost", "localhost.localdomain"].includes(url.hostname.toLowerCase())) {
    throw new Error("Private feed hosts are not allowed");
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error("Feed host resolves to a private or unsupported address");
  }
}

export async function safeFetchText(input: string, redirects = 0): Promise<string> {
  if (redirects > 3) throw new Error("Too many feed redirects");
  const url = new URL(input);
  await assertPublicUrl(url);
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    headers: {
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
      "user-agent": "InterestRadarBot/0.1 (+feed polling)",
    },
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    if (!location) throw new Error("Feed redirect has no location");
    return safeFetchText(new URL(location, url).toString(), redirects + 1);
  }
  if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 5_000_000) throw new Error("Feed exceeds 5 MB");
  const body = await response.text();
  if (body.length > 5_000_000) throw new Error("Feed exceeds 5 MB");
  return body;
}
