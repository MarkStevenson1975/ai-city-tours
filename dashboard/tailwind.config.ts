import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Match the public tour's palette
        primary: {
          DEFAULT: '#1B4332',
          light: '#2D6A4F',
        },
        accent: {
          DEFAULT: '#C9A84C',
          light: '#E8C96A',
        },
        cream: '#F5F0E8',
        muted: {
          DEFAULT: '#E8E0D0',
          dark: '#B0A898',
        },
        visited: '#40916C',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Lato', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [forms],
};

export default config;
