/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        kakao: {
          yellow: '#FEE500',
          yellowDark: '#F4DA00',
          chatBg: '#B2C7D9',
          bubbleMe: '#FEE500',
          bubbleOther: '#FFFFFF',
          tabBar: '#FFFFFF',
          tabIconOff: '#888888',
          tabIconOn: '#000000',
          divider: '#E5E5E5',
          mutedText: '#999999',
        },
      },
      fontFamily: {
        sans: ['"Apple SD Gothic Neo"', '"Malgun Gothic"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
