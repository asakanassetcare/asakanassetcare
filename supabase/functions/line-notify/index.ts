import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LINE_PUSH_API = 'https://api.line.me/v2/bot/message/push'

const MONTHS_TH = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม',
]

const TYPE_LABEL: Record<string, string> = {
  monthly_rent:     'ค่าเช่า',
  contract_initial: 'ประกัน+ล่วงหน้า',
  addon:            'ค่าบริการเสริม',
  final_settlement: 'เคลียร์ Move-out',
  booking_deposit:  'เงินจอง',
  other:            'อื่นๆ',
}

function thaiDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getUTCDate()} ${MONTHS_TH[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`
}

function thaiMonthYear(billing_period: string) {
  const [year, month] = billing_period.split('-')
  return `${MONTHS_TH[parseInt(month) - 1]} ${parseInt(year) + 543}`
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function pushLine(userId: string, messages: unknown[], token: string) {
  await fetch(LINE_PUSH_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ to: userId, messages }),
  })
}

function invoiceLabel(inv: any) {
  const base = TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type
  if (inv.invoice_type === 'monthly_rent' && inv.billing_period) {
    return `${base} ${thaiMonthYear(inv.billing_period)}`
  }
  return base
}

function buildSummaryFlex(tenantName: string, invoices: any[], bank: any) {
  const total = invoices.reduce((s, i) => s + Number(i.total_amount), 0)
  const totalFmt = total.toLocaleString('th-TH')

  // หาวันครบกำหนดที่เร็วที่สุด
  const earliestDue = invoices.reduce((min, i) => i.due_date < min ? i.due_date : min, invoices[0].due_date)
  const dueDate1 = thaiDate(earliestDue)
  const dueDate5 = thaiDate(addDays(earliestDue, 4))

  // rows ต่อ invoice
  const invoiceRows = invoices.flatMap((inv) => [
    {
      type: 'box', layout: 'horizontal',
      contents: [
        { type: 'text', text: invoiceLabel(inv), size: 'sm', color: '#374151', flex: 3, wrap: true },
        { type: 'text', text: `฿${Number(inv.total_amount).toLocaleString('th-TH')}`, size: 'sm', color: '#111827', weight: 'bold', align: 'end', flex: 2 },
      ],
    },
  ])

  const footerContents: unknown[] = []
  if (bank?.bank_name)      footerContents.push({ type: 'text', text: `ธนาคาร: ${bank.bank_name}${bank.branch ? ` สาขา${bank.branch}` : ''}`, size: 'xs', color: '#374151' })
  if (bank?.account_number) footerContents.push({ type: 'text', text: `เลขที่: ${bank.account_number}`, size: 'xs', color: '#374151' })
  if (bank?.account_name)   footerContents.push({ type: 'text', text: `ชื่อบัญชี: ${bank.account_name}`, size: 'xs', color: '#374151' })

  return {
    type: 'flex',
    altText: `สรุปยอดค้างชำระ ฿${totalFmt}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', paddingAll: 'lg',
        backgroundColor: '#2563EB',
        contents: [
          { type: 'text', text: '📄 สรุปยอดค้างชำระ', color: '#FFFFFF', size: 'md', weight: 'bold' },
          { type: 'text', text: tenantName, color: '#BFDBFE', size: 'sm', margin: 'xs' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'lg',
        contents: [
          ...invoiceRows,
          { type: 'separator', margin: 'lg' },
          {
            type: 'box', layout: 'horizontal', margin: 'lg',
            contents: [
              { type: 'text', text: 'รวมทั้งหมด', size: 'sm', color: '#111827', weight: 'bold', flex: 3 },
              { type: 'text', text: `฿${totalFmt}`, size: 'sm', color: '#2563EB', weight: 'bold', align: 'end', flex: 2 },
            ],
          },
          { type: 'separator', margin: 'lg' },
          { type: 'text', text: `ครบกำหนดวันที่ ${dueDate1}`, size: 'sm', color: '#374151', margin: 'lg' },
          { type: 'text', text: `ชำระได้ไม่เกิน ${dueDate5}`, size: 'sm', color: '#DC2626', weight: 'bold', margin: 'xs' },
          { type: 'text', text: 'โปรดชำระให้ทันเวลาเพื่อไม่ให้มีค่าปรับ', size: 'xs', color: '#6B7280', margin: 'sm', wrap: true },
        ],
      },
      footer: footerContents.length > 0 ? {
        type: 'box', layout: 'vertical', paddingAll: 'lg',
        backgroundColor: '#F9FAFB',
        contents: footerContents,
      } : undefined,
    },
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
    })
  }

  const token    = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')!
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { type } = await req.json()

  // ดึง bank account จาก settings
  const { data: settingRow } = await supabase.from('settings').select('value').eq('key', 'invoice').maybeSingle()
  const bank = settingRow?.value?.bank_account ?? {}

  // ดึง invoice ที่ค้างอยู่ทั้งหมด (ทุก type ทุกเดือน)
  const { data: invoices } = await supabase
    .from('invoices')
    .select(`
      id, invoice_number, invoice_type, billing_period, total_amount, due_date,
      rooms(room_number, buildings(name)),
      tenants(id, line_user_id, full_name)
    `)
    .in('status', ['pending', 'overdue'])

  // Group by (line_user_id + room_id) → แต่ละห้องได้ Flex Message แยกกัน
  const byRoom = new Map<string, { userId: string; name: string; roomName: string; invoices: any[] }>()
  for (const inv of invoices ?? []) {
    const userId = inv.tenants?.line_user_id
    if (!userId) continue
    const roomId  = inv.room_id ?? inv.rooms?.room_number ?? 'unknown'
    const key     = `${userId}__${roomId}`
    const roomName = `${inv.rooms?.buildings?.name ?? ''} ห้อง ${inv.rooms?.room_number ?? ''}`
    if (!byRoom.has(key)) byRoom.set(key, { userId, name: inv.tenants.full_name ?? '', roomName, invoices: [] })
    byRoom.get(key)!.invoices.push(inv)
  }

  let sent = 0

  if (type === 'invoice') {
    for (const { userId, name, roomName, invoices: roomInvoices } of byRoom.values()) {
      await pushLine(userId, [buildSummaryFlex(`${name} · ${roomName}`, roomInvoices, bank)], token)
      sent++
    }
  }

  if (type === 'reminder') {
    for (const { userId, roomName, invoices: roomInvoices } of byRoom.values()) {
      const total    = roomInvoices.reduce((s, i) => s + Number(i.total_amount), 0)
      const totalFmt = total.toLocaleString('th-TH')
      const text     = `⏰ แจ้งเตือน: วันนี้เป็นวันสุดท้ายชำระค่าเช่า\n${roomName}\nยอดค้างรวม ฿${totalFmt}\nหากชำระแล้วกรุณาแจ้งเจ้าหน้าที่\n📞 080-000-0000`
      await pushLine(userId, [{ type: 'text', text }], token)
      sent++
    }
  }

  return Response.json({ ok: true, sent })
})
