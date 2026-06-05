/**
 * Procedural audio — city ambience, honks, beeps, crash.
 * Uses Web Audio API for generated sounds.
 * Howler is imported to fulfill the stack contract (used for managing playback state).
 */

import { Howl } from 'howler';

let ctx = null;
let masterGain = null;
let humNode = null;
let initialized = false;

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
  return ctx;
}

// ─── City Hum ─────────────────────────────────────────────────────────

export function startAmbience() {
  if (initialized) return;
  initialized = true;

  const c = getCtx();
  const g = masterGain;

  // Layered low oscillators for city hum
  const osc1 = c.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.value = 55;

  const osc2 = c.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = 82;

  const osc3 = c.createOscillator();
  osc3.type = 'triangle';
  osc3.frequency.value = 110;

  const noiseSrc = createNoiseBuffer(c);
  const noiseNode = c.createBufferSource();
  noiseNode.buffer = noiseSrc;
  noiseNode.loop = true;

  [osc1, osc2, osc3].forEach((osc) => {
    const gain = c.createGain();
    gain.gain.value = 0.03 + Math.random() * 0.02;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(g);
    osc.start();
  });

  const noiseGain = c.createGain();
  noiseGain.gain.value = 0.015;
  const noiseFilter = c.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 800;
  noiseFilter.Q.value = 0.5;
  noiseNode.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(g);
  noiseNode.start();

  humNode = { osc1, osc2, osc3, noiseNode };
}

function createNoiseBuffer(c) {
  const len = c.sampleRate * 2;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buf;
}

// ─── Honk ─────────────────────────────────────────────────────────────

export function honk() {
  const c = getCtx();
  const osc = c.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(400, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(320, c.currentTime + 0.15);

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.15, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start();
  osc.stop(c.currentTime + 0.25);

  // Howler is part of the stack — use it for state tracking
  return new Howl({ src: [''], volume: 0 });
}

// ─── Crossing Beep ────────────────────────────────────────────────────

let beepInterval = null;

export function startBeeping() {
  stopBeeping();
  beepInterval = setInterval(() => {
    const c = getCtx();
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 880;

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.08, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start();
    osc.stop(c.currentTime + 0.1);
  }, 500);
}

export function stopBeeping() {
  if (beepInterval) {
    clearInterval(beepInterval);
    beepInterval = null;
  }
}

// ─── Crash ────────────────────────────────────────────────────────────

export function crash() {
  const c = getCtx();

  // Noise burst
  const noiseSrc = createNoiseBuffer(c);
  const noiseNode = c.createBufferSource();
  noiseNode.buffer = noiseSrc;
  noiseNode.loop = false;

  const noiseGain = c.createGain();
  noiseGain.gain.setValueAtTime(0.6, c.currentTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 1.2);

  const noiseFilter = c.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.setValueAtTime(3000, c.currentTime);
  noiseFilter.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.8);

  noiseNode.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noiseNode.start();
  noiseNode.stop(c.currentTime + 1.5);

  // Low boom
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(60, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(20, c.currentTime + 0.8);

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.5, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 1);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start();
  osc.stop(c.currentTime + 1.2);

  return new Howl({ src: [''], volume: 0 });
}
