// Vercel serverless function — generates the monthly health report email.
// Verifies the caller's Firebase ID token, then sends the PDF (received as
// base64 from the browser) via Gmail SMTP using the workspace-canonical mailer.

import admin from 'firebase-admin';
import nodemailer from 'nodemailer';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_APP_PASSWORD = process.env.SMTP_APP_PASSWORD;
const REPORT_TO = process.env.REPORT_TO;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb', // PDF base64 can run ~80KB → 110KB encoded; 8mb is generous.
    },
  },
};

if (PROJECT_ID && !admin.apps.length) {
  admin.initializeApp({ projectId: PROJECT_ID });
}

function transporter() {
  if (!SMTP_USER || !SMTP_APP_PASSWORD) {
    throw new Error('SMTP_USER and SMTP_APP_PASSWORD must be set');
  }
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_APP_PASSWORD },
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed' } });
    return;
  }
  if (!PROJECT_ID || !SMTP_USER || !SMTP_APP_PASSWORD) {
    res.status(500).json({ error: { message: 'Server not configured (missing SMTP_* or FIREBASE_PROJECT_ID env vars).' } });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const m = authHeader.match(/^Bearer (.+)$/);
  if (!m) {
    res.status(401).json({ error: { message: 'Missing bearer token' } });
    return;
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(m[1]);
  } catch (e: any) {
    res.status(401).json({ error: { message: 'Invalid token', detail: e?.message } });
    return;
  }

  const { yearMonth, pdfBase64, filename } = req.body || {};
  if (!yearMonth || typeof yearMonth !== 'string') {
    res.status(400).json({ error: { message: 'yearMonth (YYYY-MM) required' } });
    return;
  }
  if (!pdfBase64 || typeof pdfBase64 !== 'string') {
    res.status(400).json({ error: { message: 'pdfBase64 required' } });
    return;
  }

  // Manual sends ("Email to me") always go to the signed-in user.
  // REPORT_TO is only a fallback for service contexts (cron, signed-out flows).
  const to = decoded.email || REPORT_TO;
  if (!to) {
    res.status(400).json({ error: { message: 'No recipient (signed-in user has no email and REPORT_TO unset)' } });
    return;
  }

  const subject = `Fitlog-Koala Health Report — ${yearMonth}`;
  const greeting = (decoded as any).name || (decoded.email && decoded.email.split('@')[0]) || 'YY';
  const html = `<div style="font-family:-apple-system,Helvetica,sans-serif;color:#171717;line-height:1.5;max-width:520px">
  <p>Hi ${greeting},</p>
  <p>Attached: your <strong>${yearMonth}</strong> Fitlog-Koala monthly health report.</p>
  <p style="color:#665f55;font-size:12px;margin-top:24px">Generated automatically from your FitLog entries. Not medical advice.</p>
</div>`;
  const text = `Hi ${greeting},\n\nAttached: your ${yearMonth} Fitlog-Koala monthly health report.\n\nGenerated automatically. Not medical advice.\n`;

  try {
    const info = await transporter().sendMail({
      from: SMTP_USER,
      to,
      subject,
      html,
      text,
      attachments: [{
        filename: filename || `Fitlog-Koala_Health-Report_${yearMonth}.pdf`,
        content: Buffer.from(pdfBase64, 'base64'),
        contentType: 'application/pdf',
      }],
    });
    res.status(200).json({ ok: true, to, messageId: info.messageId });
  } catch (e: any) {
    // Surface verbatim per the diagnose-don't-blame memory rule.
    console.error('[health-report] sendMail error', e);
    res.status(502).json({ error: { message: e?.message || String(e) } });
  }
}
