/** @type {import('tailwindcss').Config} */


import flowbitePlugin from 'flowbite/plugin'
const colors = require('tailwindcss/colors')

export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
    'node_modules/flowbite-vue/**/*.{js,jsx,ts,tsx,vue}',
    'node_modules/flowbite/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      aspectRatio: {
        '4/3': '4 / 3',
        '3/2': '3 / 2',
        '1/2': '1 / 2',
      },
      colors: {
        'war': {
          'light': colors.red[300],
          DEFAULT: colors.red[600],
          'dark': colors.red[900],
        },
        'knowledge': {
          'light': colors.sky[300],
          DEFAULT: colors.sky[600],
          'dark': colors.sky[900],
        },
        'society': {
          'light': colors.amber[200],
          DEFAULT: colors.amber[500],
          'dark': colors.amber[800],
        },
        'shadow': {
          'light': colors.neutral[200],
          DEFAULT: colors.neutral[800],
          'dark': colors.neutral[950],
        },
        'mystics': {
          'light': colors.fuchsia[300],
          DEFAULT: colors.fuchsia[600],
          'dark': colors.fuchsia[950],
        },
        'nature': {
          'light': colors.green[300],
          DEFAULT: colors.green[600],
          'dark': colors.green[900],
        },
      }
    },
  },
  plugins: [
    require('flowbite/plugin'),
    function({ addBase, theme }) {
      function extractColorVars(colorObj, colorGroup = '') {
        return Object.keys(colorObj).reduce((vars, colorKey) => {
          const value = colorObj[colorKey];

          const newVars =
            typeof value === 'string'
              ? { [`--color${colorGroup}-${colorKey}`]: value }
              : extractColorVars(value, `-${colorKey}`);

          return { ...vars, ...newVars };
        }, {});
      }

      addBase({
        ':root': extractColorVars(theme('colors')),
      });
    },
  ],
}

