/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#C1BDB6',
        card: '#FFFFFF',
        ink: '#111111',
        sub: '#8E8E93',
        line: '#EDEDEA',
        warn: '#B44B28',
        exp: '#C7976F',
        inc: '#C7CE9A',
        hl: '#FFDE70',
        cream: '#F3EFEB',
        pale: '#E1E5C7',
        paled: '#C9CFA0',
        sage: '#CFE0D8',
        up: '#B27E52',
        down: '#8F9C5C',
      },
      borderRadius: {
        card: '22px',
      },
      boxShadow: {
        card: 'none',
      },
      fontFamily: {
        sans: ['Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        serif: ['Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
