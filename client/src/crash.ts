// When something breaks mid-play: a card in the game's own voice, never a frozen frame
// or a stack trace. The save is not written from a state that just failed (the last good
// one stays), "Wake again" reloads from it, and the details can be copied for a report.

export interface CrashInfo {
  message: string
  stack: string
  where: string
}

let shown = false
let onCrash: (() => void) | null = null

/** Called once, the first time something breaks (main stops saving and drawing). */
export function whenBroken(f: () => void): void {
  onCrash = f
}

export function isBroken(): boolean {
  return shown
}

export function crash(err: unknown, where: string): void {
  if (shown) return
  shown = true
  const e = err instanceof Error ? err : new Error(String(err))
  const info: CrashInfo = { message: e.message, stack: e.stack ?? '', where }
  console.error('[titans] broke in', where, err)
  try {
    onCrash?.()
  } catch {
    // (stopping is best-effort)
  }
  try {
    document.exitPointerLock?.()
  } catch {
    // not locked
  }
  const card = document.createElement('div')
  card.id = 'crash'
  card.innerHTML = `<div class="crash-card" role="alertdialog" aria-labelledby="crash-h">
    <h2 id="crash-h">The world stumbled</h2>
    <p>Something went wrong and the game had to stop. Your last save is safe: waking again picks up from it, a few seconds back.</p>
    <div class="crash-buttons"><button class="wake">Wake again</button><button class="copy">Copy details</button></div>
    <pre></pre></div>`
  const details = [
    `TITANS · ${new Date().toISOString()}`,
    `where: ${where}`,
    `message: ${info.message}`,
    `page: ${location.pathname}${location.search}`,
    `browser: ${navigator.userAgent}`,
    '',
    info.stack
  ].join('\n')
  card.querySelector('pre')!.textContent = details
  card.querySelector<HTMLButtonElement>('.wake')!.onclick = () => location.reload()
  const copy = card.querySelector<HTMLButtonElement>('.copy')!
  copy.onclick = () => {
    void navigator.clipboard
      ?.writeText(details)
      .then(() => (copy.textContent = 'Copied'))
      .catch(() => (copy.textContent = 'Could not copy'))
  }
  document.body.appendChild(card)
}

/** Errors from the game's own code (not a browser extension's) that escaped everything. */
export function watchErrors(): void {
  addEventListener('error', (ev) => {
    const file = ev.filename ?? ''
    if (file && !file.startsWith(location.origin)) return
    if (!ev.error) return // (resource load errors, ResizeObserver notices)
    crash(ev.error, 'uncaught')
  })
  // Rejected promises are logged, not carded: pointer lock and audio refusals land here
  // all the time and are not breakages.
  addEventListener('unhandledrejection', (ev) => console.warn('[titans] unhandled', ev.reason))
}
