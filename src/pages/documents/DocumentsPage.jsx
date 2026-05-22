import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, FileText, Receipt, Printer } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Badge from '../../components/ui/Badge'
import EmptyState from '../../components/ui/EmptyState'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatThaiDate } from '../../lib/date'

const TABS = [
  { key: 'contracts', label: 'สัญญา' },
  { key: 'invoices',  label: 'ใบแจ้งหนี้' },
  { key: 'receipts',  label: 'ใบเสร็จรับเงิน' },
]

const TYPE_LABEL = {
  contract_initial: 'ประกัน+ล่วงหน้า',
  monthly_rent:     'ค่าเช่ารายเดือน',
  addon:            'ค่าบริการเสริม',
  final_settlement: 'เคลียร์ Move-out',
  booking_deposit:  'เงินจอง',
  other:            'อื่นๆ',
}

export default function DocumentsPage() {
  const navigate = useNavigate()
  const [tab,       setTab]       = useState('contracts')
  const [search,    setSearch]    = useState('')
  const [contracts, setContracts] = useState([])
  const [invoices,  setInvoices]  = useState([])
  const [receipts,  setReceipts]  = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: cData }, { data: iData }, { data: rData }] = await Promise.all([
      supabase.from('contracts').select(`
        id, contract_number, status, contract_start_date, contract_end_date, monthly_rent, created_at,
        rooms(room_number, buildings(name)),
        tenants(full_name)
      `).order('created_at', { ascending: false }).limit(200),
      supabase.from('invoices').select(`
        id, invoice_number, invoice_type, billing_period, total_amount, status, due_date, created_at,
        rooms(room_number, buildings(name)),
        tenants(full_name)
      `).order('created_at', { ascending: false }).limit(200),
      supabase.from('receipts').select(`
        id, receipt_number, amount, description, payer_name, issued_at, status,
        issuer:profiles!issued_by(full_name)
      `).order('issued_at', { ascending: false }).limit(200),
    ])
    setContracts(cData ?? [])
    setInvoices(iData ?? [])
    setReceipts(rData ?? [])
    setLoading(false)
  }

  const q = search.toLowerCase().trim()

  const filteredContracts = !q
    ? contracts.slice(0, 20)
    : contracts.filter(c =>
        c.contract_number?.toLowerCase().includes(q) ||
        c.tenants?.full_name?.toLowerCase().includes(q) ||
        c.rooms?.room_number?.toLowerCase().includes(q) ||
        c.rooms?.buildings?.name?.toLowerCase().includes(q)
      )

  const filteredInvoices = !q
    ? invoices.slice(0, 20)
    : invoices.filter(inv =>
        inv.invoice_number?.toLowerCase().includes(q) ||
        inv.tenants?.full_name?.toLowerCase().includes(q) ||
        inv.rooms?.room_number?.toLowerCase().includes(q) ||
        inv.rooms?.buildings?.name?.toLowerCase().includes(q)
      )

  const filteredReceipts = !q
    ? receipts.slice(0, 20)
    : receipts.filter(r =>
        r.receipt_number?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.payer_name?.toLowerCase().includes(q)
      )

  if (loading) return <PageSpinner />

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900">เอกสาร</h1>
        <p className="mt-1 text-sm text-gray-500">ค้นหาสัญญา ใบแจ้งหนี้ และใบเสร็จรับเงิน</p>
      </div>

      {/* Search */}
      <div className="mb-5 relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อผู้เช่า เลขเอกสาร ห้อง..."
          className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-5 flex border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Contracts */}
      {tab === 'contracts' && (
        <>
          <p className="mb-3 text-sm text-gray-400">
            {q ? `${filteredContracts.length} รายการ` : '20 รายการล่าสุด'}
          </p>
          {filteredContracts.length === 0 ? (
            <EmptyState icon={FileText} title="ไม่พบสัญญา" />
          ) : (
            <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
              {filteredContracts.map((c, i) => (
                <div key={c.id}
                  onClick={() => navigate(`/contracts/${c.id}`)}
                  className={`flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors ${i > 0 ? 'border-t border-gray-50' : ''}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{c.contract_number}</p>
                    <p className="text-xs text-gray-500">
                      {c.rooms?.buildings?.name} · ห้อง {c.rooms?.room_number} · {c.tenants?.full_name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatThaiDate(c.contract_start_date)} – {formatThaiDate(c.contract_end_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); window.open(`/contracts/${c.id}/print`, '_blank') }}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                      title="พิมพ์สัญญา"
                    >
                      <Printer className="h-4 w-4" />
                    </button>
                    <Badge variant={c.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Invoices */}
      {tab === 'invoices' && (
        <>
          <p className="mb-3 text-sm text-gray-400">
            {q ? `${filteredInvoices.length} รายการ` : '20 รายการล่าสุด'}
          </p>
          {filteredInvoices.length === 0 ? (
            <EmptyState icon={Receipt} title="ไม่พบใบแจ้งหนี้" />
          ) : (
            <div className="flex flex-col gap-2">
              {filteredInvoices.map(inv => (
                <div key={inv.id}
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                  className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3.5 cursor-pointer hover:shadow-md transition-all"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{inv.invoice_number}</p>
                    <p className="text-xs text-gray-500">
                      {inv.rooms?.buildings?.name} · ห้อง {inv.rooms?.room_number} · {inv.tenants?.full_name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type}
                      {inv.billing_period ? ` · ${inv.billing_period}` : ''}
                      {' · ครบ '}{formatThaiDate(inv.due_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold text-gray-900">฿{Number(inv.total_amount).toLocaleString('th-TH')}</span>
                    <Badge variant={inv.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Receipts */}
      {tab === 'receipts' && (
        <>
          <p className="mb-3 text-sm text-gray-400">
            {q ? `${filteredReceipts.length} รายการ` : '20 รายการล่าสุด'}
          </p>
          {filteredReceipts.length === 0 ? (
            <EmptyState icon={Receipt} title="ไม่พบใบเสร็จรับเงิน" />
          ) : (
            <div className="flex flex-col gap-2">
              {filteredReceipts.map(r => (
                <div key={r.id}
                  className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3.5"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{r.receipt_number}</p>
                    {r.description && <p className="text-sm text-gray-700">{r.description}</p>}
                    {r.payer_name && <p className="text-xs text-gray-500">ผู้ชำระ: {r.payer_name}</p>}
                    <p className="text-xs text-gray-400">
                      {formatThaiDate(r.issued_at)}
                      {r.issuer?.full_name ? ` · โดย ${r.issuer.full_name}` : ''}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-green-700 shrink-0">
                    ฿{Number(r.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
