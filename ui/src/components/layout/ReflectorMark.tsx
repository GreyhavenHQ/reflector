export function ReflectorMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 500 500"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <polygon
        points="227.5,51.5 86.5,150.1 100.8,383.9 244.3,249.8"
        fill="var(--fg)"
        opacity="0.82"
      />
      <polygon
        points="305.4,421.4 423.9,286 244.3,249.8 100.8,383.9"
        fill="var(--fg)"
        opacity="0.42"
      />
    </svg>
  )
}
