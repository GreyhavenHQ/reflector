export function extractDetail(error: unknown): string | null {
  if (error && typeof error === 'object' && 'detail' in error) {
    const d = (error as { detail?: unknown }).detail
    if (typeof d === 'string') return d
  }
  return null
}

export function messageFor(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'detail' in err) {
    const d = (err as { detail?: unknown }).detail
    if (typeof d === 'string') return d
  }
  if (err instanceof Error) return err.message
  return fallback
}
