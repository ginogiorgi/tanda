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
  //
  // Cliente de Supabase del browser (F4, presupuesto de JS): ~66 KB gz. Solo lo importan directo las
  // pantallas de JUEGO (realtime al montar); el resto lo baja al tocar con `browserClient()`
  // (@/lib/supabase/lazy). Va en el mismo bloque porque dos bloques con `no-restricted-imports` se pisan.
  ...(() => {
    const useRouterPath = {
      name: "next/navigation",
      importNames: ["useRouter"],
      message: "Usá useNav() de @/lib/nav/useNav (transición, pending y salidas sin esperar).",
    };
    const eagerClientPath = {
      name: "@/lib/supabase/client",
      message:
        "Fuera de las pantallas de juego usá browserClient() de @/lib/supabase/lazy (se baja al tocar, no en la carga).",
    };
    const gameClient = ["components/penal/**", "components/ranked/**", "components/lobby/Lobby.tsx", "lib/supabase/**"];
    return [
      {
        files: ["**/*.{ts,tsx}"],
        ignores: ["lib/nav/**", ...gameClient],
        rules: { "no-restricted-imports": ["error", { paths: [useRouterPath, eagerClientPath] }] },
      },
      {
        files: gameClient,
        ignores: ["lib/nav/**"],
        rules: { "no-restricted-imports": ["error", { paths: [useRouterPath] }] },
      },
    ];
  })(),
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
