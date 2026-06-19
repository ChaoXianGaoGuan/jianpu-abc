import { defineConfig } from "vite";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const githubPagesBase =
  repositoryName && !repositoryName.endsWith(".github.io")
    ? `/${repositoryName}/`
    : "/";
const base = process.env.GITHUB_ACTIONS ? githubPagesBase : "/";

export default defineConfig({
  base,
  build: {
    outDir: "dist/web",
    emptyOutDir: true,
    chunkSizeWarningLimit: 550,
  },
});
