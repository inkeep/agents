import type { editor } from 'monaco-editor';

export const MONACO_THEME_NAME = {
  dark: 'inkeep-dark',
  light: 'inkeep-light',
};

export const MONACO_THEME_DATA: Record<'dark' | 'light', editor.IStandaloneThemeData> = {
  dark: {
    base: 'vs-dark',
    inherit: true,
    rules: [
      {
        token: 'string.key.json',
        foreground: '#9a86fd',
      },
      {
        token: 'string.value.json',
        foreground: '#ffb870',
      },
    ],
    colors: {
      'editor.background': '#00000000', // transparent
      // Removes blue border
      focusBorder: '#00000000', // transparent
      'editor.placeholder.foreground': '#9797a1',
    },
  },
  light: {
    base: 'vs',
    inherit: true,
    rules: [
      {
        token: 'string.key.json',
        foreground: '#b29762',
      },
      {
        token: 'string.value.json',
        foreground: '#1659df',
      },
    ],
    colors: {
      'editor.background': '#00000000', // transparent
      // Removes blue border
      focusBorder: '#00000000', // transparent
      'editor.placeholder.foreground': '#58534d',
    },
  },
};
