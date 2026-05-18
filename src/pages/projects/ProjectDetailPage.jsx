import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Plus, ChevronRight, Layers, ChevronLeft, Pencil } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import EmptyState from '../../components/ui/EmptyState'
import { PageSpinner } from '../../components/ui/Spinner'

const EMPTY_BUILDING = { name: '', total_floors: 1, note: '', card_color: '' }

const PRESET_COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#ec4899','#0ea5e9','#f97316','#64748b']

export default function ProjectDetailPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [buildings, setBuildings] = useState([])
  const [loading, setLoading] = useState(true)

  // Project edit
  const [editProjectOpen, setEditProjectOpen] = useState(false)
  const [projectForm, setProjectForm] = useState({ name: '', address: '', note: '' })
  const [savingProject, setSavingProject] = useState(false)

  // Building modal
  const [buildingModal, setBuildingModal] = useState(false)
  const [editingBuilding, setEditingBuilding] = useState(null)
  const [buildingForm, setBuildingForm] = useState(EMPTY_BUILDING)
  const [savingBuilding, setSavingBuilding] = useState(false)
  const [buildingError, setBuildingError] = useState('')

  useEffect(() => { fetchAll() }, [projectId])

  async function fetchAll() {
    const [{ data: proj }, { data: blds }] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('buildings').select('*, rooms(id, status)').eq('project_id', projectId).order('name'),
    ])
    if (!proj) { navigate('/projects'); return }
    setProject(proj)
    setBuildings(blds ?? [])
    setLoading(false)
  }

  function openCreateBuilding() {
    setEditingBuilding(null)
    setBuildingForm(EMPTY_BUILDING)
    setBuildingError('')
    setBuildingModal(true)
  }

  function openEditBuilding(e, b) {
    e.stopPropagation()
    setEditingBuilding(b)
    setBuildingForm({ name: b.name, total_floors: b.total_floors, note: b.note ?? '', card_color: b.card_color ?? '' })
    setBuildingError('')
    setBuildingModal(true)
  }

  async function handleSaveBuilding(e) {
    e.preventDefault()
    setBuildingError('')
    setSavingBuilding(true)
    const payload = {
      project_id: projectId,
      name: buildingForm.name.trim(),
      total_floors: Number(buildingForm.total_floors),
      note: buildingForm.note.trim() || null,
      card_color: buildingForm.card_color.trim() || null,
    }
    const { error } = editingBuilding
      ? await supabase.from('buildings').update(payload).eq('id', editingBuilding.id)
      : await supabase.from('buildings').insert(payload)
    setSavingBuilding(false)
    if (error) { setBuildingError(error.message); return }
    setBuildingModal(false)
    fetchAll()
  }

  async function handleSaveProject(e) {
    e.preventDefault()
    setSavingProject(true)
    await supabase.from('projects').update({
      name: projectForm.name.trim(),
      address: projectForm.address.trim() || null,
      note: projectForm.note.trim() || null,
    }).eq('id', projectId)
    setSavingProject(false)
    setEditProjectOpen(false)
    fetchAll()
  }

  if (loading) return <PageSpinner />

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link to="/projects" className="hover:text-blue-600 transition-colors">โครงการ</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-gray-900 font-medium">{project.name}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{project.name}</h1>
          {project.address && <p className="mt-1 text-sm text-gray-500">{project.address}</p>}
          {project.note && <p className="mt-0.5 text-xs text-gray-400">{project.note}</p>}
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<Pencil className="h-3.5 w-3.5" />}
            onClick={() => { setProjectForm({ name: project.name, address: project.address ?? '', note: project.note ?? '' }); setEditProjectOpen(true) }}
          >
            แก้ไขโครงการ
          </Button>
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreateBuilding}>เพิ่มอาคาร</Button>
        </div>
      </div>

      {/* Buildings */}
      {buildings.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="ยังไม่มีอาคาร"
          description="เพิ่มอาคารเพื่อจัดการห้อง"
          action={<Button onClick={openCreateBuilding} icon={<Plus className="h-4 w-4" />}>เพิ่มอาคาร</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {buildings.map((b) => {
            const rooms = b.rooms ?? []
            const available = rooms.filter(r => r.status === 'available').length
            const occupied  = rooms.filter(r => r.status === 'occupied').length
            return (
              <div
                key={b.id}
                onClick={() => navigate(`/projects/${projectId}/buildings/${b.id}`)}
                className="group cursor-pointer rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-all"
                style={{ borderColor: b.card_color ?? '#f3f4f6' }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl"
                      style={{ backgroundColor: b.card_color ? `${b.card_color}20` : '#f3f4f6' }}>
                      <Layers className="h-4 w-4" style={{ color: b.card_color ?? '#6b7280' }} />
                    </div>
                    <p className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">{b.name}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={(e) => openEditBuilding(e, b)} className="rounded-lg p-1 text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-all">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-400 transition-colors" />
                  </div>
                </div>
                <div className="mt-3 flex gap-3 text-xs text-gray-500">
                  <span>{b.total_floors} ชั้น</span>
                  <span>{rooms.length} ห้อง</span>
                  <span className="text-green-600">{available} ว่าง</span>
                  <span className="text-blue-600">{occupied} มีผู้เช่า</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Building Modal */}
      <Modal
        open={buildingModal}
        onClose={() => setBuildingModal(false)}
        title={editingBuilding ? 'แก้ไขอาคาร' : 'เพิ่มอาคาร'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBuildingModal(false)}>ยกเลิก</Button>
            <Button form="building-form" type="submit" loading={savingBuilding}>บันทึก</Button>
          </>
        }
      >
        <form id="building-form" onSubmit={handleSaveBuilding} className="flex flex-col gap-4">
          <Input label="ชื่ออาคาร" required value={buildingForm.name} onChange={(e) => setBuildingForm(p => ({ ...p, name: e.target.value }))} placeholder="อาคาร A" />
          <Input label="จำนวนชั้น" type="number" min={1} max={100} required value={buildingForm.total_floors} onChange={(e) => setBuildingForm(p => ({ ...p, total_floors: e.target.value }))} />
          <Input label="หมายเหตุ" value={buildingForm.note} onChange={(e) => setBuildingForm(p => ({ ...p, note: e.target.value }))} />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">สี card ห้อง</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={buildingForm.card_color}
                onChange={e => setBuildingForm(p => ({ ...p, card_color: e.target.value }))}
                placeholder="#hex หรือเว้นว่าง"
                className="h-9 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {buildingForm.card_color && (
                <div className="h-6 w-6 rounded-full border border-gray-200 shrink-0" style={{ backgroundColor: buildingForm.card_color }} />
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button key={c} type="button"
                  onClick={() => setBuildingForm(p => ({ ...p, card_color: c }))}
                  className="h-5 w-5 rounded-full border-2 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c, borderColor: buildingForm.card_color === c ? '#1d4ed8' : 'transparent' }}
                />
              ))}
              {buildingForm.card_color && (
                <button type="button" onClick={() => setBuildingForm(p => ({ ...p, card_color: '' }))}
                  className="text-[10px] text-gray-400 hover:text-gray-600 px-1">ล้าง</button>
              )}
            </div>
            <p className="text-xs text-gray-400">ห้องในอาคารนี้จะแสดง card สีนี้ (เว้นว่างหากไม่ต้องการ)</p>
          </div>

          {buildingError && <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">{buildingError}</div>}
        </form>
      </Modal>

      {/* Project Edit Modal */}
      <Modal
        open={editProjectOpen}
        onClose={() => setEditProjectOpen(false)}
        title="แก้ไขโครงการ"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditProjectOpen(false)}>ยกเลิก</Button>
            <Button form="edit-project-form" type="submit" loading={savingProject}>บันทึก</Button>
          </>
        }
      >
        <form id="edit-project-form" onSubmit={handleSaveProject} className="flex flex-col gap-4">
          <Input label="ชื่อโครงการ" required value={projectForm.name} onChange={(e) => setProjectForm(p => ({ ...p, name: e.target.value }))} />
          <Input label="ที่อยู่" value={projectForm.address} onChange={(e) => setProjectForm(p => ({ ...p, address: e.target.value }))} />
          <Input label="หมายเหตุ" value={projectForm.note} onChange={(e) => setProjectForm(p => ({ ...p, note: e.target.value }))} />
        </form>
      </Modal>
    </div>
  )
}
