import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const suppressEmail = vi.fn();
vi.mock("../../../lib/db", () => ({ getPool: () => ({}) }));
vi.mock("../../../lib/queries/emailSuppressions", () => ({
  suppressEmail: (...args: unknown[]) => suppressEmail(...args),
}));

import { createUnsubscribeToken } from "../../../lib/retention/unsubscribeToken";
import { POST } from "./route";

const SECRET = "test-secret-value-that-is-long-enough";

function post(token: string | null, body = ""): Request {
  const url = new URL("https://app.example.test/api/unsubscribe");
  if (token !== null) url.searchParams.set("t", token);
  return new Request(url, { method: "POST", body });
}

describe("POST /api/unsubscribe", () => {
  beforeEach(() => {
    suppressEmail.mockReset().mockResolvedValue(undefined);
    vi.stubEnv("AUTH_SECRET", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a missing or forged token without touching the database", async () => {
    expect((await POST(post(null))).status).toBe(400);
    expect((await POST(post("1.forged"))).status).toBe(400);
    expect(
      (await POST(post(createUnsubscribeToken(5, "another-secret")))).status,
    ).toBe(400);
    expect(suppressEmail).not.toHaveBeenCalled();
  });

  it("rejects everything when the deployment has no signing secret", async () => {
    const token = createUnsubscribeToken(5, SECRET);
    vi.stubEnv("AUTH_SECRET", "");
    expect((await POST(post(token))).status).toBe(400);
    expect(suppressEmail).not.toHaveBeenCalled();
  });

  it("answers a mail client's one-click POST with 200 and suppresses the user", async () => {
    const response = await POST(
      post(createUnsubscribeToken(5, SECRET), "List-Unsubscribe=One-Click"),
    );
    expect(response.status).toBe(200);
    expect(suppressEmail).toHaveBeenCalledWith({}, 5, "unsubscribed");
  });

  it("redirects a form submit back to the confirmation page", async () => {
    const response = await POST(post(createUnsubscribeToken(5, SECRET)));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/unsubscribe?done=1");
    expect(suppressEmail).toHaveBeenCalledWith({}, 5, "unsubscribed");
  });

  it("reports a server error when the write fails, without leaking details", async () => {
    suppressEmail.mockRejectedValue(new Error("connection string leaked"));
    const response = await POST(post(createUnsubscribeToken(5, SECRET)));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("leaked");
  });
});
