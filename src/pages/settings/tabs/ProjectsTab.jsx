import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Building2, ChevronRight, Pencil } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'
import Input from '../../../components/ui/Input'
import Textarea from '../../../components/ui/Textarea'
import EmptyState from '../../../components/ui/EmptyState'

const EMPTY_FORM = { name: '', address: '', note: '' }

export default function ProjectsTab() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  useEffect(() => { fetchProjects() }, [])

  async function fetchProjects() {
    const { data } = await supabase
      .from('projects')
      .select('*, buildings(id, name, total_rentable_rooms)')
      .order('name')
    if (data) setProjects(data)
    setLoading(false)
  }

  function openCreate() {
    setEditing(null); setForm(EMPTY_FORM); setError(''); setModalOpen(true)
  }

  function openEdit(e, project) {
    e.stopPropagation()
    setEditing(project)
    setForm({ name: project.name, address: project.address ?? '', note: project.note ?? '' })
    setError(''); setModalOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault(); setError(''); setSaving(true)
    const payload = {
      name:    form.name.trim(),
      address: form.address.trim() || null,
      note:    form.note.trim()    || null,
    }
    const { error } = editing
      ? await supabase.from('projects').update(payload).eq('id', editing.id)
      : await supabase.from('projects').insert(payload)
    setSaving(false)
    if (error) { setError(error.message); return }
    setModalOpen(false); fetchProjects()
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">จัดการโครงการทั้งหมด</p>
        </div>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>เพิ่มโครงการ</Button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1,2,3].map(i => <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState icon={Building2} title="ยังไม่มีโครงการ" description="เพิ่มโครงการแรกเพื่อเริ่มต้น"
          action={<Button size="sm" onClick={openCreate} icon={<Plus className="h-4 w-4" />}>เพิ่มโครงการ</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map(p => {
            const buildingCount = p.buildings?.length ?? 0
            const roomCount = p.buildings?.reduce((s, b) => s + (b.total_rentable_rooms ?? 0), 0) ?? 0
            return (
              <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                className="group cursor-pointer rounded-xl border border-gray-100 bg-white p-5 shadow-sm hover:border-blue-200 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                      <Building2 className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">{p.name}</p>
                      {p.address && <p className="mt-0.5 text-xs text-gray-400 line-clamp-1">{p.address}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={e => openEdit(e, p)}
                      className="rounded-lg p-1.5 text-gray-300 hover:bg-gray-100 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-all">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-400 transition-colors" />
                  </div>
                </div>
                <div className="mt-4 flex gap-4 text-sm text-gray-500">
                  <span>{buildingCount} อาคาร</span>
                  <span>{roomCount} ห้อง</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? 'แก้ไขโครงการ' : 'เพิ่มโครงการ'} size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>ยกเลิก</Button>
            <Button form="project-form" type="submit" loading={saving}>บันทึก</Button>
          </>
        }
      >
        <form id="project-form" onSubmit={handleSave} className="flex flex-col gap-4">
          <Input label="ชื่อโครงการ" required value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="คอนโด..." />
          <Input label="ที่อยู่" value={form.address}
            onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="123 ถ.สุขุมวิท..." />
          <Textarea label="หมายเหตุ" rows={2} value={form.note}
            onChange={e => setForm(p => ({ ...p, note: e.target.value }))} />
          {error && <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">{error}</div>}
        </form>
      </Modal>
    </div>
  )
}
