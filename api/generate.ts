import type { IncomingMessage, ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

type GenerateBody = {
  templateId?: string;
  groom?: string;
  bride?: string;
  date?: string;
  venue?: string;
  extraText1?: string;
  duration?: number;
};

const require = createRequire(import.meta.url);

function resolveFfmpegBinary() {
  const envPath = String(process.env.FFMPEG_PATH || '').trim();
  if (envPath) return envPath;
  try {
    const ffmpegStatic = require('ffmpeg-static');
    if (typeof ffmpegStatic === 'string' && ffmpegStatic.trim()) return ffmpegStatic;
  } catch {}
  return 'ffmpeg';
}

/* Prefer an npm-provided ffmpeg binary that is more likely to include filters like drawtext.
   Try @ffmpeg-installer/ffmpeg first, then ffmpeg-static, then system ffmpeg. */
function resolveFfmpegBinaryPreferInstaller() {
  const envPath = String(process.env.FFMPEG_PATH || '').trim();
  if (envPath) return envPath;

  try {
    // @ffmpeg-installer/ffmpeg exposes a .path to a bundled ffmpeg binary
    const installer = require('@ffmpeg-installer/ffmpeg');
    if (installer && typeof installer.path === 'string' && installer.path.trim()) return installer.path;
  } catch {}

  try {
    const ffmpegStatic = require('ffmpeg-static');
    if (typeof ffmpegStatic === 'string' && ffmpegStatic.trim()) return ffmpegStatic;
  } catch {}

  return 'ffmpeg';
}

let FFMPEG = resolveFfmpegBinaryPreferInstaller();

function getInstallerFfmpegPath() {
  try {
    const installer = require('@ffmpeg-installer/ffmpeg');
    if (installer && typeof installer.path === 'string' && installer.path.trim()) {
      return installer.path;
    }
  } catch {
    return '';
  }
}

const installerFfmpegPath = getInstallerFfmpegPath();
if (installerFfmpegPath) {
  process.env.FFMPEG_PATH = installerFfmpegPath;
  FFMPEG = installerFfmpegPath;
}

function getRuntimeFontConfig() {
  const fontsDir = path.join(process.cwd(), 'public', 'fonts');
  const configDir = path.join(os.tmpdir(), 'fontconfig');
  const cacheDir = path.join(os.tmpdir(), 'fontconfig-cache');
  const configFile = path.join(configDir, 'fonts.conf');

  return { fontsDir, configDir, cacheDir, configFile };
}

function ensureFontConfig() {
  const { fontsDir, configDir, configFile, cacheDir } = getRuntimeFontConfig();
  process.env.FONTCONFIG_PATH = configDir;
  process.env.FONTCONFIG_FILE = configFile;

  return Promise.all([
    fsp.mkdir(configDir, { recursive: true }),
    fsp.mkdir(cacheDir, { recursive: true }),
  ]).then(() => {
    const configContents = `<?xml version="1.0"?>\n<fontconfig>\n  <dir>${fontsDir}</dir>\n  <cachedir>${cacheDir}</cachedir>\n</fontconfig>`;
    return fsp.writeFile(configFile, configContents, 'utf8');
  }).then(() => ({ fontsDir, configDir, configFile }));
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function getOrigin(req: IncomingMessage) {
  const protoHeader = req.headers['x-forwarded-proto'];
  const hostHeader = req.headers['x-forwarded-host'] ?? req.headers.host;

  const proto = String(Array.isArray(protoHeader) ? protoHeader[0] : protoHeader || 'http').split(',')[0].trim();
  const host = String(Array.isArray(hostHeader) ? hostHeader[0] : hostHeader || 'localhost').split(',')[0].trim();

  return `${proto}://${host}`;
}

async function readJsonBody(req: IncomingMessage, maxBytes = 1024 * 1024) {
  const anyReq = req as any;
  if (anyReq?.body && typeof anyReq.body === 'object') return anyReq.body;

  return await new Promise<any>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });

    req.on('error', reject);
  });
}

function runProcess(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FONTCONFIG_PATH: process.env.FONTCONFIG_PATH,
        FONTCONFIG_FILE: process.env.FONTCONFIG_FILE,
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      const error = new Error(stderr || `Process exited with code ${code}`);
      (error as any).code = code;
      (error as any).stderr = stderr;
      reject(error);
    });
  });
}

async function fileExists(absPath: string) {
  try {
    const st = await fsp.stat(absPath);
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

async function ensurePublicAssetFile(req: IncomingMessage, publicPath: string) {
  const rel = publicPath.replace(/^\//, '');

  const localPublicPath = path.join(process.cwd(), 'public', rel);
  if (await fileExists(localPublicPath)) return localPublicPath;

  const tmpRoot = path.join(os.tmpdir(), 'cinematic-video-editor');
  await fsp.mkdir(tmpRoot, { recursive: true });

  const hash = crypto.createHash('sha1').update(publicPath).digest('hex').slice(0, 10);
  const tmpPath = path.join(tmpRoot, `${hash}-${path.basename(rel)}`);
  if (await fileExists(tmpPath)) return tmpPath;

  const origin = getOrigin(req);
  const url = `${origin}${publicPath}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch asset ${publicPath} (${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  await fsp.writeFile(tmpPath, buf);
  return tmpPath;
}

function formatFilterPath(absPath: string) {
  return absPath.replace(/\\/g, '/').replace(/:/g, '\\:');
}

function escapeFFmpegText(text: string) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/%/g, '\\%');
}

function calcTextScale(input: string, maxCharsAtScale1: number, minScale = 0.6) {
  const text = String(input || '').trim();
  if (!text) return 1;
  const len = Array.from(text).length;
  if (len <= maxCharsAtScale1) return 1;
  return Math.max(minScale, maxCharsAtScale1 / len);
}

function wrapWords(input: string, maxChars: number, maxLines: number) {
  const text = String(input || '').trim();
  if (!text) return [''];

  const ellipsis = '...';
  const normalizeSpaces = (s: string) => s.replace(/\s+/g, ' ').trim();

  const pushTruncated = (lines: string[]) => {
    if (!lines.length) return [''];
    const last = lines[lines.length - 1];
    if (last.length + ellipsis.length <= maxChars) {
      lines[lines.length - 1] = `${last}${ellipsis}`;
      return lines;
    }
    const head = last.slice(0, Math.max(0, maxChars - ellipsis.length)).trimEnd();
    lines[lines.length - 1] = `${head}${ellipsis}`;
    return lines;
  };

  const breakLongWord = (word: string) => {
    if (word.length <= maxChars) return [word];
    if (maxChars <= 1) return [word.slice(0, 1)];
    const parts: string[] = [];
    let remaining = word;
    while (remaining.length > maxChars) {
      const chunk = remaining.slice(0, maxChars - 1);
      parts.push(`${chunk}-`);
      remaining = remaining.slice(maxChars - 1);
    }
    if (remaining) parts.push(remaining);
    return parts;
  };

  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];
  let truncated = false;

  for (const paragraph of paragraphs) {
    if (lines.length >= maxLines) {
      truncated = true;
      break;
    }

    const cleanParagraph = normalizeSpaces(paragraph);
    if (!cleanParagraph) continue;

    const rawWords = cleanParagraph.split(' ').filter(Boolean);
    const words = rawWords.flatMap(breakLongWord);

    let current = '';
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const candidate = current ? `${current} ${word}` : word;

      if (candidate.length <= maxChars) {
        current = candidate;
        continue;
      }

      if (current) lines.push(current);
      current = word;

      if (lines.length >= maxLines) {
        truncated = true;
        current = '';
        break;
      }
    }

    if (current && lines.length < maxLines) lines.push(current);
  }

  if (truncated) pushTruncated(lines);
  return lines.length ? lines : [''];
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  let body: GenerateBody;
  try {
    body = (await readJsonBody(req)) as GenerateBody;
  } catch (err: any) {
    return sendJson(res, 400, { error: 'Invalid JSON body', details: String(err?.message || err) });
  }

  const templateId = String(body.templateId || 'default').trim() || 'default';
  const groom = String(body.groom || 'Groom').trim() || 'Groom';
  const bride = String(body.bride || 'Bride').trim() || 'Bride';
  const date = String(body.date || 'October 24, 2026').trim() || 'October 24, 2026';
  const venue = String(body.venue || 'The Grand Palace').trim() || 'The Grand Palace';
  const extraText1 = String(body.extraText1 || '').trim();

  const durationRaw = Number(body.duration);
  const safeDuration = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : 15;

  const templateVideoPublic = `/templates/${encodeURIComponent(templateId)}/template.mp4`;

  try {
    const inputPath = await ensurePublicAssetFile(req, templateVideoPublic);

    const lucienFontAbs = await ensurePublicAssetFile(req, '/fonts/lucien.ttf');
    const scriptFontAbs = await ensurePublicAssetFile(req, '/fonts/script.ttf');
    const jostFontAbs = await ensurePublicAssetFile(req, '/fonts/jost.ttf');
    const loraFontAbs = await ensurePublicAssetFile(req, '/fonts/lora.ttf');

    const lucienFont = formatFilterPath((await fileExists(lucienFontAbs)) ? lucienFontAbs : scriptFontAbs);
    const futuraFont = formatFilterPath(jostFontAbs);
    const loraFont = formatFilterPath(loraFontAbs);

    const groomRaw = String(groom || '').trim();
    const brideRaw = String(bride || '').trim();
    const textGroom = escapeFFmpegText(groomRaw);
    const textBride = escapeFFmpegText(brideRaw);
    const groomScale = calcTextScale(groomRaw, 12, 0.55);
    const brideScale = calcTextScale(brideRaw, 12, 0.55);

    const numScenes = 3;
    const sceneDur = safeDuration / numScenes;
    const fadeIn = 1.3;
    const fadeOut = 1.2;
    const buffer = 0.4;

    const getAlpha = (sceneIdx: number) => {
      const start = sceneIdx * sceneDur + buffer;
      const end = (sceneIdx + 1) * sceneDur - buffer;
      return `'min(min(max(0,t-${start})/${fadeIn},1),min(max(0,${end}-t)/${fadeOut},1))'`;
    };

    const floatingY = (baseY: string | number) => `(${baseY})-15*sin(2*PI*t/3)`;
    const driftingX = (baseX: string | number) => `(${baseX})+25*cos(2*PI*t/4.5)`;
    const subtlePulse = (baseSize: number) => `(${baseSize})*(1+0.03*sin(2*PI*t/3.5))`;
    const zoomIn = (baseSize: number, speed: number) => `(${baseSize}+${speed}*t)`;
    const slideInX = (centerX: string | number, sceneIdx: number, distance: number) => {
      const start = sceneIdx * sceneDur + buffer;
      const dur = 1.5;
      return `(${centerX})+(${distance})*(1-min(max((t-${start})/${dur},0),1))`;
    };

    const red = '0xD91E2F';
    const gold = '0xB8860B';
    const darkGold = '0x8B6A1F';
    const nearBlack = '0x1A1A1A';
    const cream = '0xFFF8DC';

    const extraOrVenueRaw = extraText1 ? extraText1 : venue;

    const extraLines = wrapWords(extraOrVenueRaw, 30, 2).filter(Boolean).map(escapeFFmpegText);
    const dateLines = wrapWords(date, 22, 2).filter(Boolean).map(escapeFFmpegText);
    const venueLines = wrapWords(venue, 28, 3).filter(Boolean).map(escapeFFmpegText);

    const filters: string[] = [
      `drawtext=fontfile=${lucienFont}:text='${textGroom}':expansion=none:x=(w-text_w)/2:y=${floatingY(
        'h*0.23',
      )}:fontsize=(${subtlePulse(260)})*${groomScale.toFixed(
        3,
      )}:fontcolor=${red}:borderw=3:bordercolor=${darkGold}@0.6:shadowcolor=black@0.45:shadowx=3:shadowy=3:alpha=${getAlpha(
        0,
      )}:fix_bounds=1`,
      `drawtext=fontfile=${lucienFont}:text='${textBride}':expansion=none:x=(w-text_w)/2:y=${floatingY(
        'h*0.34',
      )}:fontsize=(${subtlePulse(260)})*${brideScale.toFixed(
        3,
      )}:fontcolor=${red}:borderw=3:bordercolor=${darkGold}@0.6:shadowcolor=black@0.45:shadowx=3:shadowy=3:alpha=${getAlpha(
        0,
      )}:fix_bounds=1`,
    ];

    extraLines.forEach((line, idx) => {
      const y = idx === 0 ? 'h*0.50' : `h*0.50+${idx * 160}`;
      filters.push(
        `drawtext=fontfile=${futuraFont}:text='${line}':expansion=none:x='${slideInX(
          '(w-text_w)/2',
          1,
          -250,
        )}':y=${floatingY(
          y,
        )}:fontsize=${zoomIn(110, 0.8)}:fontcolor=${gold}:borderw=2:bordercolor=${cream}@0.4:shadowcolor=black@0.25:shadowx=3:shadowy=3:box=1:boxcolor=black@0.12:boxborderw=25:alpha=${getAlpha(
          1,
        )}:fix_bounds=1`,
      );
    });

    dateLines.forEach((line, idx) => {
      const y = idx === 0 ? 'h*0.58' : `h*0.58+${idx * 180}`;
      filters.push(
        `drawtext=fontfile=${loraFont}:text='${line}':expansion=none:x=${driftingX(
          '(w-text_w)/2',
        )}:y=${floatingY(
          y,
        )}:fontsize=155:fontcolor=${gold}:borderw=2:bordercolor=${darkGold}@0.5:shadowcolor=black@0.18:shadowx=2:shadowy=2:alpha=${getAlpha(
          2,
        )}:fix_bounds=1`,
      );
    });

    filters.push(
      `drawtext=fontfile=${loraFont}:text='VENUE':expansion=none:x=(w-text_w)/2:y=${floatingY(
        'h*0.74',
      )}:fontsize=135:fontcolor=${gold}:borderw=2:bordercolor=${darkGold}@0.4:shadowcolor=black@0.14:shadowx=2:shadowy=2:alpha=${getAlpha(
        2,
      )}:fix_bounds=1`,
    );

    venueLines.forEach((line, idx) => {
      const y = `h*0.81+${idx * 130}`;
      filters.push(
        `drawtext=fontfile=${loraFont}:text='${line}':expansion=none:x=(w-text_w)/2:y=${floatingY(
          y,
        )}:fontsize=115:fontcolor=${nearBlack}:borderw=1:bordercolor=${gold}@0.35:shadowcolor=${cream}@0.3:shadowx=2:shadowy=2:box=1:boxcolor=${cream}@0.06:boxborderw=20:alpha=${getAlpha(
          2,
        )}:fix_bounds=1`,
      );
    });

    const filterString = filters.join(',');

    const tmpRoot = path.join(os.tmpdir(), 'cinematic-video-editor');
    await fsp.mkdir(tmpRoot, { recursive: true });

    const outputName = `WeddingInvite-${Date.now()}-${crypto.randomUUID()}.mp4`;
    const outputPath = path.join(tmpRoot, outputName);

    await ensureFontConfig();

    const ffmpegArgs = [
      '-y',
      '-i',
      inputPath,
      '-vf',
      filterString,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '28',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'copy',
      outputPath,
    ];

    // Quick runtime check: verify the selected ffmpeg binary supports drawtext.
    try {
      const info = await runProcess(FFMPEG, ['-filters']);
      const combined = `${info.stdout || ''}\n${info.stderr || ''}`;
      if (!/drawtext/.test(combined)) {
        const preview = (combined || '').slice(0, 2000);
        throw new Error(
          `Selected ffmpeg (${FFMPEG}) does not support 'drawtext' filter. Filters list preview:\n${preview}`,
        );
      }
    } catch (err: any) {
      const details = String(err?.stderr || err?.message || err);
      throw new Error(
        `Failed to verify ffmpeg filters for binary ${FFMPEG}. Details: ${details}.\n` +
          `FONTCONFIG_PATH=${process.env.FONTCONFIG_PATH} FONTCONFIG_FILE=${process.env.FONTCONFIG_FILE} ` +
          `Ensure the deployment is using a binary that includes libfreetype/fontconfig and the drawtext filter. ` +
          `You can set the FFMPEG_PATH environment variable in Vercel to a binary that supports drawtext, or bundle a compatible ffmpeg.`,
      );
    }

    await runProcess(FFMPEG, ffmpegArgs);

    const outBuf = await fsp.readFile(outputPath);
    try {
      await fsp.unlink(outputPath);
    } catch {}

    res.statusCode = 200;
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `attachment; filename="${outputName}"`);
    res.end(outBuf);
  } catch (err: any) {
    const details = String(err?.stderr || err?.message || err);
    return sendJson(res, 500, { error: 'Failed to generate video', details });
  }
}
