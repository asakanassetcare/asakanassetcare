import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LINE_PUSH_API = 'https://api.line.me/v2/bot/message/push'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const token    = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')!
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt        = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
  if (authErr || !user) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: CORS })
  }

  const { conversation_id, text } = await req.json()
  if (!conversation_id || !text?.trim()) {
    return Response.json({ error: 'invalid_request' }, { status: 400, headers: CORS })
  }

  const { data: conv } = await supabase
    .from('line_conversations')
    .select('id, line_user_id')
    .eq('id', conversation_id)
    .single()

  if (!conv) {
    return Response.json({ error: 'conversation_not_found' }, { status: 404, headers: CORS })
  }

  const pushRes = await fetch(LINE_PUSH_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ to: conv.line_user_id, messages: [{ type: 'text', text: text.trim() }] }),
  })

  if (!pushRes.ok) {
    const err = await pushRes.json().catch(() => ({}))
    console.error('LINE push failed', JSON.stringify(err))
    return Response.json({ error: 'line_push_failed', detail: err }, { status: 502, headers: CORS })
  }

  await supabase.from('line_messages').insert({
    conversation_id,
    direction:    'outbound',
    message_type: 'text',
    content:      text.trim(),
    sent_by:      user.id,
  })

  await supabase.from('line_conversations').update({
    last_message:    text.trim(),
    last_message_at: new Date().toISOString(),
    unread_count:    0,
  }).eq('id', conversation_id)

  return Response.json({ ok: true }, { headers: CORS })
})
