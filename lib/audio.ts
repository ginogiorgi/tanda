/**
 * Audio del juego (8.7) — SINTETIZADO con Web Audio API (sin assets externos, coherente con
 * "assets originales", SPEC §8.2). Silbato al abrir el penal, repique de gol y golpe de atajada.
 *
 * El navegador exige un gesto del usuario para arrancar el AudioContext: se llama `unlockAudio()`
 * en el primer toque (p. ej. al elegir opción). El mute se persiste con `lib/prefs`.
 *
 * Singleton de módulo (browser-only; en SSR los métodos son no-op).
 */

let ctx: AudioContext | null = null;
let muted = false;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/** Debe llamarse desde un handler de gesto (tap/click) para habilitar el audio. */
export function unlockAudio(): void {
  const c = ensureCtx();
  if (c && c.state === "suspended") void c.resume();
}

export function setMuted(m: boolean): void {
  muted = m;
}

/** Tono simple con envolvente (attack/decay) entre `start` y `start+dur`. */
function tone(
  c: AudioContext,
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType,
  peak: number,
): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/** Ráfaga de ruido (multitud/golpe) filtrada paso-bajo. */
function noise(c: AudioContext, start: number, dur: number, cutoff: number, peak: number): void {
  const frames = Math.floor(c.sampleRate * dur);
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  const gain = c.createGain();
  gain.gain.setValueAtTime(peak, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(gain).connect(c.destination);
  src.start(start);
  src.stop(start + dur);
}

function ready(): AudioContext | null {
  if (muted) return null;
  const c = ensureCtx();
  if (!c || c.state !== "running") return null;
  return c;
}

/** Silbato del árbitro: tono agudo con vibrato corto. */
export function playWhistle(): void {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  tone(c, 2100, t, 0.18, "triangle", 0.18);
  tone(c, 2350, t + 0.06, 0.16, "triangle", 0.16);
}

/** Gol: repique ascendente + ráfaga de multitud. */
export function playGoal(): void {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => tone(c, f, t + i * 0.09, 0.22, "sawtooth", 0.12));
  noise(c, t + 0.1, 0.7, 1800, 0.14); // multitud
}

/** Atajada: golpe seco grave + un toque de ruido. */
export function playSave(): void {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  tone(c, 150, t, 0.16, "square", 0.2);
  noise(c, t, 0.18, 600, 0.18);
}
