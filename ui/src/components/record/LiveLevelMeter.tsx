import { useEffect, useRef } from 'react'

type Props = {
  stream: MediaStream | null
  active: boolean
  height?: number
}

/**
 * Realtime audio-level visualizer. Taps the MediaStream via Web Audio and
 * draws a row of bars scaled to the live frequency bins. Kept intentionally
 * minimal — no peak capture, no recording metadata, just a "is the mic
 * picking up sound" affordance during a live recording.
 */
export function LiveLevelMeter({ stream, active, height = 80 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !stream || !active) return

    const audioCtx = new (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!)()
    const source = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.8
    source.connect(analyser)

    const bufferLength = analyser.frequencyBinCount
    const data = new Uint8Array(bufferLength)

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let rafId = 0
    const draw = () => {
      rafId = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(data)

      const dpr = window.devicePixelRatio || 1
      const cssW = canvas.clientWidth
      const cssH = canvas.clientHeight
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr
        canvas.height = cssH * dpr
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cssW, cssH)

      // Read the computed --primary so we follow theme (dark/light).
      const accent =
        getComputedStyle(canvas).getPropertyValue('--primary').trim() || '#D95E2A'

      const barCount = 32
      const step = Math.floor(bufferLength / barCount)
      const gap = 2
      const barW = Math.max(2, (cssW - (barCount - 1) * gap) / barCount)

      for (let i = 0; i < barCount; i++) {
        // Average a slice of bins for a smoother response
        let sum = 0
        for (let j = 0; j < step; j++) sum += data[i * step + j] ?? 0
        const v = sum / step / 255 // 0..1
        const h = Math.max(2, v * cssH)
        const x = i * (barW + gap)
        const y = (cssH - h) / 2

        ctx.fillStyle = accent
        ctx.globalAlpha = 0.25 + v * 0.75
        ctx.fillRect(x, y, barW, h)
      }
      ctx.globalAlpha = 1
    }

    draw()

    return () => {
      cancelAnimationFrame(rafId)
      try {
        source.disconnect()
        analyser.disconnect()
        void audioCtx.close()
      } catch {
        // ignore
      }
    }
  }, [stream, active])

  return (
    <canvas
      ref={canvasRef}
      className="w-full block bg-muted rounded-md"
      style={{ height }}
    />
  )
}
