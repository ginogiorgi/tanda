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

/**
 * Resultado A FAVOR del jugador (10.8): tu equipo metió o atajó. Repique ascendente + ráfaga de
 * multitud (festejo). Es el sonido "bueno" desde la perspectiva del jugador, sin importar si el
 * evento físico fue gol o atajada.
 */
export function playGood(): void {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => tone(c, f, t + i * 0.09, 0.22, "sawtooth", 0.12));
  noise(c, t + 0.1, 0.7, 1800, 0.14); // multitud festejando
}

/**
 * Resultado EN CONTRA del jugador (10.8): metió o atajó el rival. Tonos descendentes + golpe grave
 * (decepción). Es el sonido "malo" desde tu perspectiva.
 */
export function playBad(): void {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  [392, 330, 262].forEach((f, i) => tone(c, f, t + i * 0.11, 0.26, "triangle", 0.12));
  tone(c, 110, t + 0.05, 0.3, "square", 0.16); // golpe grave
  noise(c, t, 0.2, 500, 0.1);
}
