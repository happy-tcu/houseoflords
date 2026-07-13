// Tiny audio helper — synthesises beeps via Web Audio, no assets needed.

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

export function beep({ freq = 800, dur = 200, repeat = 1, gap = 120 } = {}) {
  const c = getCtx()
  if (!c) return
  const t0 = c.currentTime
  for (let i = 0; i < repeat; i++) {
    const start = t0 + i * (dur + gap) / 1000
    const stop  = start + dur / 1000
    const osc = c.createOscillator()
    const gn  = c.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, start)
    gn.gain.setValueAtTime(0.0001, start)
    gn.gain.exponentialRampToValueAtTime(0.35, start + 0.01)
    gn.gain.exponentialRampToValueAtTime(0.0001, stop)
    osc.connect(gn); gn.connect(c.destination)
    osc.start(start); osc.stop(stop)
  }
}

// Some browsers need a user gesture before allowing audio.
// Attach to first click/tap so beeps work throughout the session.
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
