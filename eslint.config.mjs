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
  // Auth por página: era la mitad del delay de cada toque.
  // Layout (feedback 2, P4 — DESIGN-RULES §Layout): la página scrollea el DOCUMENTO. Nada de alturas de
  // viewport a mano, paneles con scroll propio ni `fixed`/`sticky` en className, salvo la allowlist de
  // abajo (fondo, overlays, header, tarjeta del penal y las primitivas Page/GameStage).
  // Van en el MISMO bloque: dos bloques con `no-restricted-syntax` sobre el mismo archivo se pisan.
  ...(() => {
    const getUser = {
      selector: "CallExpression[callee.property.name='getUser'][callee.object.property.name='auth']",
      message: "Usá getSession() de @/lib/supabase/session (valida el JWT local con getClaims).",
    };
    // El builder de PostgREST es perezoso: sin `.then()` no sale la request (lib/supabase/fire.ts).
    const lazyRpc = [
      { selector: "UnaryExpression[operator='void'] > CallExpression[callee.property.name='rpc']", message: "supabase.rpc() es perezoso: `void` no lo manda. Usá fire() de @/lib/supabase/fire o await." },
      { selector: "ExpressionStatement > CallExpression[callee.property.name='rpc']", message: "supabase.rpc() es perezoso: sin await/then no se manda. Usá fire() de @/lib/supabase/fire." },
    ];
    const layoutMsg = "Layout: la página scrollea el documento (DESIGN-RULES §Layout). Usá <Page>/<GameStage>.";
    const LAYOUT = "/(^|\\s|:)(h-dvh|h-screen|min-h-0|overflow-y-auto|overflow-y-scroll|fixed|sticky)(\\s|$)/";
    const layout = [
      { selector: `JSXAttribute[name.name='className'] Literal[value=${LAYOUT}]`, message: layoutMsg },
      { selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=${LAYOUT}]`, message: layoutMsg },
    ];
    const layoutAllow = [
      "components/ui/PitchBackground.tsx", // fondo decorativo (data-layer=bg)
      "components/penal/Confetti.tsx", // papelitos de fondo del campeón (data-layer=bg)
      "components/ui/ScreenHeader.tsx", // header sticky (data-layer=header)
      "components/ui/HelpSheet.tsx", // sheet/diálogo (overlay)
      "components/feedback/FeedbackButton.tsx", // botón flotante de reportes (data-layer=overlay)
      "components/penal/PenalLive.tsx", // tarjeta del penal: max-h + scroll propio (data-layer=card)
      "components/ui/Page.tsx",
      "components/ui/GameStage.tsx",
      "app/dev/**", // harness de desarrollo (404 en prod)
    ];
    // getUser: solo server (app/lib); en el cliente `auth.getUser()` es legítimo. Layout: app + components.
    return [
      {
        files: ["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
        ignores: layoutAllow,
        rules: { "no-restricted-syntax": ["error", getUser, ...lazyRpc, ...layout] },
      },
      {
        files: ["components/**/*.{ts,tsx}"],
        ignores: layoutAllow,
        rules: { "no-restricted-syntax": ["error", ...lazyRpc, ...layout] },
      },
      {
        files: layoutAllow.filter((f) => f.startsWith("components/")),
        rules: { "no-restricted-syntax": ["error", ...lazyRpc] },
      },
      {
        files: layoutAllow.filter((f) => f.startsWith("app/")),
        rules: { "no-restricted-syntax": ["error", getUser, ...lazyRpc] },
      },
    ];
  })(),
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
