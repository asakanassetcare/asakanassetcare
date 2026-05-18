import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronRight, CheckCircle, XCircle, LogIn, Upload, UserCog, LogOut } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import DocumentUpload from '../../components/shared/DocumentUpload'
import MoveOutFormModal from '../../components/move-outs/MoveOutFormModal'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatThaiDate, formatThaiDateTime } from '../../lib/date'
import { useSettings } from '../../hooks/useSettings'

const TABS = [
  { id: 'info',      label: 'ข้อมูล' },
  { id: 'invoices',  label: 'ใบแจ้งหนี้' },
  { id: 'documents', label: 'เอกสาร' },
]

export default function ContractDetailPage() {
  const { contractId } = useParams()
  const navigate = useNavigate()
  const { profile, role } = useAuth()

  const [contract,       setContract]       = useState(null)
  const [invoices,       setInvoices]       = useState([])
  const [initialInvoice,  setInitialInvoice]  = useState(null)
  const [prorateInvoice,  setProrateInvoice]  = useState(null)
  const [staffList,      setStaffList]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState('info')

  // Approve
  const [approving,  setApproving]  = useState(false)
  const [approveErr, setApproveErr] = useState('')

  // Reject modal
  const [rejectModal,  setRejectModal]  = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting,    setRejecting]    = useState(false)
  const [rejectErr,    setRejectErr]    = useState('')

  // Move-in
  const [moveInModal,      setMoveInModal]      = useState(false)
  const [checklistInFile,  setChecklistInFile]  = useState(null)
  const [movingIn,         setMovingIn]         = useState(false)
  const [moveInErr,        setMoveInErr]        = useState('')

  // Reassign staff modal
  const [staffModal,      setStaffModal]      = useState(false)
  const [newStaffId,      setNewStaffId]      = useState('')
  const [reassigning,     setReassigning]     = useState(false)
  const [reassignErr,     setReassignErr]     = useState('')

  // Move-out modal
  const [moveOutModal, setMoveOutModal] = useState(false)

  useEffect(() => { fetchContract() }, [contractId])
  useEffect(() => { if (tab === 'invoices') fetchInvoices() }, [tab])

  async function fetchContract() {
    const [{ data }, { data: initInv }, { data: prorateInv }] = await Promise.all([
      supabase.from('contracts').select(`
        *,
        rooms(id, room_number, floor, ownership, base_rent, base_deposit, base_advance, buildings(id, name, project_id, projects(name))),
        tenants(id, full_name, phone, email),
        profiles!assigned_staff_id(id, full_name)
      `).eq('id', contractId).single(),
      supabase.from('invoices')
        .select('id, invoice_number, status, total_amount, due_date')
        .eq('contract_id', contractId)
        .eq('invoice_type', 'contract_initial')
        .maybeSingle(),
      supabase.from('invoices')
        .select('id, invoice_number, status, total_amount, due_date, billing_period')
        .eq('contract_id', contractId)
        .eq('invoice_type', 'monthly_rent')
        .not('status', 'in', '("cancelled","rejected")')
        .order('created_at')
        .limit(1)
        .maybeSingle(),
    ])
    if (!data) { navigate('/contracts'); return }
    setContract(data)
    setInitialInvoice(initInv ?? null)
    setProrateInvoice(prorateInv ?? null)
    setLoading(false)
  }

  async function fetchInvoices() {
    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_type, billing_period, total_amount, status, due_date, issue_date')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false })
    setInvoices(data ?? [])
  }

  async function fetchStaffList() {
    const { data } = await supabase.from('profiles').select('id, full_name')
      .in('role', ['super_admin', 'head_staff', 'staff']).order('full_name')
    setStaffList(data?.map(s => ({ value: s.id, label: s.full_name })) ?? [])
  }

  async function handleApprove() {
    setApproving(true); setApproveErr('')
    const { error } = await supabase.rpc('approve_contract', { p_contract_id: contractId })
    setApproving(false)
    if (error) { setApproveErr(error.message); return }
    fetchContract()
  }

  async function handleReject() {
    if (!rejectReason.trim()) { setRejectErr('กรุณากรอกเหตุผล'); return }
    setRejecting(true)
    const { error } = await supabase.from('contracts').update({
      status: 'rejected', rejected_at: new Date().toISOString(),
      rejected_by: profile.id, rejection_reason: rejectReason.trim(),
    }).eq('id', contractId)
    setRejecting(false)
    if (error) { setRejectErr(error.message); return }
    setRejectModal(false)
    fetchContract()
  }

  async function handleMoveIn() {
    setMovingIn(true); setMoveInErr('')

    let checklistUrl = null
    if (checklistInFile) {
      const ext  = checklistInFile.name.split('.').pop()
      const path = `checklists/in/${contractId}_${Date.now()}.${ext}`
      const { data: cd, error: ce } = await supabase.storage.from('payment-slips').upload(path, checklistInFile)
      if (ce) { setMovingIn(false); setMoveInErr('อัปโหลด checklist ไม่สำเร็จ'); return }
      checklistUrl = cd.path
    }

    const { error } = await supabase.from('contracts').update({
      actual_move_in_at: new Date().toISOString(),
      ...(checklistUrl ? { checklist_in_url: checklistUrl } : {}),
    }).eq('id', contractId)
    if (error) { setMovingIn(false); setMoveInErr(error.message); return }
    // safety net: prorate should already exist from approval; this is a no-op if so
    await supabase.rpc('generate_prorated_first_invoice', { p_contract_id: contractId })
    setMovingIn(false)
    setMoveInModal(false)
    fetchContract()
  }

  async function handleReassign() {
    if (!newStaffId) { setReassignErr('กรุณาเลือก staff'); return }
    setReassigning(true)
    const { error } = await supabase.from('contracts').update({ assigned_staff_id: newStaffId }).eq('id', contractId)
    setReassigning(false)
    if (error) { setReassignErr(error.message); return }
    setStaffModal(false)
    fetchContract()
  }

  const { settings } = useSettings()

  if (loading) return <PageSpinner />

  const c = contract
  const isExecutive    = role === 'executive' || role === 'super_admin'
  const isHeadStaff    = role === 'head_staff' || role === 'super_admin'
  const isOperational  = ['super_admin', 'head_staff', 'staff'].includes(role)

  const initialInvPaid    = !initialInvoice || initialInvoice.status === 'paid'
  const prorateInvPaid    = !prorateInvoice  || prorateInvoice.status  === 'paid'
  const blockMoveIn       = (initialInvoice && initialInvoice.status !== 'paid') ||
                            (prorateInvoice  && prorateInvoice.status  !== 'paid')

  const INVOICE_TYPE_LABEL = {
    contract_initial: 'ประกัน+ล่วงหน้า',
    monthly_rent:     'ค่าเช่ารายเดือน',
    addon:            'ค่าบริการเสริม',
    final_settlement: 'เคลียร์ Move-out',
    booking_deposit:  'เงินจอง',
    other:            'อื่นๆ',
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link to="/contracts" className="hover:text-blue-600">สัญญา</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900">{c.contract_number}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">{c.contract_number}</h1>
            <Badge variant={c.status} />
          </div>
          <p className="mt-1 text-sm text-gray-500">
            สร้างเมื่อ {formatThaiDateTime(c.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Approve */}
          {c.status === 'pending_approve' && isExecutive && (
            <>
              <Button icon={<CheckCircle className="h-4 w-4" />} loading={approving} onClick={handleApprove}>อนุมัติ</Button>
              <Button variant="danger" icon={<XCircle className="h-4 w-4" />}
                onClick={() => { setRejectModal(true); setRejectErr('') }}>ปฏิเสธ</Button>
            </>
          )}
          {approveErr && <p className="text-sm text-red-600">{approveErr}</p>}

          {/* Move-in */}
          {c.status === 'approved' && isOperational && (
            <>
              <Button
                icon={<LogIn className="h-4 w-4" />}
                disabled={blockMoveIn}
                onClick={() => { setChecklistInFile(null); setMoveInErr(''); setMoveInModal(true) }}
              >
                บันทึกเข้าพัก
              </Button>
              {blockMoveIn && (
                <p className="text-sm text-red-600">
                  รอชำระ:
                  {initialInvoice && initialInvoice.status !== 'paid' &&
                    ` ${initialInvoice.invoice_number} ประกัน+ล่วงหน้า ฿${Number(initialInvoice.total_amount).toLocaleString('th-TH')}`}
                  {prorateInvoice && prorateInvoice.status !== 'paid' &&
                    ` · ${prorateInvoice.invoice_number} ค่าเช่า prorated ฿${Number(prorateInvoice.total_amount).toLocaleString('th-TH')}`}
                </p>
              )}
            </>
          )}
          {moveInErr && <p className="text-sm text-red-600">{moveInErr}</p>}

          {/* PDF */}
          <Button
            variant="secondary"
            onClick={() => window.open(`/contracts/${contractId}/print`, '_blank')}
          >
            พิมพ์สัญญา
          </Button>

          {/* Move-out */}
          {c.status === 'active' && isOperational && (
            <Button variant="danger" icon={<LogOut className="h-4 w-4" />}
              onClick={() => setMoveOutModal(true)}>
              ย้ายออก
            </Button>
          )}

          {/* Reassign staff */}
          {c.status === 'active' && isHeadStaff && (
            <Button variant="ghost" size="sm" icon={<UserCog className="h-4 w-4" />}
              onClick={() => { fetchStaffList(); setNewStaffId(c.assigned_staff_id ?? ''); setStaffModal(true); setReassignErr('') }}>
              เปลี่ยน Staff
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${tab === t.id ? 'border-b-2 border-blue-600 text-blue-700 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Info */}
      {tab === 'info' && (
        <div className="grid gap-4 lg:grid-cols-2 max-w-4xl">
          {/* Room */}
          <Card>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">ห้อง</p>
            <p className="text-base font-semibold text-gray-900">
              {c.rooms?.buildings?.name} ห้อง {c.rooms?.room_number}
            </p>
            <p className="text-sm text-gray-500">{c.rooms?.buildings?.projects?.name}</p>
          </Card>

          {/* Tenant */}
          <Card>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">ผู้เช่า</p>
            <p className="text-base font-semibold text-gray-900">{c.tenants?.full_name}</p>
            {c.tenants?.phone && <p className="text-sm text-gray-500">{c.tenants.phone}</p>}
          </Card>

          {/* Dates */}
          <Card>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">วันที่</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-gray-400">เริ่มสัญญา</p><p className="font-medium">{formatThaiDate(c.contract_start_date)}</p></div>
              <div><p className="text-xs text-gray-400">สิ้นสุดสัญญา</p><p className="font-medium">{formatThaiDate(c.contract_end_date)}</p></div>
              <div><p className="text-xs text-gray-400">กำหนดเข้าพัก</p><p className="font-medium">{formatThaiDate(c.move_in_date)}</p></div>
              {c.actual_move_in_at && <div><p className="text-xs text-gray-400">เข้าพักจริง</p><p className="font-medium">{formatThaiDate(c.actual_move_in_at)}</p></div>}
              {c.checklist_in_url && (
                <div>
                  <p className="text-xs text-gray-400">Checklist เข้าพัก</p>
                  <button
                    onClick={async () => {
                      const { data } = await supabase.storage.from('payment-slips').createSignedUrl(c.checklist_in_url, 3600)
                      if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                    }}
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    ดูเอกสาร
                  </button>
                </div>
              )}
            </div>
          </Card>

          {/* Money */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">การเงิน</p>
              <p className="text-xs text-gray-400">จริง / มาตรฐาน</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <MoneyRow label="ค่าเช่า/เดือน" actual={c.monthly_rent} base={c.rooms?.base_rent} bold />
              <MoneyRow label="เงินประกัน"    actual={c.deposit_amount} base={c.rooms?.base_deposit} />
              <MoneyRow label="ล่วงหน้า"      actual={c.advance_rent_amount} base={c.rooms?.base_advance} />
              {c.booking_deposit_applied > 0 && (
                <div><p className="text-xs text-gray-400">หักเงินจอง</p><p className="font-medium text-green-600">-฿{Number(c.booking_deposit_applied).toLocaleString('th-TH')}</p></div>
              )}
              <div><p className="text-xs text-gray-400">ชำระทุกวันที่</p><p className="font-medium">{c.payment_day}</p></div>
            </div>
          </Card>

          {/* Rejection reason */}
          {c.status === 'rejected' && c.rejection_reason && (
            <Card className="lg:col-span-2 border-red-100 bg-red-50">
              <p className="mb-1 text-xs font-semibold text-red-500">เหตุผลที่ปฏิเสธ</p>
              <p className="text-sm text-red-800">{c.rejection_reason}</p>
            </Card>
          )}

          {/* Staff */}
          <Card>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Staff รับผิดชอบ</p>
            <p className="text-sm font-medium text-gray-900">{c.profiles?.full_name ?? '—'}</p>
          </Card>
        </div>
      )}

      {/* Tab: Invoices */}
      {tab === 'invoices' && (
        <div className="max-w-3xl">
          {invoices.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">ยังไม่มีใบแจ้งหนี้</p>
          ) : (
            <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
              {invoices.map((inv, i) => (
                <div key={inv.id}
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                  className={`flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-gray-50 ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{inv.invoice_number}</p>
                    <p className="text-xs text-gray-400">
                      {INVOICE_TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type}
                      {inv.billing_period ? ` · ${inv.billing_period}` : ''}
                      {' · ครบ '}{formatThaiDate(inv.due_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-900">฿{Number(inv.total_amount).toLocaleString('th-TH')}</span>
                    <Badge variant={inv.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Documents */}
      {tab === 'documents' && (
        <Card className="max-w-2xl">
          <DocumentUpload
            refTable="contracts"
            refId={contractId}
            bucket="contract-pdfs"
            allowedTypes={['contract_pdf', 'other']}
          />
        </Card>
      )}

      {/* Reject Modal */}
      <Modal
        open={rejectModal}
        onClose={() => setRejectModal(false)}
        title="ปฏิเสธสัญญา"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectModal(false)}>ปิด</Button>
            <Button variant="danger" loading={rejecting} onClick={handleReject}>ยืนยันปฏิเสธ</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Textarea label="เหตุผล" required rows={3} value={rejectReason}
            onChange={e => { setRejectReason(e.target.value); setRejectErr('') }} />
          {rejectErr && <p className="text-sm text-red-600">{rejectErr}</p>}
        </div>
      </Modal>

      {/* Reassign Staff Modal */}
      <Modal
        open={staffModal}
        onClose={() => setStaffModal(false)}
        title="เปลี่ยน Staff รับผิดชอบ"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStaffModal(false)}>ปิด</Button>
            <Button loading={reassigning} onClick={handleReassign}>บันทึก</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Select label="Staff" options={staffList} placeholder="เลือก staff"
            value={newStaffId} onChange={e => { setNewStaffId(e.target.value); setReassignErr('') }} />
          {reassignErr && <p className="text-sm text-red-600">{reassignErr}</p>}
        </div>
      </Modal>

      {/* Move-in Checklist Modal */}
      <Modal
        open={moveInModal}
        onClose={() => setMoveInModal(false)}
        title="บันทึกเข้าพัก"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMoveInModal(false)}>ปิด</Button>
            <Button icon={<LogIn className="h-4 w-4" />} loading={movingIn} onClick={handleMoveIn}>ยืนยันเข้าพัก</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Checklist ตรวจห้อง (ตอนเข้า)</p>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 hover:border-blue-400 transition-colors">
              <Upload className="h-4 w-4 text-gray-400 shrink-0" />
              <span className="text-sm text-gray-500 truncate">
                {checklistInFile ? checklistInFile.name : 'แนบ checklist ที่ผู้เช่าเซ็นแล้ว (รูปหรือ PDF)'}
              </span>
              <input type="file" accept="image/*,application/pdf" className="hidden"
                onChange={e => setChecklistInFile(e.target.files?.[0] ?? null)} />
            </label>
            <p className="mt-2 text-xs text-gray-400">ไม่บังคับ — สามารถแนบทีหลังได้ที่แท็บ เอกสาร</p>
          </div>
          {moveInErr && <p className="text-sm text-red-600">{moveInErr}</p>}
        </div>
      </Modal>

      {/* Move-out Modal */}
      <MoveOutFormModal
        open={moveOutModal}
        onClose={() => setMoveOutModal(false)}
        contract={c}
        onSaved={(moveOutId) => {
          setMoveOutModal(false)
          navigate(`/move-outs/${moveOutId}`)
        }}
      />
    </div>
  )
}

function MoneyRow({ label, actual, base, bold = false }) {
  const actualNum = Number(actual)
  const baseNum   = Number(base)
  const isDiscounted = base != null && actualNum < baseNum
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className={bold ? 'font-semibold' : 'font-medium'}>
        <span className={isDiscounted ? 'text-orange-600' : 'text-gray-900'}>
          ฿{actualNum.toLocaleString('th-TH')}
        </span>
        {base != null && (
          <span className="text-gray-400"> / ฿{baseNum.toLocaleString('th-TH')}</span>
        )}
      </p>
    </div>
  )
}
