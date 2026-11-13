import { z } from "zod";

/**
 * Catálogo de referencia (preguntas + equipos) versionado en `data/`. Es la fuente de verdad: el
 * script `scripts/catalog/build-seed.ts` lo valida con estos schemas y genera la migración de seed.
 * Nunca se edita el SQL de seed a mano.
 */

export const DIFFICULTIES = ["easy", "medium", "hard", "very_hard"] as const;
export const TIERS = ["elite", "high", "medium", "low"] as const;

const hex = z.string().regex(/^#[0-9a-f]{6}$/i, "color #rrggbb");

export const questionSchema = z
  .object({
    key: z.string().regex(/^[a-z]{2,3}-\d{3,4}$/, "key tipo wc-001 / ar-001"),
    category: z.string().min(2),
    difficulty: z.enum(DIFFICULTIES),
    prompt: z.string().min(10).max(160),
    options: z.tuple([z.string().min(1).max(60), z.string().min(1).max(60), z.string().min(1).max(60)]),
    answer: z.number().int().min(0).max(2),
  })
  .strict()
  .refine((q) => new Set(q.options.map((o) => o.trim().toLowerCase())).size === 3, {
    message: "opciones repetidas",
  });

export const nationSchema = z
  .object({
    code: z.string().regex(/^[A-Z]{3}$/),
    name: z.string().min(2),
    fifa_rank: z.number().int().positive(),
    difficulty_tier: z.enum(TIERS),
    accent_color: hex,
    flag_asset: z.string().min(2),
    kit_primary: hex,
    kit_secondary: hex.nullable(),
  })
  .strict();
