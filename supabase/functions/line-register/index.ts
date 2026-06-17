import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { accessToken, phone, roomNumber } = await req.json()

  if (!accessToken) {
    return Response.json({ error: 'missing accessToken' }, { status: 400, headers: CORS })
  }

  // Verify LINE identity server-side
  const lineRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!lineRes.ok) {
    return Response.json({ error: 'invalid_line_token' }, { status: 401, headers: CORS })
  }
  const { userId: lineUserId } = await lineRes.json()

  // เช็คว่าเคยลงทะเบียนแล้วหรือยัง (ไม่ส่ง phone/room มา)
  if (!phone && !roomNumber) {
    const { data } = await supabase
      .from('tenants')
      .select('id')
      .eq('line_user_id', lineUserId)
      .maybeSingle()
    return Response.json({ registered: !!data }, { headers: CORS })
  }

  // หาสัญญา active ที่เบอร์และเลขห้องตรงกัน
  const normalized = phone.replace(/\D/g, '')
  const { data: contract } = await supabase
    .from('contracts')
    .select('id, tenants!inner(id, full_name, line_user_id), rooms!inner(room_number)')
    .eq('status', 'active')
    .eq('tenants.phone', normalized)
    .eq('rooms.room_number', roomNumber.trim())
    .maybeSingle()

  if (!contract?.tenants) {
    return Response.json({ error: 'tenant_not_found' }, { status: 404, headers: CORS })
  }

  const tenant = contract.tenants as { id: string; full_name: string; line_user_id: string | null }

  if (tenant.line_user_id) {
    return Response.json({ error: 'already_linked' }, { status: 409, headers: CORS })
  }

  const { error: updateErr } = await supabase
    .from('tenants')
    .update({ line_user_id: lineUserId })
    .eq('id', tenant.id)

  if (updateErr) {
    return Response.json({ error: updateErr.message }, { status: 500, headers: CORS })
  }

  return Response.json({ ok: true }, { headers: CORS })
})
