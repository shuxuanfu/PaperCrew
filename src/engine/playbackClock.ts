type ClockMode = 'running' | 'paused' | 'cancelled'

interface ActiveWait {
  pause: () => void
  resume: () => void
  cancel: () => void
}

export class PlaybackClock {
  private mode: ClockMode = 'running'
  private activeWait: ActiveWait | null = null
  private zeroWaiters = new Set<(completed: boolean) => void>()

  pause(): void {
    if (this.mode !== 'running') {
      return
    }
    this.mode = 'paused'
    this.activeWait?.pause()
  }

  resume(): void {
    if (this.mode !== 'paused') {
      return
    }
    this.mode = 'running'
    this.activeWait?.resume()
    this.resolveZeroWaiters(true)
  }

  cancel(): void {
    if (this.mode === 'cancelled') {
      return
    }
    this.mode = 'cancelled'
    this.activeWait?.cancel()
    this.activeWait = null
    this.resolveZeroWaiters(false)
  }

  reset(): void {
    this.mode = 'running'
    this.activeWait = null
    this.resolveZeroWaiters(true)
  }

  async wait(durationMs: number): Promise<boolean> {
    if (this.mode === 'cancelled') {
      return false
    }

    if (durationMs <= 0) {
      if (this.mode === 'running') {
        return true
      }
      return new Promise<boolean>((resolve) => {
        this.zeroWaiters.add(resolve)
      })
    }

    return new Promise<boolean>((resolve) => {
      let remaining = durationMs
      let startedAt = 0
      let timer: ReturnType<typeof setTimeout> | null = null
      let settled = false

      const finish = (completed: boolean) => {
        if (settled) {
          return
        }
        settled = true
        if (timer !== null) {
          clearTimeout(timer)
          timer = null
        }
        this.activeWait = null
        resolve(completed)
      }

      const schedule = () => {
        if (settled) {
          return
        }
        if (this.mode === 'cancelled') {
          finish(false)
          return
        }
        if (this.mode === 'paused') {
          return
        }
        startedAt = Date.now()
        timer = setTimeout(() => {
          timer = null
          finish(true)
        }, remaining)
      }

      this.activeWait = {
        pause: () => {
          if (timer === null) {
            return
          }
          clearTimeout(timer)
          timer = null
          remaining = Math.max(0, remaining - (Date.now() - startedAt))
        },
        resume: schedule,
        cancel: () => finish(false),
      }

      schedule()
    })
  }

  private resolveZeroWaiters(completed: boolean) {
    for (const resolve of this.zeroWaiters) {
      resolve(completed)
    }
    this.zeroWaiters.clear()
  }
}
