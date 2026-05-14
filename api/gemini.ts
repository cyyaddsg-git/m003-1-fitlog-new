// Vercel serverless function — proxies authenticated requests to Gemini.
// Verifies the caller's Firebase ID token, then forwards the body to
// generativelanguage.googleapis.com using the shared GEMINI_API_KEY env var.
// The shared key never reaches the browser.

import admin from 'firebase-admin';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const ALLOWED_MODELS = new Set([
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
]);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

if (PROJECT_ID && !admin.apps.length) {
  // verifyIdToken needs only projectId; it fetches Google's public certs lazily.
  admin.initializeApp({ projectId: PROJECT_ID });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed' } });
    return;
  }

  if (!PROJECT_ID || !GEMINI_KEY) {
    res.status(500).json({ error: { message: 'Server not configured (missing env vars).' } });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const m = authHeader.match(/^Bearer (.+)$/);
  if (!m) {
    res.status(401).json({ error: { message: 'Missing bearer token' } });
    return;
  }

  try {
    await admin.auth().verifyIdToken(m[1]);
  } catch (e: any) {
    res.status(401).json({ error: { message: 'Invalid token', detail: e?.message } });
    return;
  }

  const payload = req.body || {};
  const { model, body } = payload;
  if (!model || !ALLOWED_MODELS.has(model)) {
    res.status(400).json({ error: { message: `Unknown or unsupported model: ${model}` } });
    return;
  }
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: { message: 'Missing request body' } });
    return;
  }

  const upstreamUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${GEMINI_KEY}`;

  const upstream = await fetch(upstreamUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader('Content-Type', 'application/json');
  res.send(text);
}
