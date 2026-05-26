# Cinematic Video Editor

A wedding invitation video generator that renders animated text overlays on a template MP4 using FFmpeg.

## Tech stack

- Node.js `>= 20`
- TypeScript
- Vercel Serverless Functions for production backend
- Express-style local server `local-server.ts`
- FFmpeg rendering via `@ffmpeg-installer/ffmpeg` and `ffmpeg-static`
- Vanilla HTML/CSS/JavaScript frontend in `public/index.html`
- Optional public sharing using `ngrok`

## What this app does

- Loads a template video and font assets from `public/`
- Accepts form data for names, date, venue, and extra text
- Uses FFmpeg `drawtext` filters to render large animated text into the video
- Returns a generated MP4 file as a downloadable response

## GPU / hardware requirements

- This project uses CPU-based FFmpeg rendering.
- It does not require a GPU.
- A normal modern laptop can run this backend.
- For best performance, use a fast CPU and avoid too many concurrent renders.
- Vercel serverless functions also run on CPU only and are subject to their timeout limits.

## Local setup and workflow

```powershell
cd C:\Users\tiwar\Downloads\EDITOR\video-editor--main
npm install
copy .env.example .env   # Windows
# cp .env.example .env   # macOS/Linux
npm run dev:4000
```

Open `http://localhost:4000`.

### Local public testing with ngrok

In a second terminal:

```powershell
npm run ngrok
```

Then open the public URL shown by ngrok. The frontend and `/api/generate` endpoint will be accessible from the internet while your laptop is running.

## Production deployment workflow

- Push changes to GitHub
- Deploy to Vercel with the linked repository
- The backend is served from `api/generate.ts`
- The static frontend is served from `public/`

### Deploy with one command

```powershell
npm run deploy:vercel
```

## Project files

- `local-server.ts` — local development server for frontend + API
- `api/generate.ts` — main video generation endpoint
- `api/templates.ts` — returns available templates
- `public/index.html` — user interface and client logic
- `public/templates/` — template videos and manifest
- `public/fonts/` — bundled fonts used by FFmpeg
- `vercel.json` — Vercel function packaging and timeout settings

## API

See `API.md` for details about request format and response behavior.

## License

MIT (see `LICENSE`). Font licensing is included with the font files in `public/fonts/`.
