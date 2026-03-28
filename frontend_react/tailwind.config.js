/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        medical: {
          900: '#003366',
          800: '#004080',
          700: '#004d99',
          600: '#0059b3',
          500: '#0066cc',
          400: '#0073e6',
          300: '#3385ff',
          200: '#66a3ff',
          100: '#99c2ff',
          50: '#e6f0ff',
        },
        success: {
          DEFAULT: '#28a745',
          light: '#34c759',
          dark: '#1e7e34',
        },
        warning: {
          DEFAULT: '#ffc107',
          dark: '#e0a800',
        },
        danger: {
          DEFAULT: '#dc3545',
          light: '#e4606d',
          dark: '#c82333',
        },
        info: {
          DEFAULT: '#17a2b8',
          light: '#38b2ac',
          dark: '#117a8b',
        },
        primary: {
          DEFAULT: '#0059b3',
          dark: '#004d99',
        },
        // Dark theme surfaces
        surface: {
          0: '#06060e',
          1: '#0a0e1a',
          2: '#0d1117',
        },
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        'elevated': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'glow-blue': '0 0 20px rgba(59, 130, 246, 0.3)',
        'glow-violet': '0 0 20px rgba(139, 92, 246, 0.3)',
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'modal-in': 'modalIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'tooth-pop': 'toothPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'tooltip-in': 'tooltipIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'guide-wobble': 'guideWobble 6s ease-in-out infinite',
        'nova-wobble': 'novaWobble 5s ease-in-out infinite',
        'guide-ping': 'guidePing 3s ease-out infinite',
        'nova-ping': 'novaPing 3s ease-out infinite',
        'ken-burns': 'kenBurns 8s ease-in-out infinite alternate',
        'card-slide-left': 'cardSlideLeft 0.3s ease-out',
        'card-slide-right': 'cardSlideRight 0.3s ease-out',
        'orbit': 'orbit 8s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        modalIn: {
          '0%': { opacity: '0', transform: 'scale(0.95) translateY(10px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        toothPop: {
          '0%': { transform: 'scale(0.8)' },
          '50%': { transform: 'scale(1.1)' },
          '100%': { transform: 'scale(1)' },
        },
        tooltipIn: {
          '0%': { opacity: '0', transform: 'scale(0.8) translateY(5px)' },
          '60%': { transform: 'scale(1.05) translateY(-2px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(59,130,246,0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(59,130,246,0.6)' },
        },
        guideWobble: {
          '0%': { transform: 'scale(1) rotate(0)' },
          '10%': { transform: 'scale(1.15) rotate(-5deg)' },
          '20%': { transform: 'scale(1.1) rotate(3deg) translateY(-2px)' },
          '30%': { transform: 'scale(1.05) rotate(-2deg)' },
          '40%, 100%': { transform: 'scale(1) rotate(0)' },
        },
        novaWobble: {
          '0%': { transform: 'scale(1)' },
          '10%': { transform: 'scale(1.2) rotate(-8deg)' },
          '20%': { transform: 'scale(1.15) rotate(5deg) translateY(-3px)' },
          '30%': { transform: 'scale(1.08) rotate(-3deg)' },
          '40%, 100%': { transform: 'scale(1) rotate(0)' },
        },
        guidePing: {
          '0%': { transform: 'scale(1)', opacity: '0.5' },
          '100%': { transform: 'scale(2)', opacity: '0' },
        },
        novaPing: {
          '0%': { transform: 'scale(1)', opacity: '0.4' },
          '100%': { transform: 'scale(2.5)', opacity: '0' },
        },
        kenBurns: {
          '0%': { transform: 'scale(1.02)' },
          '100%': { transform: 'scale(1.1)' },
        },
        cardSlideLeft: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        cardSlideRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        orbit: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
    },
  },
  plugins: [],
}
