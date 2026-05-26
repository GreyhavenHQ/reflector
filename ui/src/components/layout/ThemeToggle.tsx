import { I } from '@/components/icons'
import { Button } from '@/components/ui/primitives'
import { useTheme } from '@/hooks/useTheme'

export function ThemeToggle() {
  const [theme, , toggle] = useTheme()
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
  return (
    <Button
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      onClick={toggle}
    >
      {theme === 'dark' ? I.Sun(16) : I.Moon(16)}
    </Button>
  )
}
