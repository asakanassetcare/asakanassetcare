import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { registerFonts, thaiDate, baht } from '../../lib/pdf'

registerFonts()

const S = StyleSheet.create({
  page:    { fontFamily: 'Sarabun', fontSize: 11, padding: 40, color: '#111' },
  header:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#ddd', paddingBottom: 12 },
  company: { fontSize: 15, fontWeight: 700 },
  stamp:   { padding: '8 16', borderWidth: 2, borderColor: '#16a34a', borderRadius: 6 },
  stampTxt:{ fontSize: 14, fontWeight: 700, color: '#16a34a', textAlign: 'center' },
  row:     { flexDirection: 'row', marginBottom: 6 },
  label:   { width: 160, color: '#555' },
  value:   { flex: 1, fontWeight: 700 },
  amtBox:  { marginTop: 24, padding: 16, backgroundColor: '#f0fdf4', borderRadius: 8, alignItems: 'center' },
  amtLbl:  { fontSize: 10, color: '#16a34a', marginBottom: 4 },
  amtVal:  { fontSize: 22, fontWeight: 700, color: '#15803d' },
  note:    { marginTop: 24, fontSize: 10, color: '#888', textAlign: 'center' },
})

export default function ReceiptPDF({ payment, invoice: inv, company = {} }) {
  if (!payment || !inv) return null
  return (
    <Document title={`ใบเสร็จ ${inv.invoice_number}`}>
      <Page size="A4" style={S.page}>
        {/* Header */}
        <View style={S.header}>
          <View>
            <Text style={S.company}>{company.name || 'บริษัท'}</Text>
            {company.address && <Text style={{ fontSize: 10, color: '#555', marginTop: 3 }}>{company.address}</Text>}
          </View>
          <View style={S.stamp}>
            <Text style={S.stampTxt}>ใบเสร็จรับเงิน</Text>
            <Text style={{ fontSize: 9, color: '#16a34a', textAlign: 'center', marginTop: 2 }}>(ชั่วคราว)</Text>
          </View>
        </View>

        {/* Info */}
        <View style={{ marginBottom: 20 }}>
          <View style={S.row}><Text style={S.label}>เลขใบแจ้งหนี้</Text><Text style={S.value}>{inv.invoice_number}</Text></View>
          <View style={S.row}><Text style={S.label}>ผู้ชำระ</Text><Text style={S.value}>{inv.tenants?.full_name}</Text></View>
          <View style={S.row}><Text style={S.label}>ที่อยู่</Text><Text style={S.value}>{inv.rooms?.buildings?.name} ห้อง {inv.rooms?.room_number}</Text></View>
          <View style={S.row}><Text style={S.label}>วันที่ชำระ</Text><Text style={S.value}>{thaiDate(payment.paid_date)}</Text></View>
          {payment.bank_reference && <View style={S.row}><Text style={S.label}>เลขอ้างอิง</Text><Text style={S.value}>{payment.bank_reference}</Text></View>}
        </View>

        {/* Amount */}
        <View style={S.amtBox}>
          <Text style={S.amtLbl}>ยอดที่ได้รับ</Text>
          <Text style={S.amtVal}>{baht(payment.amount)}</Text>
        </View>

        <Text style={S.note}>
          เอกสารนี้ออกโดยระบบคอมพิวเตอร์ ใช้เป็นหลักฐานการชำระเงินชั่วคราวเท่านั้น
        </Text>

        {company.footer_note && (
          <Text style={[S.note, { marginTop: 8 }]}>{company.footer_note}</Text>
        )}
      </Page>
    </Document>
  )
}
