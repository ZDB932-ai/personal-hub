export function startForegroundSync(request: () => void, allowed: () => boolean, interval = () => 3000 + Math.floor(Math.random() * 1000)): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout>
  const tick = () => {
    if (stopped) return
    if (allowed()) request()
    timer = setTimeout(tick, interval())
  }
  timer = setTimeout(tick, interval())
  return () => { stopped = true; clearTimeout(timer) }
}
