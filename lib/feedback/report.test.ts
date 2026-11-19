import { describe, expect, it } from "vitest";
import {
  argentinaTime,
  buildReportEmail,
  escapeHtml,
  feedbackSubject,
  firstWords,
  parseFeedbackInput,
  parseUserAgent,
  reporterLabel,
  type FeedbackInput,
  type ReportContext,
} from "./report";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const WIN_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";
const LINUX_FF = "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0";

describe("asunto (formato fijo para el filtro de Gmail)", () => {
  it("es exactamente `[Tanda] Bug: …` / `[Tanda] Mejora: …`", () => {
    expect(feedbackSubject("bug", "No carga la sala")).toBe("[Tanda] Bug: No carga la sala");
    expect(feedbackSubject("idea", "Modo Copa Libertadores")).toBe("[Tanda] Mejora: Modo Copa Libertadores");
  });

  it("toma las primeras 8 palabras en una línea y marca el corte", () => {
    expect(firstWords("uno dos\ntres   cuatro cinco seis siete ocho nueve diez")).toBe(
      "uno dos tres cuatro cinco seis siete ocho…",
    );
    expect(firstWords("corto")).toBe("corto");
  });

  it("no pasa de 60 caracteres (palabras largas incluidas)", () => {
    const long = "a".repeat(200);
    expect([...firstWords(long)].length).toBe(61); // 60 + "…"
    const words = "palabrasbastantelargas ".repeat(6);
    expect(firstWords(words).length).toBeLessThanOrEqual(61);
    expect(firstWords(words).endsWith("…")).toBe(true);
  });
});

describe("parseFeedbackInput", () => {
  const base = { kind: "bug", message: "  Se colgó el penal  ", route: "/jugar", client: {} };

  it("acepta un reporte válido y limpia el mensaje", () => {
    const r = parseFeedbackInput(base);
    expect(r).toEqual({
      ok: true,
      value: { kind: "bug", message: "Se colgó el penal", route: "/jugar", client: { viewport: null, screen: null, lang: null, tz: null } },
    });
  });

  it("honeypot lleno → spam", () => {
    expect(parseFeedbackInput({ ...base, website: "http://spam" })).toEqual({ ok: false, error: "spam" });
  });

  it("valida tipo y largo (1000 máx., contado en caracteres)", () => {
    expect(parseFeedbackInput({ ...base, kind: "otro" })).toEqual({ ok: false, error: "invalid_kind" });
    expect(parseFeedbackInput({ ...base, message: " a " })).toEqual({ ok: false, error: "too_short" });
    expect(parseFeedbackInput({ ...base, message: "x".repeat(1001) })).toEqual({ ok: false, error: "too_long" });
    expect(parseFeedbackInput({ ...base, message: "⚽".repeat(1000) }).ok).toBe(true);
    expect(parseFeedbackInput(null)).toEqual({ ok: false, error: "bad_request" });
  });

  it("saca caracteres de control y descarta contexto raro", () => {
    const r = parseFeedbackInput({
      ...base,
      message: "hola\u0000\u0007 che\r\nchau",
      route: "javascript:alert(1)",
      client: { viewport: { w: 390, h: 844 }, screen: { w: 390, h: 844, dpr: 3 }, lang: "<script>", tz: "America/Argentina/Buenos_Aires" },
    });
    expect(r.ok && r.value.message).toBe("hola che\nchau");
    expect(r.ok && r.value.route).toBeNull();
    expect(r.ok && r.value.client).toEqual({
      viewport: { w: 390, h: 844 },
      screen: { w: 390, h: 844, dpr: 3 },
      lang: null,
      tz: "America/Argentina/Buenos_Aires",
    });
  });
});

describe("user agent", () => {
  it("lee dispositivo, SO y navegador", () => {
    expect(parseUserAgent(IPHONE)).toEqual({ device: "Celular", os: "iOS 17.4", browser: "Safari 17.4" });
    expect(parseUserAgent(ANDROID)).toEqual({ device: "Celular", os: "Android 14", browser: "Chrome 131.0" });
    expect(parseUserAgent(WIN_EDGE)).toEqual({ device: "Computadora", os: "Windows", browser: "Edge 131.0" });
    expect(parseUserAgent(LINUX_FF)).toEqual({ device: "Computadora", os: "Linux", browser: "Firefox 133.0" });
    expect(parseUserAgent(null)).toEqual({ device: "Computadora", os: "Desconocido", browser: "Desconocido" });
  });
});

describe("mail del reporte", () => {
  const input: FeedbackInput = {
    kind: "bug",
    message: `<img src=x onerror="alert(1)"> & se rompió`,
    route: "/perfil",
    client: { viewport: { w: 390, h: 844 }, screen: { w: 390, h: 844, dpr: 3 }, lang: "es-AR", tz: "America/Argentina/Buenos_Aires" },
  };
  const ctx: ReportContext = {
    reportId: "r-1",
    userId: "u-1",
    username: "pepe",
    isGuest: false,
    createdAt: new Date("2026-11-19T21:42:05Z"),
    userAgent: IPHONE,
    version: "abcdef1234567",
    activeTournament: { id: "t-1", mode: "arg" },
  };

  it("escapa el HTML del mensaje", () => {
    const { html } = buildReportEmail(input, ctx);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; se rompió");
    expect(escapeHtml(`<a href='x'>`)).toBe("&lt;a href=&#39;x&#39;&gt;");
  });

  it("trae lo necesario para reproducir, en hora argentina", () => {
    const { html, subject } = buildReportEmail(input, ctx);
    expect(subject.startsWith("[Tanda] Bug: ")).toBe(true);
    for (const s of ["pepe", "u-1", "/perfil", "Celular · iOS 17.4 · Safari 17.4", "390×844", "@3x", "es-AR", "arg · t-1", "abcdef1", "r-1"]) {
      expect(html).toContain(escapeHtml(s));
    }
    expect(argentinaTime(ctx.createdAt)).toContain("18:42:05");
    expect(html).toContain("18:42:05");
  });

  it("sin datos sensibles: ni mail ni tokens", () => {
    const { html } = buildReportEmail(input, ctx);
    expect(html).not.toMatch(/@[a-z0-9-]+\.[a-z]/i);
    expect(html.toLowerCase()).not.toMatch(/token|bearer|password/);
  });

  it("nombra al que reporta (o Invitado)", () => {
    expect(reporterLabel({ userId: "u", username: "pepe", isGuest: false })).toBe("pepe");
    expect(reporterLabel({ userId: "u", username: "INVITADO_1", isGuest: true })).toBe("Invitado");
    expect(reporterLabel({ userId: null, username: null, isGuest: false })).toBe("Invitado (sin sesión)");
  });
});
