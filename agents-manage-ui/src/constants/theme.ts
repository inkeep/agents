// import type { editor } from 'monaco-editor';

export const MONACO_THEME_NAME = {
  light: 'github-light-default',
  dark: 'github-dark-default',
} as const;

// const color = {
//   transparent: '#00000000',
// };

// const baseColors: editor.IColors = {
//   'editor.background': color.transparent,
//   focusBorder: color.transparent, // Removes blue border
//   'editor.lineHighlightBorder': color.transparent,
//   'editor.wordHighlightBackground': color.transparent,
// };

export const TEMPLATE_LANGUAGE = 'template';
export const VARIABLE_TOKEN = 'variable';

// export const MONACO_THEME_DATA: Record<'light' | 'dark', editor.IStandaloneThemeData> = {
//   light: {
//     base: 'vs',
//     inherit: true,
//     rules: [
//       { token: 'string.key.json', foreground: '#b29762' },
//       { token: 'string.value.json', foreground: '#1659df' },
//       { token: `${VARIABLE_TOKEN}.${TEMPLATE_LANGUAGE}`, foreground: '#e67e22', fontStyle: 'bold' },
//     ],
//     colors: {
//       ...baseColors,
//       'editor.placeholder.foreground': '#58534d',
//       'editor.lineHighlightBackground': '#ddceb154',
//     },
//   },
//   dark: {
//     base: 'vs-dark',
//     inherit: true,
//     rules: [
//       { token: 'string.key.json', foreground: '#9a86fd' },
//       { token: 'string.value.json', foreground: '#ffb870' },
//       { token: `${VARIABLE_TOKEN}.${TEMPLATE_LANGUAGE}`, foreground: '#f39c12', fontStyle: 'bold' },
//     ],
//     colors: {
//       ...baseColors,
//       'editor.placeholder.foreground': '#9797a1',
//       'editor.lineHighlightBackground': '#3633427f',
//     },
//   },
// };
