tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
  sans: ['"Quicksand"', 'sans-serif'],
  display: ['"Fredoka"', 'sans-serif'],
},
      colors: {
        brand: {
          50: '#fff1f5',
          100: '#ffe4ec',
          200: '#fecdd9',
          300: '#fda4ba',
          400: '#fb7196',
          500: '#f43f72',
          600: '#e11d58',
          700: '#be1249',
          900: '#88133b',
        },
        studio: {
          dark: '#fdf2f6',
          card: '#ffffff',
          border: '#f3d0dc'
        }
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'flash': 'flashAnim 0.45s ease-out forwards',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        flashAnim: {
          '0%': { opacity: '0.95' },
          '100%': { opacity: '0' },
        }
      }
    }
  }
};

// Daftar file frame PNG transparan di folder utama (1.png s/d 17.png + frame-1.png)
const FRAME_SOURCES = [
  ...Array.from({ length: 17 }, (_, i) => `${i + 1}.png`),
  'frame-1.png'
];

const FRAME_TEMPLATES = FRAME_SOURCES.map((src, i) => {
  const num = i + 1;
  return {
    id: `custom-frame-${num}`,
    name: `Frame Collection #${num}`,
    dimension: 'Auto Size',
    shots: 3,
    price: 25000,
    canvasW: 600,
    canvasH: 1800,
    layoutType: 'auto_png',
    badge: `Frame #${num}`,
    imageSrc: src,
    overlayImg: null,
    customRects: []
  };
});

const FILTERS = [
  { id: 'none', name: 'Original', css: 'none', canvasFilter: 'none' },
  { id: 'bw', name: 'B&W Noir', css: 'grayscale(100%) contrast(118%)', canvasFilter: 'grayscale(100%) contrast(118%)' },
  { id: 'vintage', name: 'Vintage 90s', css: 'sepia(42%) contrast(106%) saturate(88%)', canvasFilter: 'sepia(42%) contrast(106%) saturate(88%)' },
  { id: 'warm', name: 'Warm Glow', css: 'sepia(20%) saturate(135%) brightness(104%)', canvasFilter: 'sepia(20%) saturate(135%) brightness(104%)' },
  { id: 'cool', name: 'Seoul Cool', css: 'hue-rotate(14deg) saturate(112%) brightness(103%)', canvasFilter: 'hue-rotate(14deg) saturate(112%) brightness(103%)' },
  { id: 'pastel', name: 'Soft Pastel', css: 'brightness(108%) contrast(90%) saturate(120%)', canvasFilter: 'brightness(108%) contrast(90%) saturate(120%)' },
  { id: 'contrast', name: 'Studio Crisp', css: 'contrast(130%) saturate(115%)', canvasFilter: 'contrast(130%) saturate(115%)' }
];

const state = {
  studioName: 'SnapBooth Studio',
  customQrisDataUrl: null,
  selectedFrame: FRAME_TEMPLATES[0],
  frameBgColor: '#ffffff',
  frameTextColor: '#111827',
  paymentMethod: 'qris',
  paymentTimerInterval: null,
  stream: null,
  isSimulatedCam: false,
  simAnimId: null,
  isMirrored: true,
  isCapturing: false,
  retakeSlotIndex: null,
  capturedPhotos: [],
  capturedBursts: [],
  processedPhotos: [],
  photoMasks: {},
  selectedFilter: FILTERS[0],
  sessionId: '',
  finalFullFrameDataUrl: '',
  finalGifDataUrl: '',
  finalSinglePhotos: [],
  liveAnimFrameId: null,
  camBgMode: 'none',
  camBgValue: null,
  camBgCustomImg: null,
  segmenter: null,
  segQueue: Promise.resolve()
};