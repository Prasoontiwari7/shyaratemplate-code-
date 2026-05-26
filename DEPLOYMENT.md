# Deployment (Vercel)

This repo is set up for Vercel using:

- Static frontend: `public/`
- Serverless backend: `api/`

## Deploy from GitHub

1. Push this repository to GitHub.
2. In Vercel: **New Project** → import the GitHub repo.
3. In **Project Settings → Build & Development Settings**:
   - **Framework Preset**: `Other`
   - **Output Directory**: `public` (default for “Other” when `public/` exists)
4. Deploy.

## Function limits

- `api/generate.ts` is configured with `maxDuration: 60` in `vercel.json`.
- Keep templates reasonably short so rendering completes within the serverless timeout.

## Environment variables

You usually don’t need any env vars on Vercel.

Optional:

- `FFMPEG_PATH` – override the FFmpeg binary path (advanced).

