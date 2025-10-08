const config = {
  plugins: ['@tailwindcss/postcss'],
};
// Fixes in vitest [TypeError] Invalid PostCSS Plugin found at: plugins[0]
export default process.env.VITEST === 'true' ? {} : config;
