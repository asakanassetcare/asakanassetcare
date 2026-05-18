import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { registerFonts, thaiDate, baht } from '../../lib/pdf'

registerFonts()

const TYPE_LABEL = {
  contract_initial: 'เงินประกัน + ค่าเช่าล่วงหน้า',
  monthly_rent:     'ค่าเช่ารายเดือน',
  addon:            'ค่าบริการเสริม',
  final_settlement: 'เคลียร์ Move-out',
  booking_deposit:  'เงินจอง',
  other:            'อื่นๆ',
}

const S = StyleSheet.create({
  page:    { fontFamily: 'Sarabun', fontSize: 11, padding: 40, color: '#111' },
  header:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#ddd', paddingBottom: 12 },
  company: { fontSize: 15, fontWeight: 700 },
  docType: { fontSize: 14, fontWeight: 700, textAlign: 'right' },
  docNum:  { fontSize: 11, color: '#555', textAlign: 'right' },
  section: { marginBottom: 14 },
  row:     { flexDirection: 'row', marginBottom: 4 },
  label:   { width: 140, color: '#555' },
  value:   { flex: 1, fontWeight: 700 },
  table:   { borderWidth: 1, borderColor: '#ddd', marginTop: 6 },
  th:      { flexDirection: 'row', backgroundColor: '#f5f5f5', borderBottomWidth: 1, borderBottomColor: '#ddd', padding: '6 8' },
  tr:      { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eee', padding: '6 8' },
  tfoot:   { flexDirection: 'row', padding: '8 8', borderTopWidth: 1, borderTopColor: '#ddd', backgroundColor: '#fafafa' },
  amt:     { textAlign: 'right' },
  total:   { fontSize: 13, fontWeight: 700 },
  note:    { marginTop: 20, fontSize: 10, color: '#888' },
})

export default function InvoicePDF({ invoice: inv, items = [], company = {} }) {
  if (!inv) return null
  return (
    <Document title={`ใบแจ้งหนี้ ${inv.invoice_number}`}>
      <Page size="A4" style={S.page}>
        {/* Header */}
        <View style={S.header}>
          <View>
            <Text style={S.company}>{company.name || 'บริษัท'}</Text>
            {company.address && <Text style={{ fontSize: 10, color: '#555', marginTop: 3 }}>{company.address}</Text>}
            {company.phone && <Text style={{ fontSize: 10, color: '#555' }}>{company.phone}</Text>}
            {company.tax_id && <Text style={{ fontSize: 10, color: '#555' }}>เลขผู้เสียภาษี: {company.tax_id}</Text>}
          </View>
          <View>
            <Text style={S.docType}>ใบแจ้งหนี้</Text>
            <Text style={S.docNum}>{inv.invoice_number}</Text>
          </View>
        </View>

        {/* Bill to / Info */}
        <View style={{ flexDirection: 'row', marginBottom: 16, gap: 20 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>เรียน</Text>
            <Text style={{ fontWeight: 700 }}>{inv.tenants?.full_name}</Text>
            <Text style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
              {inv.rooms?.buildings?.name} ห้อง {inv.rooms?.room_number}
            </Text>
          </View>
          <View style={{ width: 180 }}>
            <View style={S.row}><Text style={[S.label, { width: 80 }]}>ประเภท</Text><Text style={{ flex: 1 }}>{TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type}</Text></View>
            {inv.billing_period && <View style={S.row}><Text style={[S.label, { width: 80 }]}>รอบบิล</Text><Text style={{ flex: 1 }}>{inv.billing_period}</Text></View>}
            <View style={S.row}><Text style={[S.label, { width: 80 }]}>วันออก</Text><Text style={{ flex: 1 }}>{thaiDate(inv.issue_date)}</Text></View>
            <View style={S.row}><Text style={[S.label, { width: 80 }]}>ครบกำหนด</Text><Text style={{ flex: 1, color: '#d00' }}>{thaiDate(inv.due_date)}</Text></View>
          </View>
        </View>

        {/* Items table */}
        <View style={S.table}>
          <View style={S.th}>
            <Text style={{ flex: 3, fontSize: 10, fontWeight: 700 }}>รายการ</Text>
            <Text style={{ width: 50, textAlign: 'right', fontSize: 10, fontWeight: 700 }}>จำนวน</Text>
            <Text style={{ width: 90, textAlign: 'right', fontSize: 10, fontWeight: 700 }}>ราคา/หน่วย</Text>
            <Text style={{ width: 90, textAlign: 'right', fontSize: 10, fontWeight: 700 }}>รวม</Text>
          </View>
          {items.map((it, i) => (
            <View key={i} style={S.tr}>
              <Text style={{ flex: 3 }}>{it.description}</Text>
              <Text style={{ width: 50, textAlign: 'right' }}>{it.quantity}</Text>
              <Text style={{ width: 90, textAlign: 'right' }}>{baht(it.unit_price)}</Text>
              <Text style={{ width: 90, textAlign: 'right', color: it.amount < 0 ? '#16a34a' : '#111' }}>
                {it.amount < 0 ? '-' : ''}{baht(Math.abs(it.amount))}
              </Text>
            </View>
          ))}
          <View style={S.tfoot}>
            <Text style={{ flex: 3 }}></Text>
            <Text style={{ width: 50 }}></Text>
            <Text style={{ width: 90, textAlign: 'right', fontWeight: 700 }}>ยอดรวม</Text>
            <Text style={{ width: 90, textAlign: 'right', fontWeight: 700, fontSize: 13 }}>{baht(inv.total_amount)}</Text>
          </View>
        </View>

        {/* Bank info */}
        {company.bank_account && (
          <View style={{ marginTop: 20, padding: 12, backgroundColor: '#f9f9f9', borderRadius: 6 }}>
            <Text style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>ชำระเงิน</Text>
            <Text style={{ fontSize: 10, color: '#555' }}>{company.bank_account}</Text>
          </View>
        )}

        {company.footer_note && (
          <Text style={S.note}>{company.footer_note}</Text>
        )}
      </Page>
    </Document>
  )
}
