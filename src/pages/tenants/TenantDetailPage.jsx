import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { ChevronRight, Save, Plus, Trash2, Car, Check, X, Download, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import Badge from '../../components/ui/Badge'
import IdCardField from '../../components/tenants/IdCardField'
import DocumentUpload from '../../components/shared/DocumentUpload'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatThaiDate } from '../../lib/date'

const MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
const INV_TYPE_LABEL = {
  contract_initial: 'ค่าประกัน+ล่วงหน้า',
  monthly_rent:     'ค่าเช่า',
  addon:            'ค่าบริการเสริม',
  final_settlement: 'เคลียร์ Move-out',
  booking_deposit:  'เงินมัดจำจอง',
}
function invDesc(inv) {
  if (!inv) return ''
  const base = INV_TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type ?? ''
  if (inv.billing_period) {
    const [y, m] = inv.billing_period.split('-')
    return `${base} ${MONTHS_SHORT[parseInt(m) - 1]} ${parseInt(y) + 543}`
  }
  return base
}

function N(v) { return Number(v) || 0 }

function safeFileName(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'customer'
}

function sumApprovedBasePayments(payments = []) {
  return payments
    .filter(p => p.status === 'approved')
    .reduce((sum, p) => sum + Math.max(0, N(p.amount) - N(p.penalty_amount)), 0)
}

async function saveCustomerPaymentCardXlsx({ tenant, contractLabel, invoices }) {
  const activeInvoices = invoices.filter(inv => !['cancelled', 'rejected'].includes(inv.status))
  const approvedPayments = activeInvoices.flatMap(inv => (inv.payments ?? []).filter(p => p.status === 'approved'))
  const invoiceTotal    = activeInvoices.reduce((sum, inv) => sum + N(inv.total_amount), 0)
  const approvedBasePaid = approvedPayments.reduce((sum, p) => sum + Math.max(0, N(p.amount) - N(p.penalty_amount)), 0)
  const approvedPenalty  = approvedPayments.reduce((sum, p) => sum + N(p.penalty_amount), 0)
  const approvedPaid     = approvedPayments.reduce((sum, p) => sum + N(p.amount), 0)
  const balance          = invoiceTotal - approvedBasePaid

  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'AssetCare'
  const ws = wb.addWorksheet('Customer Card')

  const COLS = [
    { header: 'ลำดับ',           width: 7  },
    { header: 'วันที่ใบแจ้งหนี้', width: 16 },
    { header: 'วันครบกำหนด',     width: 16 },
    { header: 'งวด/รายการ',      width: 24 },
    { header: 'เลขที่ Invoice',   width: 18 },
    { header: 'เลขที่สัญญา',     width: 18 },
    { header: 'อาคาร/ห้อง',      width: 18 },
    { header: 'ยอดเรียกเก็บ',    width: 14 },
    { header: 'วันปรับ',          width: 9  },
    { header: 'ค่าปรับ',          width: 12 },
    { header: 'ยอดสุทธิ',         width: 12 },
    { header: 'วันที่ชำระ',       width: 16 },
    { header: 'เลขที่ Payment',   width: 36 },
    { header: 'รับชำระ',          width: 12 },
    { header: 'สถานะ Invoice',    width: 16 },
    { header: 'สถานะ Payment',    width: 16 },
    { header: 'คงเหลือ Invoice',  width: 14 },
    { header: 'อ้างอิงธนาคาร',   width: 18 },
    { header: 'ผู้บันทึก',        width: 18 },
    { header: 'หมายเหตุ',         width: 28 },
  ]
  const CC = COLS.length
  ws.columns = COLS.map(c => ({ width: c.width }))

  // ── Row 1: Title ──
  ws.mergeCells(1, 1, 1, CC)
  const titleCell = ws.getCell('A1')
  titleCell.value = 'Customer Payment Card'
  titleCell.font  = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } }
  titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 32

  // ── Rows 2–3: Info ──
  const INFO_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F1FB' } }
  const fillRow = (rowNum) => { for (let c = 1; c <= CC; c++) ws.getRow(rowNum).getCell(c).fill = INFO_FILL }

  ws.mergeCells(2, 2, 2, 3); ws.mergeCells(2, 5, 2, CC)
  ws.mergeCells(3, 2, 3, 3); ws.mergeCells(3, 5, 3, CC)
  fillRow(2); fillRow(3)
  ;[
    [2, 'ลูกค้า', tenant?.full_name ?? '', 'เบอร์โทร', tenant?.phone ?? ''],
    [3, 'สัญญา',  contractLabel,           'Export เมื่อ', formatThaiDate(new Date())],
  ].forEach(([rowNum, l1, v1, l2, v2]) => {
    const r = ws.getRow(rowNum)
    r.height = 20
    r.getCell(1).value = l1; r.getCell(1).font = { bold: true, size: 12 }
    r.getCell(2).value = v1; r.getCell(2).font = { size: 12 }
    r.getCell(4).value = l2; r.getCell(4).font = { bold: true, size: 12 }
    r.getCell(5).value = v2; r.getCell(5).font = { size: 12 }
  })

  // ── Row 4: spacer ──
  ws.getRow(4).height = 6

  // ── Rows 5–9: Summary ──
  const SUM_HDR = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
  const SUM_ROW = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
  ;[
    [5, 'สรุปยอด',          'จำนวนเงิน',   false, true ],
    [6, 'ยอดใบแจ้งหนี้รวม', invoiceTotal,   true,  false],
    [7, 'รับชำระแล้ว',      approvedPaid,   true,  false],
    [8, 'ค่าปรับที่รับแล้ว', approvedPenalty, true, false],
    [9, 'คงค้าง',           balance,         true,  false],
  ].forEach(([rowNum, label, val, isNum, isHdr]) => {
    const fill = isHdr ? SUM_HDR : SUM_ROW
    const r = ws.getRow(rowNum)
    r.height = 18
    for (let c = 1; c <= CC; c++) r.getCell(c).fill = fill
    r.getCell(1).value = label; r.getCell(1).font = { bold: true, size: 12 }
    r.getCell(2).value = val;   r.getCell(2).font = { bold: isHdr, size: 12 }
    if (isNum) { r.getCell(2).numFmt = '#,##0.00'; r.getCell(2).alignment = { horizontal: 'right' } }
  })

  // ── Row 10: spacer ──
  ws.getRow(10).height = 6

  // ── Row 11: Column headers ──
  const HDR_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
  const hdrBorder = { style: 'thin', color: { argb: 'FF475569' } }
  const hdrRow = ws.getRow(11)
  hdrRow.height = 22
  COLS.forEach((col, i) => {
    const cell = hdrRow.getCell(i + 1)
    cell.value = col.header
    cell.font  = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
    cell.fill  = HDR_FILL
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = { top: hdrBorder, bottom: hdrBorder, left: hdrBorder, right: hdrBorder }
  })

  // ── Data rows ──
  const NUM_CI    = [8, 10, 11, 14, 17]
  const CENTER_CI = [1, 9]
  const hairLine  = { style: 'hair', color: { argb: 'FFE2E8F0' } }
  let index = 1

  for (const inv of invoices) {
    const payments = inv.payments?.length ? inv.payments : [null]
    const invoiceBalance = Math.max(0, N(inv.total_amount) - sumApprovedBasePayments(inv.payments ?? []))

    for (const p of payments) {
      const penalty = N(p?.penalty_amount)
      const rowFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } }

      const dataRow = ws.addRow([
        index++,
        inv.issue_date  ? formatThaiDate(inv.issue_date)  : '',
        inv.due_date    ? formatThaiDate(inv.due_date)    : '',
        invDesc(inv),
        inv.invoice_number ?? '',
        inv.contracts?.contract_number ?? '',
        [inv.rooms?.buildings?.name, inv.rooms?.room_number].filter(Boolean).join(' / '),
        N(inv.total_amount),
        p?.penalty_days ?? 0,
        penalty,
        N(inv.total_amount) + penalty,
        p?.paid_date ? formatThaiDate(p.paid_date) : '',
        p?.id ?? '',
        N(p?.amount),
        inv.status ?? '',
        p?.status ?? '',
        invoiceBalance,
        p?.bank_reference ?? '',
        p?.profiles?.full_name ?? '',
        [inv.note, p?.note].filter(Boolean).join(' | '),
      ])

      dataRow.height = 18
      dataRow.eachCell({ includeEmpty: true }, cell => {
        cell.font   = { size: 11 }
        cell.fill   = rowFill
        cell.border = { bottom: hairLine, right: hairLine }
      })
      NUM_CI.forEach(ci    => { dataRow.getCell(ci).numFmt = '#,##0.00'; dataRow.getCell(ci).alignment = { horizontal: 'right' } })
      CENTER_CI.forEach(ci => { dataRow.getCell(ci).alignment = { horizontal: 'center' } })
    }
  }

  // ── Page setup ──
  ws.pageSetup.paperSize   = 9
  ws.pageSetup.orientation = 'landscape'
  ws.pageSetup.fitToPage   = true
  ws.pageSetup.fitToWidth  = 1
  ws.pageSetup.fitToHeight = 0
  ws.pageSetup.printTitlesRow = '$1:$11'
  ws.pageSetup.margins = { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 }
  ws.headerFooter.oddHeader = `&L&"Arial,Bold"${tenant?.full_name ?? ''}&R${contractLabel}`
  ws.headerFooter.oddFooter = `&L&"Arial,Regular"AssetCare&Cหน้า &P / &N&R&D`
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 11, activeCell: 'A12' }]

  // ── Download ──
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `customer_card_${safeFileName(tenant?.full_name)}.xlsx`; a.click()
  URL.revokeObjectURL(url)
}

const TABS = [
  { id: 'info',      label: 'ข้อมูล' },
  { id: 'docs',      label: 'เอกสาร' },
  { id: 'contracts', label: 'ประวัติการเช่า' },
  { id: 'payments',  label: 'ประวัติการชำระ' },
  { id: 'moveouts',  label: 'ประวัติการย้ายออก' },
]

const EMPTY_FORM = {
  full_name: '', phone: '', email: '', line_id: '',
  birth_date: '',
  address_house_no: '', address_road: '', address_subdistrict: '', address_district: '', address_province: '',
  address: '', emergency_contact_name: '', emergency_contact_phone: '',
  note: '',
}

export default function TenantDetailPage() {
  const { tenantId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isNew = tenantId === 'new'

  const [tenant, setTenant] = useState(null)
  const [loading, setLoading] = useState(!isNew)
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab')
    return ['info','docs','contracts','payments','moveouts'].includes(t) ? t : 'info'
  })
  const [form, setForm] = useState(EMPTY_FORM)
  const [idCard,      setIdCard]      = useState('')
  const [isForeigner, setIsForeigner] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const [contracts, setContracts] = useState([])
  const [payments, setPayments] = useState([])
  const [paymentContractId, setPaymentContractId] = useState('')
  const [moveOuts, setMoveOuts] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [exportingPayments, setExportingPayments] = useState(false)

  const [vehicles,     setVehicles]    = useState([])
  const [vPlate,       setVPlate]      = useState('')
  const [vNote,        setVNote]       = useState('')
  const [vAdding,      setVAdding]     = useState(false)
  const [vShowForm,    setVShowForm]   = useState(false)

  useEffect(() => {
    if (!isNew) { setPaymentContractId(''); fetchTenant(); fetchVehicles() }
  }, [tenantId])

  useEffect(() => {
    if (tab === 'contracts' && contracts.length === 0) fetchContracts()
    if (tab === 'payments') {
      if (contracts.length === 0) fetchContracts(false)
      fetchPayments()
    }
    if (tab === 'moveouts'  && moveOuts.length  === 0) fetchMoveOuts()
  }, [tab, paymentContractId])

  async function fetchTenant() {
    const { data } = await supabase
      .from('tenants')
      .select('id, full_name, phone, email, line_id, line_user_id, birth_date, address_house_no, address_road, address_subdistrict, address_district, address_province, address, emergency_contact_name, emergency_contact_phone, vehicle_plate, note, id_card_last4, id_card_encrypted, is_foreigner')
      .eq('id', tenantId)
      .single()
    if (!data) { navigate('/tenants'); return }
    setTenant(data)
    setIsForeigner(data.is_foreigner ?? false)
    setForm({
      full_name: data.full_name, phone: data.phone, email: data.email ?? '',
      line_id: data.line_id ?? '', birth_date: data.birth_date ?? '',
      address_house_no: data.address_house_no ?? '', address_road: data.address_road ?? '',
      address_subdistrict: data.address_subdistrict ?? '', address_district: data.address_district ?? '',
      address_province: data.address_province ?? '', address: data.address ?? '',
      emergency_contact_name: data.emergency_contact_name ?? '',
      emergency_contact_phone: data.emergency_contact_phone ?? '',
      note: data.note ?? '',
    })
    setLoading(false)
  }

  async function fetchContracts(showLoading = true) {
    if (showLoading) setHistoryLoading(true)
    const { data } = await supabase
      .from('contracts')
      .select('id, contract_number, status, contract_start_date, contract_end_date, rooms(room_number, buildings(name))')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    setContracts(data ?? [])
    if (showLoading) setHistoryLoading(false)
  }

  async function fetchPayments() {
    setHistoryLoading(true)
    let query = supabase
      .from('payments')
      .select('id, amount, status, paid_date, invoices!inner(id, invoice_number, invoice_type, billing_period, tenant_id, contract_id)')
      .eq('invoices.tenant_id', tenantId)

    if (paymentContractId) query = query.eq('invoices.contract_id', paymentContractId)

    const { data } = await query
      .order('created_at', { ascending: false })
      .limit(50)
    setPayments(data ?? [])
    setHistoryLoading(false)
  }

  async function handleExportPaymentCard() {
    setExportingPayments(true)
    try {
      let query = supabase
        .from('invoices')
        .select(`
          id, invoice_number, invoice_type, billing_period, issue_date, due_date,
          total_amount, status, note, contract_id,
          rooms(room_number, buildings(name)),
          contracts(contract_number),
          payments(id, amount, status, paid_date, bank_reference, note, penalty_amount, penalty_days, profiles!recorded_by(full_name))
        `)
        .eq('tenant_id', tenantId)

      if (paymentContractId) query = query.eq('contract_id', paymentContractId)

      const { data, error } = await query.order('issue_date', { ascending: true })
      if (error) throw error

      const selectedContract = contracts.find(c => c.id === paymentContractId)
      const contractLabel = selectedContract
        ? [selectedContract.contract_number, selectedContract.rooms?.buildings?.name, selectedContract.rooms?.room_number].filter(Boolean).join(' · ')
        : 'ทุกสัญญา'
      const invoices = (data ?? []).map(inv => ({
        ...inv,
        payments: [...(inv.payments ?? [])].sort((a, b) => String(a.paid_date ?? '').localeCompare(String(b.paid_date ?? ''))),
      }))

      await saveCustomerPaymentCardXlsx({ tenant, contractLabel, invoices })
    } catch (err) {
      alert(`Export ไม่สำเร็จ: ${err.message}`)
    } finally {
      setExportingPayments(false)
    }
  }

  async function fetchMoveOuts() {
    setHistoryLoading(true)
    const { data } = await supabase
      .from('move_outs')
      .select('id, move_out_date, status, refund_amount, contracts(contract_number, rooms(room_number))')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    setMoveOuts(data ?? [])
    setHistoryLoading(false)
  }

  async function fetchVehicles() {
    const { data } = await supabase.from('tenant_vehicles')
      .select('id, plate_number, note, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at')
    setVehicles(data ?? [])
  }

  async function handleAddVehicle(e) {
    e.preventDefault()
    if (!vPlate.trim()) return
    setVAdding(true)
    const { error } = await supabase.from('tenant_vehicles').insert({
      tenant_id:    tenantId,
      plate_number: vPlate.trim(),
      note:         vNote.trim() || null,
    })
    setVAdding(false)
    if (error) { alert(error.message); return }
    setVPlate(''); setVNote(''); setVShowForm(false)
    fetchVehicles()
  }

  async function handleDeleteVehicle(id) {
    if (!confirm('ลบทะเบียนนี้?')) return
    await supabase.from('tenant_vehicles').delete().eq('id', id)
    fetchVehicles()
  }

  function set(field, value) { setForm(p => ({ ...p, [field]: value })); setSaved(false) }

  function parseRpcError(msg = '') {
    if (msg.includes('เลขบัตรประชาชนนี้มีในระบบแล้ว')) return 'เลขบัตรประชาชนนี้มีในระบบแล้ว'
    if (msg.includes('เลขบัตรประชาชนต้องมี 13 หลัก'))  return 'เลขบัตรประชาชนต้องมี 13 หลัก'
    if (msg.includes('กรุณากรอกเลขบัตรประชาชน'))       return 'กรุณากรอกเลขบัตรประชาชน'
    if (msg.includes('unique') || msg.includes('duplicate')) return 'เลขบัตรประชาชนนี้มีในระบบแล้ว'
    return msg
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.full_name.trim()) { setError('กรุณากรอกชื่อ-นามสกุล'); return }
    if (!form.phone.trim())     { setError('กรุณากรอกเบอร์โทร'); return }
    if (!form.birth_date)       { setError('กรุณากรอกวันเกิด'); return }
    if (isNew && !idCard.trim()) { setError(isForeigner ? 'กรุณากรอกเลขหนังสือเดินทาง' : 'กรุณากรอกเลขบัตรประชาชน (ใช้เป็นตัวระบุหลัก)'); return }
    if (!form.address_house_no.trim())    { setError('กรุณากรอกบ้านเลขที่'); return }
    if (!form.address_road.trim())        { setError('กรุณากรอกถนน'); return }
    if (!form.address_subdistrict.trim()) { setError('กรุณากรอกแขวง/ตำบล'); return }
    if (!form.address_district.trim())    { setError('กรุณากรอกเขต/อำเภอ'); return }
    if (!form.address_province.trim())    { setError('กรุณากรอกจังหวัด'); return }
    if (!form.emergency_contact_name.trim())  { setError('กรุณากรอกชื่อผู้ติดต่อฉุกเฉิน'); return }
    if (!form.emergency_contact_phone.trim()) { setError('กรุณากรอกเบอร์โทรผู้ติดต่อฉุกเฉิน'); return }
    setError('')
    setSaving(true)

    const extraFields = {
      birth_date:         form.birth_date         || null,
      address_house_no:   form.address_house_no.trim()   || null,
      address_road:       form.address_road.trim()       || null,
      address_subdistrict:form.address_subdistrict.trim()|| null,
      address_district:   form.address_district.trim()   || null,
      address_province:   form.address_province.trim()   || null,
    }
    const payload = {
      full_name: form.full_name.trim(), phone: form.phone.trim(),
      email: form.email.trim() || null, line_id: form.line_id.trim() || null,
      address: form.address.trim() || null,
      emergency_contact_name: form.emergency_contact_name.trim() || null,
      emergency_contact_phone: form.emergency_contact_phone.trim() || null,
      note: form.note.trim() || null,
      is_foreigner: isForeigner,
      ...extraFields,
    }

    if (isNew) {
      // Atomic RPC: duplicate check + insert + encrypt in one transaction
      const { data: newId, error: rpcErr } = await supabase.rpc('create_tenant', {
        p_full_name:               payload.full_name,
        p_phone:                   payload.phone,
        p_id_card:                 idCard.trim(),
        p_is_foreigner:            isForeigner,
        p_email:                   payload.email,
        p_line_id:                 payload.line_id,
        p_address:                 payload.address,
        p_emergency_contact_name:  payload.emergency_contact_name,
        p_emergency_contact_phone: payload.emergency_contact_phone,
        p_vehicle_plate:           null,
        p_note:                    payload.note,
      })
      if (rpcErr) { setSaving(false); setError(parseRpcError(rpcErr.message)); return }
      // Update extra fields not supported by RPC
      if (Object.values(extraFields).some(v => v !== null)) {
        await supabase.from('tenants').update(extraFields).eq('id', newId)
      }
      setSaving(false)
      navigate(`/tenants/${newId}`, { replace: true })
    } else {
      const { error: updateErr } = await supabase.from('tenants').update(payload).eq('id', tenantId)
      if (updateErr) { setSaving(false); setError(updateErr.message); return }
      if (idCard.trim()) {
        const { error: idErr } = await supabase.rpc('set_tenant_id_card', { p_tenant_id: tenantId, p_id_card: idCard.trim() })
        if (idErr) { setSaving(false); setError(parseRpcError(idErr.message)); return }
      }
      setSaving(false)
      setIdCard('')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      fetchTenant()
    }
  }

  if (loading) return <PageSpinner />

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link to="/tenants" className="hover:text-blue-600">ผู้เช่า</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900">{isNew ? 'เพิ่มผู้เช่าใหม่' : tenant?.full_name}</span>
      </div>

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">{isNew ? 'เพิ่มผู้เช่า' : tenant?.full_name}</h1>
        {!isNew && tenant?.phone && <p className="mt-1 text-sm text-gray-500">{tenant.phone}</p>}
        {!isNew && (
          <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            tenant?.line_user_id ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500'
          }`}>
            {tenant?.line_user_id
              ? <><Check className="h-3 w-3" /> LINE เชื่อมต่อแล้ว</>
              : <><X className="h-3 w-3" /> ยังไม่เชื่อม LINE</>
            }
          </div>
        )}
      </div>

      {/* Tabs */}
      {!isNew && (
        <div className="mb-6 flex gap-1 border-b border-gray-200 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors ${tab === t.id ? 'border-b-2 border-blue-600 text-blue-700 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab: Info */}
      {(tab === 'info' || isNew) && (
        <Card className="max-w-2xl">
          <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
            <Input label="ชื่อ-นามสกุล" required value={form.full_name} onChange={e => set('full_name', e.target.value)} wrapperClass="col-span-2" />
            <Input label="เบอร์โทร" required phone value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="0810000000" />
            <Input label="อีเมล" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
            <Input label="Line ID" value={form.line_id} onChange={e => set('line_id', e.target.value)} placeholder="@lineid" />
            <Input label="วันเกิด" required type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} />

            <div className="col-span-2">
              <IdCardField
                tenantId={isNew ? null : tenantId}
                hasEncrypted={!!tenant?.id_card_encrypted}
                last4={tenant?.id_card_last4}
                isForeigner={isForeigner}
                onForeignerChange={v => { setIsForeigner(v); setIdCard('') }}
                onChange={val => setIdCard(val)}
                required={isNew}
              />
            </div>

            <div className="col-span-2">
              <p className="mb-2 text-sm font-medium text-gray-700">ที่อยู่ตามบัตรประชาชน <span className="text-red-500">*</span></p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="บ้านเลขที่" required value={form.address_house_no} onChange={e => set('address_house_no', e.target.value)} />
                <Input label="ถนน" required value={form.address_road} onChange={e => set('address_road', e.target.value)} />
                <Input label="แขวง/ตำบล" required value={form.address_subdistrict} onChange={e => set('address_subdistrict', e.target.value)} />
                <Input label="เขต/อำเภอ" required value={form.address_district} onChange={e => set('address_district', e.target.value)} />
                <Input label="จังหวัด" required value={form.address_province} onChange={e => set('address_province', e.target.value)} />
              </div>
            </div>

            <Textarea label="ที่อยู่อื่น (ถ้ามี)" rows={2} value={form.address} onChange={e => set('address', e.target.value)} wrapperClass="col-span-2" />

            <div className="col-span-2">
              <p className="mb-3 text-sm font-medium text-gray-700">ผู้ติดต่อฉุกเฉิน <span className="text-red-500">*</span></p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="ชื่อ" required value={form.emergency_contact_name} onChange={e => set('emergency_contact_name', e.target.value)} />
                <Input label="เบอร์โทร" required phone value={form.emergency_contact_phone} onChange={e => set('emergency_contact_phone', e.target.value)} />
              </div>
            </div>

            <Textarea label="หมายเหตุ" rows={2} value={form.note} onChange={e => set('note', e.target.value)} wrapperClass="col-span-2" />

            {error && <div className="col-span-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">{error}</div>}

            <div className="col-span-2 flex items-center gap-3 border-t border-gray-100 pt-4">
              <Button type="submit" loading={saving} icon={<Save className="h-4 w-4" />}>บันทึก</Button>
              {saved && <span className="text-sm text-green-600">บันทึกแล้ว ✓</span>}
            </div>
          </form>
        </Card>
      )}

      {/* Vehicle management (info tab, existing tenants only) */}
      {(tab === 'info' && !isNew) && (
        <Card className="max-w-2xl mt-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Car className="h-4 w-4 text-gray-400" /> ทะเบียนรถ ({vehicles.length})
            </h2>
            <button type="button"
              onClick={() => { setVShowForm(v => !v); setVPlate(''); setVNote('') }}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
              <Plus className="h-3.5 w-3.5" /> เพิ่มทะเบียน
            </button>
          </div>

          {vShowForm && (
            <form onSubmit={handleAddVehicle} className="mb-4 flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3">
              <div className="flex gap-2">
                <input type="text" value={vPlate} onChange={e => setVPlate(e.target.value)}
                  placeholder="ทะเบียน *" required
                  className="h-8 flex-1 rounded-lg border border-gray-300 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="text" value={vNote} onChange={e => setVNote(e.target.value)}
                  placeholder="หมายเหตุ (เช่น รถยนต์คันที่ 2)"
                  className="h-8 w-44 rounded-lg border border-gray-300 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={vAdding}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {vAdding ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
                <button type="button" onClick={() => setVShowForm(false)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                  ยกเลิก
                </button>
              </div>
            </form>
          )}

          {vehicles.length === 0 ? (
            <p className="text-sm text-gray-400">ยังไม่มีทะเบียนรถ</p>
          ) : (
            <div className="flex flex-col gap-2">
              {vehicles.map(v => (
                <div key={v.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                  <div>
                    <p className="font-mono text-sm font-semibold text-gray-800">{v.plate_number}</p>
                    {v.note && <p className="text-xs text-gray-400">{v.note}</p>}
                  </div>
                  <button type="button" onClick={() => handleDeleteVehicle(v.id)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Tab: Documents */}
      {tab === 'docs' && (
        <Card className="max-w-2xl">
          <DocumentUpload
            refTable="tenants"
            refId={tenantId}
            bucket="tenant-docs"
            allowedTypes={['id_card_front', 'id_card_back', 'vehicle_registration', 'other']}
          />
        </Card>
      )}

      {/* Tab: Contracts */}
      {tab === 'contracts' && (
        <div>
          {historyLoading ? (
            <div className="h-16 animate-pulse rounded-xl bg-gray-100" />
          ) : contracts.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">ยังไม่มีประวัติการเช่า</p>
          ) : (
            <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
              {contracts.map((c, i) => (
                <button key={c.id} type="button" onClick={() => navigate(`/contracts/${c.id}`)} className={`flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-blue-50/60 ${i < contracts.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{c.contract_number}</p>
                    <p className="text-xs text-gray-400">
                      {c.rooms?.buildings?.name} · {c.rooms?.room_number}
                      {' · '}{formatThaiDate(c.contract_start_date)} – {formatThaiDate(c.contract_end_date)}
                    </p>
                  </div>
                  <Badge variant={c.status} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Payments */}
      {tab === 'payments' && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
            {contracts.length > 0 && (
              <Select
                value={paymentContractId}
                onChange={e => setPaymentContractId(e.target.value)}
                placeholder="ทุกสัญญา"
                options={contracts.map(c => ({
                  value: c.id,
                  label: [c.contract_number, c.rooms?.buildings?.name, c.rooms?.room_number].filter(Boolean).join(' · '),
                }))}
                wrapperClass="w-full sm:w-80"
              />
            )}
            <Button
              type="button"
              variant="outline"
              icon={exportingPayments ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              loading={exportingPayments}
              onClick={handleExportPaymentCard}
            >
              Export Excel
            </Button>
          </div>
          {historyLoading ? (
            <div className="h-16 animate-pulse rounded-xl bg-gray-100" />
          ) : payments.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">ยังไม่มีประวัติการชำระ</p>
          ) : (
            <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
              {payments.map((p, i) => (
                <button key={p.id} type="button" onClick={() => p.invoices?.id && navigate(`/invoices/${p.invoices.id}`)} className={`flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-blue-50/60 ${i < payments.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{invDesc(p.invoices)}</p>
                    <p className="text-xs text-gray-400">{p.invoices?.invoice_number} · {formatThaiDate(p.paid_date)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-900">฿{Number(p.amount).toLocaleString('th-TH')}</span>
                    <Badge variant={p.status} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Move-outs */}
      {tab === 'moveouts' && (
        <div>
          {historyLoading ? (
            <div className="h-16 animate-pulse rounded-xl bg-gray-100" />
          ) : moveOuts.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">ยังไม่มีประวัติการย้ายออก</p>
          ) : (
            <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
              {moveOuts.map((m, i) => (
                <div key={m.id} className={`flex items-center justify-between px-4 py-3.5 ${i < moveOuts.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{m.contracts?.rooms?.room_number}</p>
                    <p className="text-xs text-gray-400">ย้ายออก {formatThaiDate(m.move_out_date)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {m.refund_amount != null && (
                      <span className="text-sm text-gray-700">คืน ฿{Number(m.refund_amount).toLocaleString('th-TH')}</span>
                    )}
                    <Badge variant={m.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
