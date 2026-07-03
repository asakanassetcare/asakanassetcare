import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LINE_CONTENT_API = 'https://api-data.line.me/v2/bot/message'
const LINE_REPLY_API   = 'https://api.line.me/v2/bot/message/reply'
const LINE_PROFILE_API = 'https://api.line.me/v2/bot/profile'

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  const b64 = btoa(String.fromCharCode(...new Uint8Array(mac)))
  return b64 === signature
}

async function replyLine(replyToken: string, text: string, token: string) {
  await fetch(LINE_REPLY_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  })
}

async function getLineProfile(userId: string, token: string) {
  const res = await fetch(`${LINE_PROFILE_API}/${userId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (!res.ok) return null
  return res.json() as Promise<{ displayName: string; pictureUrl?: string }>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-line-signature',
      },
    })
  }

  const token    = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')!
  const secret   = Deno.env.get('LINE_CHANNEL_SECRET')!
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const rawBody   = await req.text()
  const signature = req.headers.get('x-line-signature') ?? ''

  if (!(await verifySignature(rawBody, signature, secret))) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { events } = JSON.parse(rawBody)

  for (const event of events ?? []) {
    const userId = event.source?.userId
    if (!userId) continue

    // ---- 1. Upsert conversation ----
    const { data: existingConv } = await supabase
      .from('line_conversations')
      .select('id')
      .eq('line_user_id', userId)
      .maybeSingle()

    let convId: string

    if (existingConv) {
      convId = existingConv.id
    } else {
      const profile = await getLineProfile(userId, token)
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('line_user_id', userId)
        .maybeSingle()

      const { data: newConv } = await supabase
        .from('line_conversations')
        .upsert({
          line_user_id: userId,
          display_name: profile?.displayName ?? userId,
          picture_url:  profile?.pictureUrl  ?? null,
          tenant_id:    tenant?.id           ?? null,
        }, { onConflict: 'line_user_id' })
        .select('id')
        .single()
      convId = newConv!.id
    }

    // ---- 2. Handle follow event ----
    if (event.type === 'follow') {
      const profile = await getLineProfile(userId, token)
      if (profile) {
        await supabase.from('line_conversations').update({
          display_name: profile.displayName,
          picture_url:  profile.pictureUrl ?? null,
        }).eq('id', convId)
      }
      continue
    }

    if (event.type !== 'message') continue

    // ---- 3. Save inbound message ----
    const msg        = event.message
    const replyToken = event.replyToken

    let content:  string | null = null
    let mediaUrl: string | null = null

    if (msg.type === 'text') {
      content = msg.text
    } else if (msg.type === 'image') {
      const imageRes = await fetch(`${LINE_CONTENT_API}/${msg.id}/content`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (imageRes.ok) {
        const blob        = await imageRes.blob()
        const storagePath = `line-chat/${userId}/${msg.id}.jpg`
        const { error }   = await supabase.storage
          .from('payment-slips')
          .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: true })
        if (!error) mediaUrl = storagePath
      }
    }

    const preview = msg.type === 'text'    ? (msg.text ?? '').slice(0, 80)
                  : msg.type === 'image'   ? '[รูปภาพ]'
                  : msg.type === 'sticker' ? '[สติกเกอร์]'
                  : `[${msg.type}]`

    await supabase.from('line_messages').insert({
      conversation_id: convId,
      direction:       'inbound',
      message_type:    msg.type,
      content,
      media_url:       mediaUrl,
      raw_payload:     msg,
    })

    await supabase.from('line_conversations').update({
      last_message:    preview,
      last_message_at: new Date().toISOString(),
    }).eq('id', convId)

    await supabase.rpc('increment_line_unread', { p_conv_id: convId })

    // ---- 4. Existing tenant + slip logic ----
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, full_name')
      .eq('line_user_id', userId)
      .maybeSingle()

    if (!tenant) {
      await replyLine(replyToken, 'ไม่พบข้อมูลผู้เช่าในระบบ กรุณาลงทะเบียน LINE ก่อนที่ลิงก์ที่แจ้งไว้', token)
      continue
    }

    if (msg.type === 'image' && mediaUrl) {
      await supabase.from('line_payment_submissions').insert({
        tenant_id:    tenant.id,
        line_user_id: userId,
        slip_url:     mediaUrl,
        status:       'pending',
      })

      await supabase.from('notifications').insert({
        type:        'line_slip_received',
        title:       `ได้รับสลิปจาก ${tenant.full_name}`,
        body:        'กรุณาตรวจสอบและเชื่อมโยงกับใบแจ้งหนี้',
        target_role: 'staff',
        link:        '/payments?tab=line_slips',
      })

      await replyLine(replyToken,
        `ได้รับสลิปการโอนเงินของคุณ ${tenant.full_name} แล้วครับ\nเจ้าหน้าที่จะตรวจสอบและยืนยันภายในไม่เกิน 1 ชั่วโมง`,
        token,
      )
    }
    // text/sticker: no auto-reply, admin handles via chat center
  }

  return Response.json({ ok: true })
})
