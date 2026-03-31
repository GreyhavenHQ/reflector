/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#DC5A28',
        'primary-dark': '#a63500',
        'primary-container': '#c84c1a',
        surface: '#fcfaec',
        'surface-low': '#f6f4e7',
        'surface-mid': '#f0eee1',
        'surface-high': '#e8e5d4',
        'on-surface': '#1b1c14',
        'on-surface-variant': '#5a5850',
        muted: '#a09a8e',
        'outline-variant': '#e0bfb5',
        error: '#ba1a1a',
      },
      fontFamily: {
        serif: ['Newsreader', 'Georgia', 'serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: '6px',
        md: '12px',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #a63500, #c84c1a)',
      },
      boxShadow: {
        card: '0 8px 40px rgba(27,28,20,0.06)',
        modal: '0 16px 48px rgba(27,28,20,0.12)',
      },
    },
  },
  plugins: [],
}
