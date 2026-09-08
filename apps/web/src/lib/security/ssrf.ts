import dns from "node:dns/promises";
import net from "node:net";

export const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

export const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "::",
  "metadata.google.internal",
  "instance-data",
]);

/**
 * Checks whether an IPv4 address belongs to a private, loopback, link-local,
 * or reserved range.
 */
export function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // invalid format treated as unsafe
  }

  const a = parts[0];
  const b = parts[1];
  if (a === undefined || b === undefined) return true;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;

  // 10.0.0.0/8 (Private network)
  if (a === 10) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link-local & cloud metadata, e.g. 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private network: 172.16.x.x - 172.31.x.x)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 (Private network)
  if (a === 192 && b === 168) return true;

  // 224.0.0.0/4 (Multicast)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reserved / Future use)
  if (a >= 240) return true;

  return false;
}

/**
 * Checks whether an IPv6 address belongs to loopback, unique local (fc00::/7),
 * link-local (fe80::/10), or IPv4-mapped address.
 */
export function isPrivateOrReservedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  if (lower === "::" || lower === "::1") return true;

  // IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (lower.startsWith("::ffff:")) {
    const v4Part = lower.slice(7);
    if (net.isIPv4(v4Part)) {
      return isPrivateOrReservedIPv4(v4Part);
    }
    return true;
  }

  // Unique local addresses (fc00::/7 -> fc.. or fd..)
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;

  // Link-local addresses (fe80::/10 -> fe8, fe9, fea, feb)
  if (
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  ) {
    return true;
  }

  // Multicast (ff00::/8)
  if (lower.startsWith("ff")) return true;

  return false;
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateOrReservedIPv4(ip);
  if (family === 6) return isPrivateOrReservedIPv6(ip);
  return true;
}

export interface UrlValidationResult {
  valid: boolean;
  reason?: string;
  resolvedIp?: string;
}

/**
 * Validates a URL for server-side egress / SSRF safety.
 * Restricts protocols to http/https, blocks reserved/cloud-metadata hosts,
 * and resolves DNS to guarantee the destination IP is public and safe.
 */
export async function validateSafeUrl(
  urlString: string,
): Promise<UrlValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, reason: "Malformed URL" };
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return {
      valid: false,
      reason: `Unsupported protocol ${parsed.protocol} (only http and https permitted)`,
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (!hostname || BLOCKED_HOSTS.has(hostname)) {
    return {
      valid: false,
      reason: `Blocked destination host ${hostname}`,
    };
  }

  // If the hostname is already an IP literal
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      return {
        valid: false,
        reason: `Target IP ${hostname} is in a private, loopback, or reserved range`,
      };
    }
    return { valid: true, resolvedIp: hostname };
  }

  // Resolve hostname via DNS
  try {
    const lookupResult = await dns.lookup(hostname, { all: true });
    if (!lookupResult || lookupResult.length === 0) {
      return { valid: false, reason: `DNS lookup failed for ${hostname}` };
    }

    for (const record of lookupResult) {
      if (isPrivateOrReservedIp(record.address)) {
        return {
          valid: false,
          reason: `Resolved IP ${record.address} for host ${hostname} is in a private, loopback, or reserved range`,
          resolvedIp: record.address,
        };
      }
    }

    const firstRecord = lookupResult[0];
    return { valid: true, resolvedIp: firstRecord ? firstRecord.address : undefined };
  } catch (err) {
    return {
      valid: false,
      reason: `DNS resolution error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
