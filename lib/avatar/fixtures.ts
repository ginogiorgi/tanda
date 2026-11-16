// Fixtures de tests (unit + db) del avatar v2.

/** Las 3 formas de avatar que había en prod (dump de solo lectura, 16/11: 14 + 1 + 1 perfiles). */
export const PROD_V1 = [
  {
    top: { part: "tee", color: "#e63946" },
    hair: { part: "short", color: "#1d1d1d" },
    shoes: { part: "sneakers", color: "#f1f1f1" },
    bottom: { part: "shorts", color: "#264653" },
    bodyType: "male",
  },
  {
    top: { part: "tank", color: "#e63946" },
    hair: { part: "bun", color: "#1d1d1d" },
    shoes: { part: "boots", color: "#f1f1f1" },
    bottom: { part: "pants", color: "#264653" },
    bodyType: "male",
  },
  {
    top: { part: "tank", color: "#e63946" },
    hair: { part: "long", color: "#8d5524" },
    shoes: { part: "cleats", color: "#8d5524" },
    bottom: { part: "joggers", color: "#8d5524" },
    bodyType: "male",
  },
] as const;
