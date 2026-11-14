import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Args/vars con prefijo `_` se ignoran (convención para parámetros intencionalmente sin uso,
  // p. ej. firmas de stubs que se implementan en una fase posterior).
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Navegación (feedback 14/11): todo pasa por `useNav()` (transición + pending + salir sin esperar).
  // `useRouter` directo es lo que dejaba botones "colgados" esperando un RPC antes de navegar.
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["lib/nav/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/navigation",
              importNames: ["useRouter"],
              message: "Usá useNav() de @/lib/nav/useNav (transición, pending y salidas sin esperar).",
            },
          ],
        },
      ],
    },
  },
  // Sesión en el server: solo vía getSession() (getClaims local). `auth.getUser()` es una ida de red a
  // Auth por página: era la mitad del delay de cada toque (docs/PERF-BASELINE.md).
  {
    files: ["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='getUser'][callee.object.property.name='auth']",
          message: "Usá getSession() de @/lib/supabase/session (valida el JWT local con getClaims).",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
