// Original ambient drone synthesized with Web Audio; nothing is downloaded.
let ctx: AudioContext | null = null;
let on = false;
let gain: GainNode | null = null;
export function toggleSound(): boolean {
  if (!ctx) {
    ctx = new AudioContext();
    gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination);
    for (const [f, type] of [[110, 'sine'], [164.8, 'triangle'], [220.5, 'sine']] as const) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05 + f / 4000;
      const lg = ctx.createGain(); lg.gain.value = 0.015; lfo.connect(lg);
      const g = ctx.createGain(); g.gain.value = 0.02; lg.connect(g.gain);
      o.connect(g); g.connect(gain); o.start(); lfo.start();
    }
  }
  on = !on;
  void ctx.resume();
  gain!.gain.setTargetAtTime(on ? 0.6 : 0, ctx.currentTime, 0.4);
  return on;
}
