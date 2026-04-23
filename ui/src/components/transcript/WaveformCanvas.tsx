import { useEffect, useMemo, useRef } from 'react'

type Props = {
  peaks: number[] | null | undefined
  progress: number // 0..1 (played portion)
  onSeek: (ratio: number) => void
  /** In seconds; when provided, tick marks render at each position. */
  ticks?: number[]
  duration?: number
  active?: number | null
}

/**
 * Lightweight canvas-based waveform renderer. Scales to devicePixelRatio so the
 * output stays crisp on high-DPI displays. Click anywhere to seek.
 */
export function WaveformCanvas({
  peaks,
  progress,
  onSeek,
  ticks,
  duration,
  active,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const normalized = useMemo(() => normalize(peaks), [peaks])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.floor(rect.width * dpr))
    canvas.height = Math.max(1, Math.floor(rect.height * dpr))
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawWaveform(ctx, rect.width, rect.height, normalized, progress)
    if (ticks && duration && duration > 0) {
      drawTicks(ctx, rect.width, rect.height, ticks, duration, active ?? null)
    }
  }, [normalized, progress, ticks, duration, active])

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: 72,
        borderRadius: 'var(--radius-md)',
        background: 'var(--muted)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        cursor: 'pointer',
      }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left
        onSeek(Math.max(0, Math.min(1, x / rect.width)))
      }}
    >
      <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  )
}

function normalize(peaks: number[] | null | undefined): number[] {
  if (!peaks || peaks.length === 0) return []
  const max = peaks.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1
  return peaks.map((v) => Math.abs(v) / max)
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  peaks: number[],
  progress: number,
) {
  ctx.clearRect(0, 0, w, h)
  if (peaks.length === 0) return
  const mid = h / 2
  const step = w / peaks.length
  const barWidth = Math.max(1, Math.floor(step * 0.6))
  const playedX = Math.max(0, Math.min(1, progress)) * w
  for (let i = 0; i < peaks.length; i++) {
    const x = Math.floor(i * step)
    const amplitude = Math.max(2, peaks[i] * (h * 0.9))
    const y = mid - amplitude / 2
    const isPlayed = x < playedX
    ctx.fillStyle = isPlayed ? 'var(--primary)' : 'var(--gh-grey-4)'
    // Fallback for canvas (doesn't support var() directly).
    ctx.fillStyle = isPlayed ? getCssVar('--primary') : getCssVar('--gh-grey-4')
    ctx.fillRect(x, y, barWidth, amplitude)
  }
}

function drawTicks(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ticks: number[],
  duration: number,
  active: number | null,
) {
  for (const t of ticks) {
    if (t < 0 || t > duration) continue
    const x = (t / duration) * w
    const isActive = active != null && Math.abs(active - t) < 0.01
    ctx.strokeStyle = isActive ? getCssVar('--primary') : getCssVar('--fg')
    ctx.globalAlpha = isActive ? 0.95 : 0.35
    ctx.lineWidth = isActive ? 2 : 1
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function getCssVar(name: string): string {
  if (typeof window === 'undefined') return '#000'
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || '#000'
}
