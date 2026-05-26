import type { IncomingMessage, ServerResponse } from 'node:http';

type Template = { id: string; name: string; video: string };

const DEFAULT_TEMPLATES: Template[] = [
  { id: 'default', name: 'Default Wedding Template', video: '/templates/default/template.mp4' },
];

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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  const origin = getOrigin(req);
  const manifestUrl = `${origin}/templates/manifest.json`;

  try {
    const r = await fetch(manifestUrl, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`Manifest fetch failed: ${r.status}`);
    const data = await r.json();
    const templates = Array.isArray((data as any)?.templates) ? ((data as any).templates as Template[]) : DEFAULT_TEMPLATES;
    return sendJson(res, 200, { templates });
  } catch {
    return sendJson(res, 200, { templates: DEFAULT_TEMPLATES });
  }
}

