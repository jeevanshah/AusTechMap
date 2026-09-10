import { describe, expect, it } from "vitest";
import {
  isPrivateOrReservedIp,
  isPrivateOrReservedIPv4,
  isPrivateOrReservedIPv6,
  validateSafeUrl,
} from "./ssrf";

describe("SSRF Protection & IP Validation", () => {
  describe("isPrivateOrReservedIPv4", () => {
    it("identifies private and loopback IPv4 ranges", () => {
      expect(isPrivateOrReservedIPv4("127.0.0.1")).toBe(true);
      expect(isPrivateOrReservedIPv4("127.255.255.254")).toBe(true);
      expect(isPrivateOrReservedIPv4("10.0.0.1")).toBe(true);
      expect(isPrivateOrReservedIPv4("10.254.12.34")).toBe(true);
      expect(isPrivateOrReservedIPv4("172.16.0.1")).toBe(true);
      expect(isPrivateOrReservedIPv4("172.31.255.255")).toBe(true);
      expect(isPrivateOrReservedIPv4("192.168.1.1")).toBe(true);
      expect(isPrivateOrReservedIPv4("169.254.169.254")).toBe(true); // AWS/GCP metadata
      expect(isPrivateOrReservedIPv4("0.0.0.0")).toBe(true);
      expect(isPrivateOrReservedIPv4("224.0.0.1")).toBe(true); // multicast
      expect(isPrivateOrReservedIPv4("240.0.0.1")).toBe(true); // reserved
    });

    it("permits public routable IPv4 addresses", () => {
      expect(isPrivateOrReservedIPv4("1.1.1.1")).toBe(false);
      expect(isPrivateOrReservedIPv4("8.8.8.8")).toBe(false);
      expect(isPrivateOrReservedIPv4("13.236.0.1")).toBe(false);
      expect(isPrivateOrReservedIPv4("172.15.0.1")).toBe(false);
      expect(isPrivateOrReservedIPv4("172.32.0.1")).toBe(false);
    });
  });

  describe("isPrivateOrReservedIPv6", () => {
    it("identifies private and loopback IPv6 ranges", () => {
      expect(isPrivateOrReservedIPv6("::1")).toBe(true);
      expect(isPrivateOrReservedIPv6("::")).toBe(true);
      expect(isPrivateOrReservedIPv6("fc00::1")).toBe(true);
      expect(isPrivateOrReservedIPv6("fd12:3456:789a::1")).toBe(true);
      expect(isPrivateOrReservedIPv6("fe80::1")).toBe(true);
      expect(isPrivateOrReservedIPv6("::ffff:127.0.0.1")).toBe(true);
      expect(isPrivateOrReservedIPv6("::ffff:192.168.1.1")).toBe(true);
    });

    it("permits public routable IPv6 addresses", () => {
      expect(isPrivateOrReservedIPv6("2606:4700:4700::1111")).toBe(false);
      expect(isPrivateOrReservedIPv6("2001:4860:4860::8888")).toBe(false);
    });
  });

  describe("validateSafeUrl", () => {
    it("rejects non-http/https protocols", async () => {
      const fileRes = await validateSafeUrl("file:///etc/passwd");
      expect(fileRes.valid).toBe(false);
      expect(fileRes.reason).toContain("Unsupported protocol");

      const gopherRes = await validateSafeUrl("gopher://127.0.0.1/");
      expect(gopherRes.valid).toBe(false);
    });

    it("rejects loopback and cloud metadata hosts", async () => {
      const localhostRes = await validateSafeUrl("http://localhost:8080/admin");
      expect(localhostRes.valid).toBe(false);

      const metadataRes = await validateSafeUrl(
        "http://169.254.169.254/latest/meta-data/",
      );
      expect(metadataRes.valid).toBe(false);
      expect(metadataRes.reason).toContain(
        "private, loopback, or reserved range",
      );

      const googleMetaRes = await validateSafeUrl(
        "http://metadata.google.internal/computeMetadata/v1/",
      );
      expect(googleMetaRes.valid).toBe(false);
    });

    it("rejects private IP literals", async () => {
      const p1Res = await validateSafeUrl("http://10.0.0.5/internal");
      expect(p1Res.valid).toBe(false);

      const p2Res = await validateSafeUrl("http://192.168.0.1/router");
      expect(p2Res.valid).toBe(false);
    });

    it("permits public domains", async () => {
      const res = await validateSafeUrl("https://example.com");
      expect(res.valid).toBe(true);
      expect(res.resolvedIp).toBeDefined();
      expect(isPrivateOrReservedIp(res.resolvedIp!)).toBe(false);
    });
  });
});
