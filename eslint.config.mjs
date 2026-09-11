// Flat-config ESLint (ESLint 9). Replaces the `next lint` command, which Next 16
// removed — see https://nextjs.org/docs/app/api-reference/cli/next#next-lint.
//
// `eslint-config-next` ships a native flat-config array (its `core-web-vitals`
// export is the stricter preset `next lint` applied by default), so it drops
// straight into a flat config with no @eslint/eslintrc FlatCompat shim.
//
// This is a `.mjs` file on purpose: the package has no "type": "module", so a
// plain eslint.config.js would be parsed as CommonJS and reject `import`.
import next from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    // Generated output and vendored types — never lint these.
    ignores: [
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
      "node_modules/**",
      "next-env.d.ts",
      "cloudflare-env.d.ts",
    ],
  },
  ...next,

  // eslint-plugin-react-hooks v6 (bundled by Next 16) ships the React Compiler
  // rule set at "error". These flag idiomatic-but-discouraged patterns (a
  // one-shot guarded effect that setState()s, a Date.now() read in render for a
  // countdown), not bugs. Keep them visible as warnings; adopting them as hard
  // errors is a deliberate migration of its own, out of scope for restoring the
  // lint gate.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },

  // Cloudflare Workers require `export default { fetch/scheduled }` — the
  // anonymous default object is the platform's entrypoint contract, not a smell.
  {
    files: ["workers/**/*.ts"],
    rules: { "import/no-anonymous-default-export": "off" },
  },

  // This flat-config file legitimately default-exports an anonymous array.
  {
    files: ["eslint.config.mjs"],
    rules: { "import/no-anonymous-default-export": "off" },
  },
];
