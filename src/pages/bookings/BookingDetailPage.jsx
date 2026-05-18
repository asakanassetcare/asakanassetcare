import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronRight, FileText, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatThaiDate, formatThaiDateTime } from '../../lib/date'
import { isAtLeast } from '../../lib/permissions'
import ContractFormModal from '../../components/contracts/ContractFormModal'

const DEPOSIT_ACTION_OPTS = [
  { value: 'refunded', label: 'คืนเงินจองให้ผู้เช่า' },
  { value: 'kept',     label: 'ยึดเงินจอง' },
]

export default function BookingDetailPage() {
  const { bookingId } = useParams()
  const navigate = useNavigate()
  const { profile, role } = useAuth()

  const [booking, setBooking] = useState(null)
  const [loading, setLoading] = useState(true)

  const [cancelModal,    setCancelModal]    = useState(false)
  const [cancelReason,   setCancelReason]   = useState('')
  const [depositAction,  setDepositAction]  = useState('refunded')
  const [cancelling,     setCancelling]     = useState(false)
  const [cancelError,    setCancelError]    = useState('')

  const [contractModal, setContractModal] = useState(false)

  useEffect(() => { fetchBooking() }, [bookingId])

  async function fetchBooking() {
    const { data } = await supabase
      .from('bookings')
      .select(`
        *,
        rooms(id, room_number, floor, base_rent, base_deposit, base_advance, ownership, status_color, status,
              buildings(id, name, project_id, projects(name))),
        tenants(id, full_name, phone, email),
        profiles!created_by(full_name)
      `)
      .eq('id', bookingId)
      .single()
    if (!data) { navigate('/bookings'); return }
    setBooking(data)
    setLoading(false)
  }

  async function handleCancel() {
    if (!cancelReason.trim()) { setCancelError('กรุณากรอกเหตุผลการยกเลิก'); return }
    setCancelling(true)
    const { error } = await supabase.from('bookings').update({
      status:         'cancelled',
      cancelled_at:   new Date().toISOString(),
      cancelled_by:   profile.id,
      deposit_action: depositAction,
      cancel_reason:  cancelReason.trim(),
    }).eq('id', bookingId)
    setCancelling(false)
    if (error) { setCancelError(error.message); return }
    setCancelModal(false)
    fetchBooking()
  }

  if (loading) return <PageSpinner />

  const canAct = booking.status === 'waiting' && isAtLeast(role, 'staff')

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link to="/bookings" className="hover:text-blue-600">การจอง</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900">{booking.booking_number}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">{booking.booking_number}</h1>
            <Badge variant={booking.status} />
          </div>
          <p className="mt-1 text-sm text-gray-500">สร้างเมื่อ {formatThaiDateTime(booking.created_at)}</p>
        </div>
        {canAct && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              icon={<FileText className="h-4 w-4" />}
              onClick={() => setContractModal(true)}
            >
              แปลงเป็นสัญญา
            </Button>
            <Button
              variant="danger"
              icon={<X className="h-4 w-4" />}
              onClick={() => { setCancelModal(true); setCancelError('') }}
            >
              ยกเลิกการจอง
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 max-w-3xl">
        {/* Room */}
        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">ห้อง</p>
          <p className="text-base font-semibold text-gray-900">
            {booking.rooms?.buildings?.name} ห้อง {booking.rooms?.room_number}
          </p>
          <p className="mt-0.5 text-sm text-gray-500">{booking.rooms?.buildings?.projects?.name}</p>
          <div className="mt-3 flex gap-4 text-sm text-gray-600">
            <span>ค่าเช่า ฿{Number(booking.rooms?.base_rent ?? 0).toLocaleString('th-TH')}</span>
            <span>ประกัน ฿{Number(booking.rooms?.base_deposit ?? 0).toLocaleString('th-TH')}</span>
          </div>
        </Card>

        {/* Tenant */}
        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">ผู้เช่า</p>
          <p className="text-base font-semibold text-gray-900">{booking.tenants?.full_name}</p>
          {booking.tenants?.phone && <p className="mt-0.5 text-sm text-gray-500">{booking.tenants.phone}</p>}
          {booking.tenants?.email && <p className="text-sm text-gray-500">{booking.tenants.email}</p>}
        </Card>

        {/* Booking Info */}
        <Card className="lg:col-span-2">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">ข้อมูลการจอง</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 text-sm">
            <div>
              <p className="text-xs text-gray-400">เงินจอง</p>
              <p className="font-semibold text-gray-900">฿{Number(booking.deposit_amount).toLocaleString('th-TH')}</p>
            </div>
            {booking.cancel_reason && (
              <div className="col-span-full">
                <p className="text-xs text-gray-400">เหตุผลยกเลิก</p>
                <p className="text-gray-900">{booking.cancel_reason}</p>
              </div>
            )}
            {booking.deposit_action && (
              <div>
                <p className="text-xs text-gray-400">เงินจอง</p>
                <p className="text-gray-900">{booking.deposit_action === 'refunded' ? 'คืนแล้ว' : 'ยึด'}</p>
              </div>
            )}
            {booking.converted_at && (
              <div>
                <p className="text-xs text-gray-400">แปลงสัญญาเมื่อ</p>
                <p className="text-gray-900">{formatThaiDate(booking.converted_at)}</p>
              </div>
            )}
            {booking.note && (
              <div className="col-span-full">
                <p className="text-xs text-gray-400">หมายเหตุ</p>
                <p className="text-gray-900">{booking.note}</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Cancel Modal */}
      <Modal
        open={cancelModal}
        onClose={() => setCancelModal(false)}
        title="ยกเลิกการจอง"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelModal(false)}>ปิด</Button>
            <Button variant="danger" loading={cancelling} onClick={handleCancel}>ยืนยันยกเลิก</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select
            label="เงินจอง"
            options={DEPOSIT_ACTION_OPTS}
            value={depositAction}
            onChange={e => setDepositAction(e.target.value)}
          />
          <Textarea
            label="เหตุผลการยกเลิก"
            required
            rows={3}
            value={cancelReason}
            onChange={e => { setCancelReason(e.target.value); setCancelError('') }}
          />
          {cancelError && <p className="text-sm text-red-600">{cancelError}</p>}
        </div>
      </Modal>

      {/* Contract Form Modal */}
      <ContractFormModal
        open={contractModal}
        onClose={() => setContractModal(false)}
        onSaved={(contractId) => {
          setContractModal(false)
          if (contractId) navigate(`/contracts/${contractId}`)
          else fetchBooking()
        }}
        prefillBooking={booking}
      />
    </div>
  )
}
