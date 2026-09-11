import { pathToFileURL } from "node:url";

const REQUEST_TIMEOUT_MS = 15_000;

export const SMOKE_CHECKS = Object.freeze([
  { path: "/", contentType: "text/html" },
  { path: "/jobs", contentType: "text/html" },
  { path: "/methodology", contentType: "text/html" },
  {
    path: "/api/health?deep=true",
    contentType: "application/json",
    verify: async (response) => {
      const body = await response.json();
      if (body.service !== "web" || body.status !== "ok") {
        throw new Error("health response was not healthy");
      }
      if (body.diagnostics?.database !== "connected") {
        throw new Error(
          "health response did not confirm database connectivity",
        );
      }
    },
  },
  { path: "/api/regions", contentType: "application/json" },
]);

export function normaliseBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("base URL must use HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("base URL must not contain credentials");
  }
  if (url.search || url.hash) {
    throw new Error("base URL must not contain a query or fragment");
  }
  return url.origin;
}

export async function checkEndpoint(check, baseUrl, fetchImpl = fetch) {
  const url = new URL(check.path, baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      headers: { Accept: check.contentType },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`${check.path} returned HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes(check.contentType)) {
      throw new Error(
        `${check.path} returned unexpected content type: ${contentType || "none"}`,
      );
    }
    if (check.verify) {
      await check.verify(response.clone());
    }
    return { path: check.path, status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runLaunchSmoke(baseUrl, fetchImpl = fetch) {
  const normalisedBaseUrl = normaliseBaseUrl(baseUrl);
  const results = [];
  for (const check of SMOKE_CHECKS) {
    results.push(await checkEndpoint(check, normalisedBaseUrl, fetchImpl));
  }
  return { baseUrl: normalisedBaseUrl, results };
}

async function main() {
  const baseUrl = process.argv[2];
  if (!baseUrl) {
    throw new Error(
      "Usage: node apps/web/scripts/launch-smoke.mjs <https://deployment-url>",
    );
  }
  const result = await runLaunchSmoke(baseUrl);
  for (const check of result.results) {
    console.log(`PASS ${check.status} ${check.path}`);
  }
  console.log(`Launch smoke passed for ${result.baseUrl}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      `Launch smoke failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
