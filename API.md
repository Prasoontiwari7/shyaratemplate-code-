# API

This project exposes two HTTP endpoints:

- `GET /api/templates` – list available templates
- `POST /api/generate` – render a new MP4 with text overlays

## Base URL

- Local dev: `http://localhost:3000`
- Production: your Vercel deployment URL (for example `https://your-project.vercel.app`)

## `GET /api/templates`

Returns templates from `public/templates/manifest.json`.

### Response

```json
{
  "templates": [
    {
      "id": "default",
      "name": "Default Wedding Template",
      "video": "/templates/default/template.mp4"
    }
  ]
}
```

## `POST /api/generate`

Renders an MP4 by applying FFmpeg `drawtext` filters to the selected template video.

### Request body

```json
{
  "templateId": "default",
  "groom": "John",
  "bride": "Jane",
  "date": "October 24, 2026 at 5 PM",
  "venue": "Palace Heights, Gwalior",
  "extraText1": "Dinner to follow at 8 PM",
  "duration": 15.03
}
```

Notes:

- `templateId` defaults to `"default"`.
- `duration` is optional. The browser sends `video.duration` so the server can time scene animations without running `ffprobe`.
- If `duration` is missing/invalid, the server falls back to `15` seconds.

### Success response

- Status: `200`
- Content-Type: `video/mp4`
- Response body: binary MP4 file
- Content-Disposition: attachment (triggers a download in the frontend)

### Error responses

- `400` – invalid/missing input
- `500` – FFmpeg or runtime error (returns JSON with `error` + `details`)

## Environment variables

- `FFMPEG_PATH` (optional): absolute path to an FFmpeg binary to use instead of `ffmpeg-static`.

## cURL examples

List templates:

```bash
curl http://localhost:3000/api/templates
```

Generate and download:

```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "groom": "John",
    "bride": "Jane",
    "date": "October 24, 2026 at 5 PM",
    "venue": "Palace Heights, Gwalior",
    "extraText1": "Dinner to follow",
    "templateId": "default",
    "duration": 15
  }' \
  --output WeddingInvite.mp4
```
