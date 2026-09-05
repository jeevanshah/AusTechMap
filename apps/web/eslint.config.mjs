import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    "coverage/**",
    "next-env.d.ts",
    // Verbatim copies of maplibre-gl's own dist chunks (see MapCanvas.tsx),
    // not project source -- linting minified vendor code is meaningless.
    "public/maplibre-gl-*.mjs",
  ]),
]);
