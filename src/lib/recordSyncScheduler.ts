import type { SyncRunResult } from './recordSyncEngine'

export class RecordSyncScheduler {
  private timer: ReturnType<typeof setTimeout> | undefined
  private running = false
  private requested = false
  private stopped = false

  constructor(
    private run: () => Promise<SyncRunResult>,
    private allowed = () => true,
    private reportError: (error: unknown) => void = () => {},
  ) {}

  request(delay = 300): void {
    if (this.stopped) return
    this.requested = true
    if (this.running) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { this.timer = undefined; void this.execute() }, delay)
  }

  private async execute(): Promise<void> {
    if (this.stopped || !this.allowed()) return
    this.running = true
    this.requested = false
    let result: SyncRunResult | undefined
    try { result = await this.run() }
    catch (error) { this.reportError(error) }
    finally { this.running = false }
    if (this.stopped || !this.allowed()) return
    if (result?.status === 'retry') this.request(Math.max(300, result.retryAt - Date.now()))
    else if (this.requested || (result?.status === 'pending' && result.pending > result.conflicts)) this.request()
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
  }
}
