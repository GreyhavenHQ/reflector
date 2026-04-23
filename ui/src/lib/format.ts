export function fmtDur(s: number | null | undefined): string {
  if (!s) return '—'
  const m = Math.floor(s / 60)
  const ss = String(Math.floor(s % 60)).padStart(2, '0')
  if (m < 60) return `${m}:${ss}`
  const h = Math.floor(m / 60)
  const mm = String(m % 60).padStart(2, '0')
  return `${h}:${mm}:${ss}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  let d = new Date(iso)
  if (Number.isNaN(d.getTime()) && iso.includes(' ')) {
    d = new Date(iso.replace(' ', 'T'))
  }
  if (Number.isNaN(d.getTime())) return iso
  const month = MONTHS[d.getMonth()]
  const day = d.getDate()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${month} ${day}, ${hh}:${mm}`
}
