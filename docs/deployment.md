# Deployment

JianpuABC is deployed to GitHub Pages with GitHub Actions.

## Public URL

```text
https://chaoxiangaoguan.github.io/jianpu-abc/
```

The workflow in `.github/workflows/deploy-pages.yml` runs tests, type checking,
and the production build on every push to `main`. It uploads `dist/web/` and
deploys that artifact to Pages. It can also be started manually from Actions.

## Required GitHub Setting

Set `Settings -> Pages -> Build and deployment -> Source` to `GitHub Actions`.
A branch-based Pages configuration will not publish this workflow's artifact.

Vite derives the project base path from `GITHUB_REPOSITORY` in Actions, so the
deployed app uses `/jianpu-abc/` while local development continues to use `/`.
Do not add root-relative asset paths such as `/assets/example.svg`; use imports
or prefix public assets with `import.meta.env.BASE_URL`.

## Deploying Updates

```powershell
npm ci
npm test
npm run typecheck
npm run build
git push origin main
```

If `npm ci` fails, synchronize `package.json` and `package-lock.json` with
`npm install`, then commit both files. The workflow intentionally uses current
GitHub action major versions that run on Node 24 and builds the app with Node 22.
