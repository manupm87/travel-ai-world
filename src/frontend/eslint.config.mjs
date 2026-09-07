import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // Project rules (see src/frontend/AGENTS.md): the network and the mocks are
  // reached only through src/services/, generated types only through
  // src/services/ and src/types/, and imports come first in a module.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message: "Network calls live in src/services/ only. Call a service function.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/mocks/*"],
              message: "Fixtures are read by src/services/ only.",
            },
            {
              group: ["@/types/generated/*"],
              message:
                "Import generated contract types only from src/services/ or src/types/.",
            },
          ],
        },
      ],
      "import/first": "error",
      "no-console": "warn",
    },
  },
  {
    files: ["src/services/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": "off",
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["src/types/**/*.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]);

export default eslintConfig;
