// ESLint "flat config": one file at the repo root lints every workspace.
// Each entry in the array applies rules to the files it matches; later entries
// override earlier ones.
import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  // Never lint generated or installed code.
  globalIgnores(["**/dist/**", "**/coverage/**", "**/node_modules/**"]),

  // ESLint's own recommended rules for all JavaScript (catches typos,
  // unreachable code, etc.).
  js.configs.recommended,

  // TypeScript rules that use real type information. Slower than syntax-only
  // linting, but catches bugs like a forgotten `await` on a Promise
  // (no-floating-promises), which matters for the server and sockets.
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Let typescript-eslint find the nearest tsconfig.json for each file.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Still flag unused variables, but allow two deliberate patterns:
      // - names starting with "_" mean "intentionally unused" (e.g. `_req`)
      // - `const { removed, ...rest } = obj` is the idiom for dropping a field
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // Plain .js config files (like this one) aren't part of any tsconfig, so
  // switch off the rules that need type information for them.
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Node globals (process, console...) for the server and root config files.
  {
    files: ["apps/server/**/*.ts", "*.js"],
    languageOptions: { globals: globals.node },
  },

  // Browser globals (window, document...) plus React rules for the web app:
  // - react-hooks: "don't call hooks inside an if", "list every dependency
  //   your effect uses", and similar.
  // - react-refresh: component files should export only components, or
  //   Vite's Fast Refresh can't hot-swap them and falls back to a full reload.
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },

  // Must be last: turns off any formatting rules that would fight Prettier.
  // ESLint finds bugs; Prettier owns formatting.
  prettierConfig,
);
