/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_INKEEP_AGENTS_RUN_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
