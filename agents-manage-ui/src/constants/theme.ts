import type { editor } from 'monaco-editor';

export const MONACO_THEME_NAME = {
  light: 'inkeep-light',
  dark: 'inkeep-dark',
};

const color = {
  transparent: '#00000000',
};

const baseColors: editor.IColors = {
  'editor.background': color.transparent,
  focusBorder: color.transparent, // Removes blue border
  'editor.lineHighlightBorder': color.transparent,
  'editor.wordHighlightBackground': color.transparent,
};

export const MONACO_THEME_DATA: Record<'light' | 'dark', editor.IStandaloneThemeData> = {
  light: {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'string.key.json', foreground: '#b29762' },
      { token: 'string.value.json', foreground: '#1659df' },
      { token: 'template-variable', foreground: '#e67e22', fontStyle: 'bold' },
      { token: '', foreground: '#1b1917' },
    ],
    colors: {
      ...baseColors,
      'editor.placeholder.foreground': '#58534d',
      'editor.lineHighlightBackground': '#ddceb154',
    },
  },
  dark: {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'string.key.json', foreground: '#9a86fd' },
      { token: 'string.value.json', foreground: '#ffb870' },
      { token: 'template-variable', foreground: '#f39c12', fontStyle: 'bold' },
      { token: '', foreground: '#fafafa' },
    ],
    colors: {
      ...baseColors,
      'editor.placeholder.foreground': '#9797a1',
      'editor.lineHighlightBackground': '#3633427f',
    },
  },
};
