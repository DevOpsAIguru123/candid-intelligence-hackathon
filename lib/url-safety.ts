import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface LookupAddress {
  address: string;
  family: number;
}

export type LookupFn = (hostname: string) => Promise<LookupAddress[]>;

const PUBLIC_URL_ERROR = "Only public HTTP(S) conference URLs are allowed";

function cleanAddress(address: string): string {
  return address.replace(/^\[|\]$/g, "").toLowerCase();
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = cleanAddress(address);
  const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    (mappedIpv4 ? isPrivateIpv4(mappedIpv4) : false)
  );
}

function isPrivateAddress(address: string): boolean {
  const normalized = cleanAddress(address);
  const family = isIP(normalized);
  return family === 4 ? isPrivateIpv4(normalized) : family === 6 ? isPrivateIpv6(normalized) : true;
}

const defaultLookup: LookupFn = async (hostname) =>
  dnsLookup(hostname, { all: true, verbatim: true });

export async function assertPublicHttpUrl(
  rawUrl: string,
  lookup: LookupFn = defaultLookup,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(PUBLIC_URL_ERROR);
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !url.hostname ||
    url.hostname.toLowerCase() === "localhost" ||
    url.hostname.toLowerCase().endsWith(".localhost") ||
    url.hostname.toLowerCase().endsWith(".local")
  ) {
    throw new Error(PUBLIC_URL_ERROR);
  }

  const hostname = cleanAddress(url.hostname);
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname);

  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error(PUBLIC_URL_ERROR);
  }

  return url;
}
