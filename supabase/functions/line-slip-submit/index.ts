import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { userId, invoiceId, note, imageBase64, imageType } = await req.json()

  if (!userId || !imageBase64) {
    return Response.json({ error: 'missing required fields' }, { status: 400 })
  }

  // ตรวจสอบ tenant — อาจมีหลาย tenant ต่อ LINE account
  const { data: tenantRows } = await supabase
    .from('tenants')
    .select('id, full_name')
    .eq('line_user_id', userId)

  if (!tenantRows?.length) {
    return Response.json({ error: 'tenant not found' }, { status: 404 })
  }

  // ถ้าเลือก invoice มา ใช้ tenant_id จาก invoice นั้น
  let tenant = tenantRows[0]
  if (invoiceId) {
    const { data: inv } = await supabase
      .from('invoices')
      .select('tenant_id, tenants(id, full_name)')
      .eq('id', invoiceId)
      .maybeSingle()
    if (inv?.tenants) tenant = inv.tenants
  }

  // Decode base64 → Uint8Array
  const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
  const binary = atob(base64Data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  const ext = (imageType ?? '').includes('png') ? 'png' : 'jpg'
  const storagePath = `line-slips/${userId}/${Date.now()}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('payment-slips')
    .upload(storagePath, bytes, { contentType: imageType || 'image/jpeg', upsert: false })

  if (uploadErr) {
    return Response.json({ error: uploadErr.message }, { status: 500 })
  }

  // บันทึก submission (ถ้าเลือก invoice มาแล้ว ใส่ invoice_id ไว้เลย)
  await supabase.from('line_payment_submissions').insert({
    tenant_id:   tenant.id,
    line_user_id: userId,
    slip_url:    storagePath,
    invoice_id:  invoiceId ?? null,
    note:        note ?? null,
    status:      'pending',
  })

  // แจ้ง staff
  await supabase.from('notifications').insert({
    type:        'line_slip_received',
    title:       `ได้รับสลิปจาก ${tenant.full_name}`,
    body:        'กรุณาตรวจสอบและยืนยันการชำระเงิน',
    target_role: 'staff',
    link:        '/payments',
  })

  return Response.json({ ok: true })
})
