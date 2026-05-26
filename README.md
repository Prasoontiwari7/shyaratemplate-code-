# Cinematic Video Editor

Generate wedding invitation videos by rendering animated text overlays onto an MP4 template using FFmpeg.

- Frontend: `public/index.html` (vanilla HTML/CSS/JS)
- Backend: Vercel Serverless Functions in `api/`

## Quick start (local)

Prerequisites:

- Node.js `>= 20`

```bash
npm install
copy .env.example .env   # Windows (PowerShell/cmd)
# cp .env.example .env   # macOS/Linux
npm run dev
```

Open `http://localhost:4000`.

## How it works

1. The browser loads templates from `GET /api/templates`.
2. The selected template video plays in the page, and a canvas draws a live overlay preview.
3. Clicking **Generate Final Video** sends the form data to `POST /api/generate`.
4. `api/generate.ts` fetches the template MP4 + fonts, then runs FFmpeg with a `drawtext` filter chain (3 scenes across the video duration).
5. The rendered MP4 is returned as a file download.

## Templates

- Template files live in `public/templates/<id>/template.mp4`
- The template list is defined in `public/templates/manifest.json`

## Configuration

- `PORT` (local only): dev server port (default `3000`)
- `FFMPEG_PATH` (optional): override the FFmpeg binary path (otherwise uses `ffmpeg-static`)

## Project structure

```
api/                Vercel Serverless Functions
public/             Static frontend + template assets
dev-server.ts       Local dev server (serves both)
vercel.json         Vercel function settings (timeout/includeFiles)
```

## API

See `API.md`.

## Deploy to Vercel

See `DEPLOYMENT.md`.

## License

MIT (see `LICENSE`). Font licensing is included alongside the font files in `public/fonts/`.
