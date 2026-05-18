import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, XCircle, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import Textarea from '../components/ui/Textarea'
import EmptyState from '../components/ui/EmptyState'
import { PageSpinner } from '../components/ui/Spinner'
import { formatThaiDate } from '../lib/date'

export default function ApprovalsPage() {
  const navigate = useNavigate()
  const { profile, role } = useAuth()

  const [contracts,        setContracts]        = useState([])
  const [loading,          setLoading]          = useState(true)
  const [approvingId,      setApprovingId]      = useState(null)

  const [rejectModal,  setRejectModal]  = useState(false)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting,    setRejecting]    = useState(false)
  const [rejectErr,    setRejectErr]    = useState('')

  useEffect(() => { fetchContracts() }, [])

  async function fetchContracts() {
    setLoading(true)
    const { data } = await supabase
      .from('contracts')
      .select(`
        id, contract_number, created_at,
        contract_start_date, contract_end_date,
        monthly_rent, deposit_amount, advance_rent_amount,
        rooms(room_number, buildings(name)),
        tenants(full_name, phone),
        profiles!assigned_staff_id(full_name)
      `)
      .eq('status', 'pending_approve')
      .order('created_at', { ascending: true })
    setContracts(data ?? [])
    setLoading(false)
  }

  async function handleApprove(c) {
    setApprovingId(c.id)
    const { error } = await supabase.rpc('approve_contract', { p_contract_id: c.id })
    setApprovingId(null)
    if (error) alert(error.message)
    else fetchContracts()
  }

  function openReject(c) {
    setRejectTarget(c)
    setRejectReason('')
    setRejectErr('')
    setRejectModal(true)
  }

  async function handleReject() {
    if (!rejectReason.trim()) { setRejectErr('กรุณากรอกเหตุผล'); return }
    setRejecting(true)
    const { error } = await supabase.from('contracts').update({
      status:           'rejected',
      rejected_at:      new Date().toISOString(),
      rejected_by:      profile.id,
      rejection_reason: rejectReason.trim(),
    }).eq('id', rejectTarget.id)
    setRejecting(false)
    if (error) { setRejectErr(error.message); return }
    setRejectModal(false)
    fetchContracts()
  }

  const canApprove = ['super_admin', 'executive'].includes(role)

  if (loading) return <PageSpinner />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">รออนุมัติ</h1>
        <p className="mt-1 text-sm text-gray-500">
          {contracts.length > 0
            ? `${contracts.length} สัญญารออนุมัติ — เรียงจากเก่าสุด`
            : 'ไม่มีรายการรออนุมัติ'}
        </p>
      </div>

      {contracts.length === 0 ? (
        <EmptyState icon={FileText} title="ไม่มีสัญญารออนุมัติ"
          description="เมื่อมีสัญญาใหม่ถูกสร้าง จะปรากฏที่นี่" />
      ) : (
        <div className="flex flex-col gap-3 max-w-3xl">
          {contracts.map(c => (
            <div key={c.id}
              className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm hover:border-gray-200 transition-colors">
              <div className="flex items-start justify-between gap-4">

                {/* Info */}
                <div className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => navigate(`/contracts/${c.id}`)}>
                  {(() => {
                    const months = Math.round(
                      (new Date(c.contract_end_date) - new Date(c.contract_start_date))
                      / (1000 * 60 * 60 * 24 * 30.44)
                    )
                    const isShort = months < 12
                    return (
                      <>
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <p className="font-semibold text-gray-900 hover:text-blue-600">
                            {c.contract_number}
                          </p>
                          <Badge variant="pending_approve" />
                          {isShort && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                              ⚠️ ระยะสั้น {months} เดือน
                            </span>
                          )}
                        </div>

                        <p className="text-sm font-medium text-gray-800">
                          {c.rooms?.buildings?.name} · ห้อง {c.rooms?.room_number}
                        </p>
                        <p className="text-sm text-gray-600">{c.tenants?.full_name}
                          {c.tenants?.phone && <span className="text-gray-400"> · {c.tenants.phone}</span>}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                          <span>
                            {formatThaiDate(c.contract_start_date)} — {formatThaiDate(c.contract_end_date)}
                            <span className="ml-1 text-gray-300">({months} เดือน)</span>
                          </span>
                          <span>ค่าเช่า ฿{Number(c.monthly_rent).toLocaleString('th-TH')}/เดือน</span>
                          <span>ประกัน ฿{Number(c.deposit_amount).toLocaleString('th-TH')}</span>
                          <span>ล่วงหน้า ฿{Number(c.advance_rent_amount).toLocaleString('th-TH')}</span>
                          {c.profiles?.full_name && <span>Staff: {c.profiles.full_name}</span>}
                          <span>สร้าง {formatThaiDate(c.created_at)}</span>
                        </div>
                      </>
                    )
                  })()}
                </div>

                {/* Actions */}
                {canApprove && (
                  <div className="flex gap-2 shrink-0 pt-0.5">
                    <Button
                      size="sm"
                      icon={<CheckCircle className="h-3.5 w-3.5" />}
                      loading={approvingId === c.id}
                      onClick={() => handleApprove(c)}
                    >
                      อนุมัติ
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      icon={<XCircle className="h-3.5 w-3.5" />}
                      onClick={() => openReject(c)}
                    >
                      ปฏิเสธ
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      <Modal
        open={rejectModal}
        onClose={() => setRejectModal(false)}
        title={`ปฏิเสธสัญญา ${rejectTarget?.contract_number ?? ''}`}
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
    </div>
  )
}
