export const env = {
  get INKEEP_AGENTS_DOCS_URL() {
    return process.env.INKEEP_AGENTS_DOCS_URL ?? '';
  },
  get INKEEP_AGENTS_MANAGE_API_URL() {
    return process.env.INKEEP_AGENTS_MANAGE_API_URL ?? '';
  },
};
