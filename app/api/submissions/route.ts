import { NextRequest, NextResponse } from 'next/server';
import { configReady, hashIp, sendEmail, sendWhatsApp, supabaseRequest } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const allowedKinds = new Set(['response', 'date_suggestion', 'song_suggestion', 'personal_note']);
const clean = (value: unknown, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';

function validate(kind: string, raw: unknown): { payload?: Record<string, unknown>; error?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Please check the form and try again.' };
  const p = raw as Record<string, unknown>;
  if (kind === 'response') {
    if (!['yes', 'talk'].includes(String(p.choice))) return { error: 'Choose one of the available responses.' };
    return { payload: { choice: p.choice, message: clean(p.message, 1500) } };
  }
  if (kind === 'date_suggestion') {
    const date = clean(p.date, 10), time = clean(p.time, 20), activity = clean(p.activity, 100);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !time || !['Coffee and conversation','Food and a walk','Explore matching tattoo designs together','You plan a surprise','I have another idea'].includes(activity)) return { error: 'Please provide a valid date, time, and activity.' };
    const [y,m,d] = date.split('-').map(Number); const dt = new Date(`${date}T00:00:00`);
    if (dt.getFullYear() !== y || dt.getMonth()+1 !== m || dt.getDate() !== d) return { error: 'That date is not valid.' };
    const today = new Date(); const todayLocal = new Date(today.getFullYear(),today.getMonth(),today.getDate());
    if (dt < todayLocal) return { error: 'Please choose today or a future date.' };
    return { payload: { date, time, activity, alternative: clean(p.alternative, 250), note: clean(p.note, 1200), status: 'suggested_not_confirmed' } };
  }
  if (kind === 'song_suggestion') {
    const song = clean(p.song, 180);
    if (!song) return { error: 'Please add a song title or link.' };
    return { payload: { song, artist: clean(p.artist, 180), reason: clean(p.reason, 700) } };
  }
  const message = clean(p.message, 2000);
  if (!message) return { error: 'Please write a message before sending.' };
  return { payload: { name: clean(p.name, 100), message } };
}

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > 12000) return NextResponse.json({ error: 'That submission is too large. Please shorten it and try again.' }, { status: 413 });
  if (!configReady() || !process.env.RATE_LIMIT_SECRET) return NextResponse.json({ error: 'Submissions are not configured yet. Please try again later.' }, { status: 503 });
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (origin && host) {
    try { if (new URL(origin).host !== host) return NextResponse.json({ error: 'Request could not be verified.' }, { status: 403 }); }
    catch { return NextResponse.json({ error: 'Request could not be verified.' }, { status: 403 }); }
  }
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const kind = clean(body?.kind, 40);
  const key = clean(body?.idempotencyKey, 60);
  if (!allowedKinds.has(kind) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) return NextResponse.json({ error: 'Invalid submission. Please refresh and try again.' }, { status: 400 });
  const checked = validate(kind, body.payload);
  if (!checked.payload) return NextResponse.json({ error: checked.error }, { status: 400 });
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  let limited = false;
  try {
    const ipHash = hashIp(forwarded);
    const windowStart = new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString();
    const rate = await supabaseRequest('rpc/consume_submission_rate_limit', { method: 'POST', body: JSON.stringify({ p_ip_hash: ipHash, p_window_start: windowStart, p_limit: 8 }) });
    if (!rate.ok) throw new Error('Rate limit check failed');
    limited = (await rate.json()) === false;
  } catch { return NextResponse.json({ error: 'Submissions are temporarily unavailable. Please try again later.' }, { status: 503 }); }
  if (limited) return NextResponse.json({ error: 'Too many submissions. Please try again in a little while.' }, { status: 429 });

  let saved: any;
  try {
    const response = await supabaseRequest('proposal_submissions?on_conflict=idempotency_key', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ idempotency_key: key, kind, payload: checked.payload }),
    });
    if (!response.ok) throw new Error('Database insert failed');
    const rows = await response.json();
    if (Array.isArray(rows) && rows.length) saved = rows[0];
    else {
      const existing = await supabaseRequest(`proposal_submissions?idempotency_key=eq.${key}&select=id,kind,notification_email,notification_whatsapp`);
      if (!existing.ok) throw new Error('Could not verify existing submission');
      const found = await existing.json(); saved = found[0];
      if (!saved) throw new Error('Submission save could not be confirmed');
      return NextResponse.json({ saved: true, duplicate: true, id: saved.id, notifications: { email: saved.notification_email, whatsapp: saved.notification_whatsapp } });
    }
  } catch { return NextResponse.json({ error: 'Your submission could not be saved. Nothing has been marked as sent; please try again.' }, { status: 503 }); }

  // Attempt each notification independently. Database save has already succeeded.
  const outcomes = await Promise.allSettled([
    sendEmail(kind, checked.payload, saved.id),
    sendWhatsApp(kind, checked.payload, saved.id),
  ]);
  const email = outcomes[0].status === 'fulfilled' ? outcomes[0].value : 'failed';
  const whatsapp = outcomes[1].status === 'fulfilled' ? outcomes[1].value : 'failed';
  try {
    await supabaseRequest(`proposal_submissions?id=eq.${saved.id}`, { method: 'PATCH', body: JSON.stringify({ notification_email: email, notification_whatsapp: whatsapp }) });
  } catch { /* preserve original submission even if delivery-status update fails */ }
  return NextResponse.json({ saved: true, id: saved.id, notifications: { email, whatsapp } }, { status: email === 'sent' && whatsapp === 'sent' ? 201 : 207 });
}
