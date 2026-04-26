/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    '/Users/Owner/bep-thuy-japan/index.html',
    '/Users/Owner/bep-thuy-japan/thanh-vien.html'
  ],
  theme: {
    extend: {
      colors: {
        brand: { red: '#C8102E', gold: '#D4A017', cream: '#FFF8F0', dark: '#2C1A0E', warm: '#8B3A0F' }
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'serif']
      }
    }
  },
  plugins: []
}
