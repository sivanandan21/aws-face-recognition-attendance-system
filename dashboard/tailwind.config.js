/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Newsreader', 'Playfair Display', 'Georgia', 'serif'],
        sans: ['Inter', '-apple-system', 'sans-serif'],
      },
      colors: {
        canvas: '#F5F4F0',
        sheet: '#FFFFFF',
        rail: '#FAF9F6',
        surfaceSoft: '#F4F3EE',
        control: '#E7E4DC',
        controlActive: '#C9C4B8',
        avatar: '#D9D4C9',
        kioskStage: '#161614',
        hairline: '#E6E4DD',
        inputBorder: '#DCD9D0',
        dashedBorder: '#CFCBC0',
        inkPrimary: '#141413',
        inkSecondary: '#5C5A55',
        inkMuted: '#8A867E',
        accentPine: '#166534',
        statusPresent: '#7B9478',
        statusLate: '#B58E43',
        statusAbsent: '#864446',
      }
    },
  },
  plugins: [],
}
