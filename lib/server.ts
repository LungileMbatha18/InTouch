import { createHmac } from 'node:crypto';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function configReady() {
  return Boolean(supabaseUrl && serviceKey);
}

export async function supabaseRequest(path: string, init: RequestInit = {}) {
  if (!supabaseUrl || !serviceKey) throw new Error('Database is not configured.');
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
}

export function hashIp(ip: string) {
  const secret = process.env.RATE_LIMIT_SECRET;
  if (!secret) throw new Error('Rate limiting is not configured.');
  return createHmac('sha256', secret).update(ip).digest('hex');
}

export async function sendEmail(kind: string, payload: Record<string, unknown>, submissionId: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const to = process.env.NOTIFY_EMAIL || 'mbatha_asl@icloud.com';
  if (!key || !from) return 'not_configured' as const;
  const subject = `IN TOUCH. — ${kind.replaceAll('_', ' ')}`;
  const body = JSON.stringify({ submissionId, kind, payload, receivedAt: new Date().toISOString() }, null, 2);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text: `A new IN TOUCH. submission was saved.\n\n${body}` }),
  });
  return response.ok ? 'sent' as const : 'failed' as const;
}

export async function sendWhatsApp(kind: string, payload: Record<string, unknown>, submissionId: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const to = (process.env.WHATSAPP_TO || '27614519705').replace(/\D/g, '');
  if (!token || !phoneId) return 'not_configured' as const;
  const summary = Object.entries(payload).map(([k, v]) => `${k}: ${String(v)}`).join('\n').slice(0, 2500);
  const text = `IN TOUCH. — New ${kind.replaceAll('_', ' ')}\nID: ${submissionId}\n${summary || '(No additional details)'}`.slice(0, 4000);
  const response = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: text } }),
  });
  return response.ok ? 'sent' as const : 'failed' as const;
}
