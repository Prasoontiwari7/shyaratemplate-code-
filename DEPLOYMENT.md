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
- Rendering is CPU-based. No GPU is required for FFmpeg drawtext rendering.
- A normal modern laptop can run this locally, but large or many concurrent renders will take longer.

## Environment variables

You usually don’t need any env vars on Vercel.

Optional:

- `FFMPEG_PATH` – override the FFmpeg binary path (advanced).

## Local testing with ngrok

To expose your local backend publicly for testing:

```powershell
cd C:\Users\tiwar\Downloads\EDITOR\video-editor--main
npm install
npm run dev:4000
```

In a second terminal:

```powershell
npm run ngrok
```

Then open the public `https://...ngrok.io` URL shown by ngrok in your browser. Your frontend and `/api/generate` endpoint will be reachable from the internet while your laptop is running.

