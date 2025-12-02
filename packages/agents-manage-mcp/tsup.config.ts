import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  // Bundle zod INTO the package output to avoid version conflicts
  // with consumers that use Zod v4
  noExternal: ["zod"],
});
