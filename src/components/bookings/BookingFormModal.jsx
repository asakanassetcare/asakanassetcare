import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Textarea from '../ui/Textarea'
import TenantSelect from '../shared/TenantSelect'

export default function BookingFormModal({ open, onClose, onSaved, prefillRoomId }) {
  const { profile } = useAuth()
  const [rooms,  setRooms]  = useState([])
  const [form,   setForm]   = useState({ room_id: '', tenant_id: '', deposit_amount: '', note: '' })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => {
    if (!open) return
    fetchRooms()
    setForm({ room_id: prefillRoomId ?? '', tenant_id: '', deposit_amount: '', note: '' })
    setError('')
  }, [open, prefillRoomId])

  async function fetchRooms() {
    const { data: rms } = await supabase.from('rooms')
      .select('id, room_number, buildings(name)')
      .eq('status', 'available')
      .eq('is_rentable', true)
      .order('room_number')
    let list = rms ?? []
    if (prefillRoomId && !list.find(r => r.id === prefillRoomId)) {
      setForm(p => ({ ...p, room_id: '' }))
      setError('ห้องนี้ไม่พร้อมให้จอง')
    }
    setRooms(list.map(r => ({ value: r.id, label: `${r.buildings?.name ?? ''} — ${r.room_number}` })))
  }

  function set(field, val) { setForm(p => ({ ...p, [field]: val })) }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.room_id)   { setError('กรุณาเลือกห้อง'); return }
    if (!rooms.some(r => r.value === form.room_id)) { setError('ห้องนี้ไม่พร้อมให้จอง'); return }
    if (!form.tenant_id) { setError('กรุณาเลือกผู้เช่า'); return }
    setError('')
    setSaving(true)

    const { error } = await supabase.from('bookings').insert({
      room_id:        form.room_id,
      tenant_id:      form.tenant_id,
      deposit_amount: Number(form.deposit_amount) || 0,
      note:           form.note.trim() || null,
      created_by:     profile.id,
    })

    setSaving(false)
    if (error) { setError(error.message); return }
    onSaved?.()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="สร้างการจอง"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button form="booking-form" type="submit" loading={saving}>บันทึก</Button>
        </>
      }
    >
      <form id="booking-form" onSubmit={handleSave} className="flex flex-col gap-4">
        <Select
          label="ห้อง (เฉพาะห้องว่าง)"
          required
          options={rooms}
          placeholder="เลือกห้อง"
          value={form.room_id}
          onChange={e => set('room_id', e.target.value)}
          disabled={!!prefillRoomId && rooms.some(r => r.value === prefillRoomId)}
        />
        <TenantSelect
          label="ผู้เช่า"
          required
          value={form.tenant_id}
          onChange={id => set('tenant_id', id)}
        />
        <Input
          label="เงินจอง (฿)"
          type="number"
          min={0}
          value={form.deposit_amount}
          onChange={e => set('deposit_amount', e.target.value)}
          placeholder="5000"
        />
        <Textarea
          label="หมายเหตุ"
          rows={2}
          value={form.note}
          onChange={e => set('note', e.target.value)}
        />
        {error && <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">{error}</div>}
      </form>
    </Modal>
  )
}
