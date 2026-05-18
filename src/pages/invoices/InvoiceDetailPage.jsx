import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronRight, CreditCard, XCircle, Upload, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import PdfDownloadButton from '../../components/pdf/PdfDownloadButton'
import InvoicePDF from '../../components/pdf/InvoicePDF'
import ReceiptPDF from '../../components/pdf/ReceiptPDF'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatThaiDate, formatThaiDateTime } from '../../lib/date'
import { useSettings } from '../../hooks/useSettings'

const BANKS = [
  { value: '',                        label: '— เลือกธนาคาร —' },
  { value: 'กสิกรไทย',               label: 'ธ. กสิกรไทย (KBank)' },
  { value: 'ไทยพาณิชย์',             label: 'ธ. ไทยพาณิชย์ (SCB)' },
  { value: 'กรุงเทพ',                label: 'ธ. กรุงเทพ (BBL)' },
  { value: 'กรุงไทย',                label: 'ธ. กรุงไทย (KTB)' },
  { value: 'กรุงศรีอยุธยา',          label: 'ธ. กรุงศรีอยุธยา (BAY)' },
  { value: 'ทหารไทยธนชาต',           label: 'ธ. ทหารไทยธนชาต (TTB)' },
  { value: 'ออมสิน',                  label: 'ธ. ออมสิน (GSB)' },
  { value: 'อาคารสงเคราะห์',         label: 'ธ. อาคารสงเคราะห์ (GHB)' },
  { value: 'ยูโอบี',                  label: 'ธ. ยูโอบี (UOB)' },
  { value: 'ซีไอเอ็มบีไทย',         label: 'ธ. ซีไอเอ็มบีไทย (CIMB)' },
  { value: 'พร้อมเพย์',              label: 'พร้อมเพย์ / PromptPay' },
  { value: 'อื่นๆ',                   label: 'อื่นๆ' },
]

const TYPE_LABEL = {
  contract_initial: 'เงินประกัน + ค่าล่วงหน้า',
  monthly_rent:     'ค่าเช่ารายเดือน',
  addon:            'ค่าบริการเสริม',
  final_settlement: 'เคลียร์ Move-out',
  booking_deposit:  'เงินจอง',
  other:            'อื่นๆ',
}

export default function InvoiceDetailPage() {
  const { invoiceId } = useParams()
  const navigate = useNavigate()
  const { profile, role } = useAuth()
  const { settings } = useSettings()

  const [invoice,  setInvoice]  = useState(null)
  const [items,    setItems]    = useState([])
  const [payments, setPayments] = useState([])
  const [loading,  setLoading]  = useState(true)

  // Payment recording modal
  const [payModal,    setPayModal]    = useState(false)
  const [payForm,     setPayForm]     = useState({ paid_date: '', bank_name: '', bank_reference: '', note: '' })
  const [slipFile,    setSlipFile]    = useState(null)
  const [paying,      setPaying]      = useState(false)
  const [payError,    setPayError]    = useState('')

  // Cancel modal
  const [cancelModal,  setCancelModal]  = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling,   setCancelling]   = useState(false)
  const [cancelError,  setCancelError]  = useState('')

  useEffect(() => { fetchAll() }, [invoiceId])

  async function fetchAll() {
    const [{ data: inv }, { data: itms }, { data: pmts }] = await Promise.all([
      supabase.from('invoices').select('*, rooms(room_number, buildings(name)), tenants(full_name, phone), contracts(contract_number)').eq('id', invoiceId).single(),
      supabase.from('invoice_items').select('*').eq('invoice_id', invoiceId).order('display_order'),
      supabase.from('payments').select('*, profiles!recorded_by(full_name)').eq('invoice_id', invoiceId).order('created_at', { ascending: false }),
    ])
    if (!inv) { navigate('/invoices'); return }
    setInvoice(inv)
    setItems(itms ?? [])
    setPayments(pmts ?? [])
    setLoading(false)
  }

  function openPayModal() {
    setPayForm({ paid_date: new Date().toISOString().slice(0, 10), bank_name: '', bank_reference: '', note: '' })
    setSlipFile(null)
    setPayError('')
    setPayModal(true)
  }

  async function handlePayment(e) {
    e.preventDefault()
    if (!payForm.paid_date) { setPayError('กรุณากรอกวันชำระ'); return }
    if (!slipFile) { setPayError('กรุณาแนบสลิป'); return }
    setPaying(true)
    let slipUrl = null

    if (slipFile) {
      const ext = slipFile.name.split('.').pop()
      const path = `${invoiceId}/slip_${Date.now()}.${ext}`
      const { data: storageData, error: storageErr } = await supabase.storage.from('payment-slips').upload(path, slipFile, { upsert: false })
      if (storageErr) { setPaying(false); setPayError('อัปโหลดสลิปไม่สำเร็จ: ' + storageErr.message); return }
      slipUrl = storageData.path
    }

    const { error } = await supabase.from('payments').insert({
      invoice_id:     invoiceId,
      amount:         invoice.total_amount,
      paid_date:      payForm.paid_date,
      bank_name:      payForm.bank_name || null,
      bank_reference: payForm.bank_reference.trim() || null,
      slip_url:       slipUrl,
      note:           payForm.note.trim() || null,
      status:         'pending_approve',
      recorded_by:    profile.id,
    })

    // Update invoice to paid_pending_approve
    if (!error) {
      await supabase.from('invoices').update({ status: 'paid_pending_approve' }).eq('id', invoiceId)
    }

    setPaying(false)
    if (error) { setPayError(error.message); return }
    setPayModal(false)
    fetchAll()
  }

  async function handleCancel() {
    if (!cancelReason.trim()) { setCancelError('กรุณากรอกเหตุผล'); return }
    setCancelling(true)
    const { error } = await supabase.from('invoices').update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: profile.id,
      cancellation_reason: cancelReason.trim(),
    }).eq('id', invoiceId)
    setCancelling(false)
    if (error) { setCancelError(error.message); return }
    setCancelModal(false)
    fetchAll()
  }

  if (loading) return <PageSpinner />

  const canPay    = ['pending', 'overdue'].includes(invoice.status) && ['super_admin', 'head_staff', 'staff'].includes(role)
  const canCancel = ['pending', 'overdue', 'paid_pending_approve'].includes(invoice.status) && ['super_admin', 'accounting'].includes(role)

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link to="/invoices" className="hover:text-blue-600">ใบแจ้งหนี้</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900">{invoice.invoice_number}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">{invoice.invoice_number}</h1>
            <Badge variant={invoice.status} />
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {TYPE_LABEL[invoice.invoice_type] ?? invoice.invoice_type}
            {invoice.billing_period ? ` · ${invoice.billing_period}` : ''}
            {' · ออก '}{formatThaiDate(invoice.issue_date)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* PDF buttons */}
          <PdfDownloadButton
            document={<InvoicePDF invoice={invoice} items={items} company={settings} />}
            filename={`${invoice.invoice_number}.pdf`}
            label="PDF ใบแจ้งหนี้"
          />
          {invoice.status === 'paid' && payments.length > 0 && (
            <PdfDownloadButton
              document={<ReceiptPDF payment={payments[0]} invoice={invoice} company={settings} />}
              filename={`receipt_${invoice.invoice_number}.pdf`}
              label="PDF ใบเสร็จ"
            />
          )}
          {canPay && (
            <Button icon={<CreditCard className="h-4 w-4" />} onClick={openPayModal}>บันทึกการชำระ</Button>
          )}
          {canCancel && (
            <Button variant="danger" icon={<XCircle className="h-4 w-4" />}
              onClick={() => { setCancelModal(true); setCancelError('') }}>ยกเลิก</Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 max-w-4xl">
        {/* Invoice info */}
        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">ห้อง / ผู้เช่า</p>
          <p className="text-sm font-semibold text-gray-900">{invoice.rooms?.buildings?.name} ห้อง {invoice.rooms?.room_number}</p>
          <p className="mt-1 text-sm text-gray-600">{invoice.tenants?.full_name}</p>
          {invoice.contracts?.contract_number && (
            <Link to={`/contracts/${invoice.contract_id}`} className="mt-2 block text-xs text-blue-600 hover:underline">
              {invoice.contracts.contract_number}
            </Link>
          )}
        </Card>

        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">วันที่</p>
          <div className="space-y-2 text-sm">
            <div><p className="text-xs text-gray-400">วันออก</p><p className="font-medium">{formatThaiDate(invoice.issue_date)}</p></div>
            <div><p className="text-xs text-gray-400">ครบกำหนด</p><p className={`font-medium ${invoice.status === 'overdue' ? 'text-red-600' : ''}`}>{formatThaiDate(invoice.due_date)}</p></div>
          </div>
        </Card>

        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">ยอดรวม</p>
          <p className="text-2xl font-bold text-gray-900">฿{Number(invoice.total_amount).toLocaleString('th-TH')}</p>
          {invoice.cancellation_reason && (
            <p className="mt-2 text-xs text-red-600">{invoice.cancellation_reason}</p>
          )}
        </Card>

        {/* Items */}
        <Card className="lg:col-span-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">รายการ</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400">
                  <th className="pb-2 text-left font-medium">รายการ</th>
                  <th className="pb-2 text-right font-medium">จำนวน</th>
                  <th className="pb-2 text-right font-medium">ราคา/หน่วย</th>
                  <th className="pb-2 text-right font-medium">รวม</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="border-b border-gray-50">
                    <td className="py-2 text-gray-800">{item.description}</td>
                    <td className="py-2 text-right text-gray-600">{item.quantity}</td>
                    <td className="py-2 text-right text-gray-600">฿{Number(item.unit_price).toLocaleString('th-TH')}</td>
                    <td className={`py-2 text-right font-medium ${item.amount < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                      {item.amount < 0 ? '-' : ''}฿{Math.abs(Number(item.amount)).toLocaleString('th-TH')}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="pt-3 text-right text-sm font-semibold text-gray-700">ยอดรวมทั้งหมด</td>
                  <td className="pt-3 text-right text-base font-bold text-gray-900">฿{Number(invoice.total_amount).toLocaleString('th-TH')}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        {/* Payments */}
        {payments.length > 0 && (
          <Card className="lg:col-span-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">ประวัติการชำระ</p>
            <div className="flex flex-col gap-2">
              {payments.map(pmt => (
                <div key={pmt.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-gray-900">฿{Number(pmt.amount).toLocaleString('th-TH')}</p>
                    <p className="text-xs text-gray-400">
                      {formatThaiDate(pmt.paid_date)}
                      {pmt.bank_name ? ` · ${pmt.bank_name}` : ''}
                      {pmt.bank_reference ? ` · ${pmt.bank_reference}` : ''}
                      {pmt.profiles?.full_name ? ` · โดย ${pmt.profiles.full_name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {pmt.slip_url && (
                      <button onClick={async () => {
                        const { data } = await supabase.storage.from('payment-slips').createSignedUrl(pmt.slip_url, 3600)
                        if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                      }} className="text-xs text-blue-600 hover:underline">ดูสลิป</button>
                    )}
                    <Badge variant={pmt.status} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Payment Modal */}
      <Modal
        open={payModal}
        onClose={() => setPayModal(false)}
        title="บันทึกการชำระเงิน"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayModal(false)}>ปิด</Button>
            <Button form="pay-form" type="submit" loading={paying}>บันทึก</Button>
          </>
        }
      >
        <form id="pay-form" onSubmit={handlePayment} className="flex flex-col gap-4">
          <div className="rounded-lg bg-blue-50 px-4 py-3">
            <p className="text-xs text-blue-600">ยอดที่ต้องชำระ</p>
            <p className="text-xl font-bold text-blue-700">฿{Number(invoice.total_amount).toLocaleString('th-TH')}</p>
          </div>
          <Input label="วันที่ชำระ" type="date" required value={payForm.paid_date}
            onChange={e => setPayForm(p => ({ ...p, paid_date: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="ธนาคาร" options={BANKS} value={payForm.bank_name}
              onChange={e => setPayForm(p => ({ ...p, bank_name: e.target.value }))} />
            <Input label="เลขที่โอน" value={payForm.bank_reference}
              onChange={e => setPayForm(p => ({ ...p, bank_reference: e.target.value }))}
              placeholder="xxxx-xxxx-xxxx" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">แนบสลิป <span className="text-red-500">*</span></label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 hover:border-blue-400 transition-colors">
              <Upload className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">{slipFile ? slipFile.name : 'เลือกไฟล์ภาพ / PDF'}</span>
              <input type="file" accept="image/*,application/pdf" className="hidden"
                onChange={e => setSlipFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <Textarea label="หมายเหตุ" rows={2} value={payForm.note}
            onChange={e => setPayForm(p => ({ ...p, note: e.target.value }))} />
          {payError && <p className="text-sm text-red-600">{payError}</p>}
        </form>
      </Modal>

      {/* Cancel Modal */}
      <Modal
        open={cancelModal}
        onClose={() => setCancelModal(false)}
        title="ยกเลิกใบแจ้งหนี้"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelModal(false)}>ปิด</Button>
            <Button variant="danger" loading={cancelling} onClick={handleCancel}>ยืนยันยกเลิก</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Textarea label="เหตุผลการยกเลิก" required rows={3} value={cancelReason}
            onChange={e => { setCancelReason(e.target.value); setCancelError('') }} />
          {cancelError && <p className="text-sm text-red-600">{cancelError}</p>}
        </div>
      </Modal>
    </div>
  )
}
