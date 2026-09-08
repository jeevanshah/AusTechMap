import { describe, expect, it } from "vitest";
import { renderDigestHtml } from "./digestSender";
import type { DigestItem } from "@austechmap/contracts";

describe("Phase 7 Retention Pipeline & Digest Engine", () => {
  const sampleItems: DigestItem[] = [
    {
      title: "Atlassian posted 3 new roles",
      description: "Senior Fullstack Engineer, Data Engineer in Sydney",
      link: "/companies/atlassian",
      badge: "Watched Company",
    },
    {
      title: "Canva added visa sponsorship evidence",
      description: "Approved Labour Agreement (Skilled Refugee Pilot)",
      link: "/companies/canva",
      badge: "Sponsorship Evidence",
    },
  ];

  it("renders well-formed HTML email digest with Crisp Slate styling", () => {
    const html = renderDigestHtml({
      frequency: "weekly",
      items: sampleItems,
      unsubscribeUrl: "https://austechmap.com.au/account?tab=preferences",
      appUrl: "https://austechmap.com.au",
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Weekly Australian Tech Opportunity Digest");
    expect(html).toContain("Atlassian posted 3 new roles");
    expect(html).toContain("Canva added visa sponsorship evidence");
    expect(html).toContain("https://austechmap.com.au/account?tab=preferences");
    expect(html).toContain("#c2410c"); // Terracotta accent color
    expect(html).toContain("#0f172a"); // Navy ink header
  });

  it("renders daily digest variant correctly", () => {
    const html = renderDigestHtml({
      frequency: "daily",
      items: sampleItems,
      unsubscribeUrl: "https://austechmap.com.au/account?tab=preferences",
      appUrl: "https://austechmap.com.au",
    });

    expect(html).toContain("Daily Australian Tech Opportunity Digest");
  });
});
