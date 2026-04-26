/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        essalud: {
          blue: '#00A3E0',
          'blue-dark': '#005A9C',
          'blue-darker': '#003E73',
          'blue-light': '#38BDF8',
          'blue-soft': '#EAF7FD',
          teal: '#00A3E0',
          'teal-dark': '#005A9C',
          'teal-light': '#38BDF8',
          navy: '#0072BC',
          'navy-dark': '#003E73',
          'navy-light': '#1A8FE3',
          gray: '#F4F8FB',
          'gray-dark': '#64748B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false, // Disable preflight to avoid conflicts with Bootstrap resets
  },
}
