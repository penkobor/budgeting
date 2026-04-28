/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'rgb(var(--bg) / <alpha-value>)',
          elev: 'rgb(var(--bg-elev) / <alpha-value>)',
          card: 'rgb(var(--bg-card) / <alpha-value>)',
        },
        fg: {
          DEFAULT: 'rgb(var(--fg) / <alpha-value>)',
          muted: 'rgb(var(--fg-muted) / <alpha-value>)',
          subtle: 'rgb(var(--fg-subtle) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
          strong: 'rgb(var(--border-strong) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          fg: 'rgb(var(--accent-fg) / <alpha-value>)',
        },
        positive: 'rgb(var(--positive) / <alpha-value>)',
        negative: 'rgb(var(--negative) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
      },
      fontFamily: {
        // Apple system stack — uses San Francisco on macOS/iOS, Segoe UI on Windows, Roboto on Android, and falls back gracefully.
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"SF Pro Display"',
          '"Helvetica Neue"',
          'Helvetica',
          'Arial',
          'system-ui',
          'sans-serif',
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
        ],
        mono: [
          'ui-monospace',
          '"SF Mono"',
          'Menlo',
          'Monaco',
          '"Cascadia Mono"',
          'Consolas',
          'monospace',
        ],
      },
      boxShadow: {
        soft: '0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px rgb(0 0 0 / 0.06)',
      },
      // HIG SF text styles — sizes in rem so Dynamic-Type-equivalent scaling works
      // when the user adjusts browser default font size. Letter-spacing values
      // approximate Apple's optical tracking per size.
      fontSize: {
        'caption-2':   ['0.6875rem', { lineHeight: '0.8125rem', letterSpacing: '0.005em' }], // 11pt
        'caption-1':   ['0.75rem',   { lineHeight: '1rem',      letterSpacing: '0' }],        // 12pt
        'footnote':    ['0.8125rem', { lineHeight: '1.125rem',  letterSpacing: '-0.005em' }], // 13pt
        'subhead':     ['0.9375rem', { lineHeight: '1.25rem',   letterSpacing: '-0.01em' }],  // 15pt
        'callout':     ['1rem',      { lineHeight: '1.3125rem', letterSpacing: '-0.015em' }], // 16pt
        'body':        ['1.0625rem', { lineHeight: '1.375rem',  letterSpacing: '-0.022em' }], // 17pt
        'headline':    ['1.0625rem', { lineHeight: '1.375rem',  letterSpacing: '-0.022em', fontWeight: '600' }],
        'title-3':     ['1.25rem',   { lineHeight: '1.5625rem', letterSpacing: '-0.024em' }], // 20pt
        'title-2':     ['1.375rem',  { lineHeight: '1.75rem',   letterSpacing: '-0.026em' }], // 22pt
        'title-1':     ['1.75rem',   { lineHeight: '2.125rem',  letterSpacing: '-0.03em' }],  // 28pt
        'large-title': ['2.125rem',  { lineHeight: '2.5625rem', letterSpacing: '-0.034em', fontWeight: '700' }], // 34pt
        'hero':        ['2.625rem',  { lineHeight: '2.875rem',  letterSpacing: '-0.04em',  fontWeight: '700' }], // 42pt — lens hero numbers
      },
      // 4-step radius scale + pill + device-corner. Use these for new code,
      // keep existing Tailwind rounded-* aliases working for now.
      borderRadius: {
        'pill': '9999px',
        'device': 'var(--device-radius)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in .2s ease-out',
        'slide-up': 'slide-up .25s ease-out',
        'sheet-up': 'sheet-up .3s cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [],
}

