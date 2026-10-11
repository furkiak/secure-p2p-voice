// Minimal flat config: catches typos, dead code and accidental globals without extra dependencies.
const browser = {
  window: 'readonly', document: 'readonly', navigator: 'readonly', console: 'readonly', performance: 'readonly', location: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', requestAnimationFrame: 'readonly',
  RTCPeerConnection: 'readonly', RTCRtpReceiver: 'readonly', MediaStream: 'readonly', AudioContext: 'readonly', BarcodeDetector: 'readonly',
  TextEncoder: 'readonly', TextDecoder: 'readonly', CompressionStream: 'readonly', DecompressionStream: 'readonly', Response: 'readonly',
  atob: 'readonly', btoa: 'readonly', globalThis: 'readonly', self: 'readonly', caches: 'readonly', fetch: 'readonly', URL: 'readonly', module: 'writable', require: 'readonly',
};

module.exports = [
  {
    files: ['js/**/*.js', 'sw.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: browser },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-redeclare': 'error',
      'no-shadow-restricted-names': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['tests/**/*.{js,cjs}', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...browser, __dirname: 'readonly', process: 'readonly', localStorage: 'readonly', getComputedStyle: 'readonly', SPV: 'readonly' } },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }] },
  },
];
