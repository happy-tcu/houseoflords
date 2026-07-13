// Web Audio helper — synthesises beeps + an obnoxious end-of-time alarm.

let ctx = null
function getCtx() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext
    if (!C) return null
    ctx = new C()
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

export function beep({ freq = 800, dur = 200, repeat = 1, gap = 120, type = 'sine', gain = 0.35 } = {}) {
  const c = getCtx()
  if (!c) return
  const t0 = c.currentTime
  for (let i = 0; i < repeat; i++) {
    const start = t0 + i * (dur + gap) / 1000
    const stop  = start + dur / 1000
    const osc = c.createOscillator()
    const gn  = c.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, start)
    gn.gain.setValueAtTime(0.0001, start)
    gn.gain.exponentialRampToValueAtTime(gain, start + 0.008)
    gn.gain.exponentialRampToValueAtTime(0.0001, stop)
    osc.connect(gn); gn.connect(c.destination)
    osc.start(start); osc.stop(stop)
  }
}

// Loud, obnoxious siren: alternating high-low square-wave squawks for ~4s.
// Two oscillators layered so it sounds thicker.
export function alarm({ cycles = 12, hi = 1400, lo = 900, dur = 160, gap = 40 } = {}) {
  const c = getCtx()
  if (!c) return
  const t0 = c.currentTime
  for (let i = 0; i < cycles; i++) {
    const start = t0 + i * (dur + gap) / 1000
    const stop  = start + dur / 1000
    const target = i % 2 === 0 ? hi : lo
    ;[target, target * 1.005].forEach((f, layerIdx) => {
      const osc = c.createOscillator()
      const gn  = c.createGain()
      osc.type = layerIdx === 0 ? 'square' : 'sawtooth'
      osc.frequency.setValueAtTime(f, start)
      gn.gain.setValueAtTime(0.0001, start)
      gn.gain.exponentialRampToValueAtTime(0.55, start + 0.006)
      gn.gain.exponentialRampToValueAtTime(0.0001, stop)
      osc.connect(gn); gn.connect(c.destination)
      osc.start(start); osc.stop(stop)
    })
  }
}

// Audio contexts need a user gesture to unlock — attach once.
if (typeof window !== 'undefined') {
  const unlock = () => {
    getCtx()
    window.removeEventListener('click', unlock)
    window.removeEventListener('touchstart', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('click', unlock)
  window.addEventListener('touchstart', unlock)
  window.addEventListener('keydown', unlock)
}
