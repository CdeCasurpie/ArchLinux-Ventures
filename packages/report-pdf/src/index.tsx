import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { ReportDocumentV1, ReportBlock, Expediente, Visita, Profile } from '@archforms/domain';

export interface InformeInput {
  doc: ReportDocumentV1;
  visita: Visita;
  expediente: Expediente;
  profesional: Profile | null;
  /** photoId -> dataURL (data:image/jpeg;base64,…) con bytes ya descargados. */
  photos: Record<string, string>;
}

const s = StyleSheet.create({
  page: { padding: 40, paddingTop: 32, fontSize: 10, fontFamily: 'Helvetica', color: '#1e293b', lineHeight: 1.5 },
  brandBand: { backgroundColor: '#0f172a', color: '#ffffff', marginHorizontal: -40, marginTop: -32, paddingHorizontal: 40, paddingVertical: 14, marginBottom: 12 },
  brand: { fontSize: 9, fontWeight: 'bold', letterSpacing: 2, color: '#93c5fd', marginBottom: 2 },
  bandTitle: { fontSize: 17, fontWeight: 'bold', color: '#ffffff' },
  bandSub: { fontSize: 9, color: '#cbd5e1' },
  h1: { fontSize: 15, fontWeight: 'bold', color: '#0f172a', marginBottom: 2 },
  sub: { fontSize: 10, color: '#475569', marginBottom: 12 },
  h2: { fontSize: 12, fontWeight: 'bold', color: '#ffffff', backgroundColor: '#334155', paddingHorizontal: 8, paddingVertical: 4, marginTop: 14, marginBottom: 6 },
  h3: { fontSize: 11, fontWeight: 'bold', color: '#334155', marginTop: 10, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 3 },
  cell: { flex: 1 },
  label: { fontSize: 8, color: '#64748b', textTransform: 'uppercase' },
  value: { fontSize: 10, color: '#0f172a' },
  para: { marginBottom: 6 },
  muted: { color: '#64748b', fontStyle: 'italic' },
  zebra: { backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 3 },
  plain: { paddingHorizontal: 6, paddingVertical: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  // Marco de altura fija (min = max): la foto nunca se deforma (contain),
  // nunca ocupa una página entera y la grilla queda uniforme.
  photoFrameFull: { width: '100%', height: 190, marginBottom: 2 },
  photoFrameHalf: { width: '48%', height: 150, marginBottom: 2 },
  photoImg: { width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#ffffff' },
  caption: { fontSize: 8, color: '#64748b', marginBottom: 4 },
  conclusionsBox: { backgroundColor: '#f8fafc', borderLeftWidth: 3, borderLeftColor: '#0ea5e9', padding: 8, marginTop: 4 },
  signBox: { marginTop: 14, flexDirection: 'row', gap: 24 },
  signCell: { flex: 1, borderTopWidth: 1, borderTopColor: '#0f172a', paddingTop: 4 },
});

function answerLabel(value: unknown): string {
  if (value === 'si') return 'Sí';
  if (value === 'no') return 'No';
  if (value === 'na') return 'N/A';
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

function HeaderBlock({ visita, expediente, profesional }: { visita: Visita; expediente: Expediente; profesional: Profile | null }) {
  const item = (label: string, value: string | null | undefined) => (
    <View style={s.cell}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value || '—'}</Text>
    </View>
  );
  return (
    <View>
      <View style={s.brandBand}>
        <Text style={s.brand}>ARCHFORMS · INFORME DE VISITA</Text>
        <Text style={s.bandTitle}>Visita {String(visita.nro_visita).padStart(2, '0')} · Exp. {expediente.nro_expediente}</Text>
        <Text style={s.bandSub}>{expediente.detalle_obra || expediente.propietario || ''} — {expediente.ubicacion}</Text>
      </View>
      <View style={s.row}>
        {item('Fecha', visita.fecha)}
        {item('Licencia', expediente.nro_licencia)}
        {item('Modalidad', expediente.modalidad)}
      </View>
      <View style={s.row}>
        {item('Propietario', expediente.propietario)}
        {item('Responsable de obra', visita.responsable_obra_nombre)}
        {item('CIP / Colegiatura', visita.responsable_obra_colegiatura)}
      </View>
      <View style={s.row}>
        {item('Profesional', profesional?.nombre_completo)}
        {item('Cargo', profesional?.cargo)}
        {item('Colegiatura', profesional?.nro_colegiatura)}
      </View>
    </View>
  );
}

function ChecklistBlock({ visita }: { visita: Visita }) {
  return (
    <View>
      <Text style={s.h2}>{visita.checklist_nombre}</Text>
      {visita.checklist_esquema_json.sections.map(section => (
        <View key={section.id}>
          <Text style={s.h3}>{section.title}</Text>
          {section.fields.map((field, fi) => (
            <View key={field.id} style={[s.row, fi % 2 === 0 ? s.zebra : s.plain]}>
              <View style={{ flex: 3 }}>
                <Text>{field.label}</Text>
              </View>
              <View style={{ flex: 2 }}>
                <Text>{answerLabel(visita.checklist_respuestas_json[field.id])}</Text>
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function CaptureGroupBlock({ n, block, photos }: { n: number; block: Extract<ReportBlock, { type: 'capture-group' }>; photos: Record<string, string> }) {
  const available = block.photoIds.filter(id => photos[id]);
  const missing = block.photoIds.length - available.length;
  return (
    // Comentario + fotos siempre en la misma página.
    <View wrap={false}>
      <Text style={s.h3}>Hallazgo {n}</Text>
      <Text style={s.para}>{block.comment || 'Sin comentario.'}</Text>
      {available.length > 0 ? (
        <View style={s.grid}>
          {available.map((id, i) => (
            <View key={id} style={available.length === 1 ? s.photoFrameFull : s.photoFrameHalf}>
              <Image src={photos[id]} style={s.photoImg} />
              <Text style={s.caption}>Foto {i + 1}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={s.muted}>[Sin fotografías incluidas]</Text>
      )}
      {missing > 0 && <Text style={s.muted}>[{missing} foto(s) aún no descargadas en este dispositivo]</Text>}
    </View>
  );
}

function SignaturesBlock({ visita, profesional }: { visita: Visita; profesional: Profile | null }) {
  const signer = (nombre: string | null | undefined, cargo: string | null | undefined, extra?: string | null) => (
    <View style={s.signCell}>
      <Text style={s.value}>{nombre || '—'}</Text>
      <Text style={s.label}>{cargo || 'Firma'}</Text>
      {extra ? <Text style={s.label}>{extra}</Text> : null}
    </View>
  );
  return (
    // Nunca se corta entre páginas: las firmas van juntas al final (sin banda).
    <View wrap={false}>
      <Text style={s.h3}>Firmas</Text>
      <View style={s.signBox}>
        {signer(visita.responsable_obra_nombre, 'Responsable de obra', visita.responsable_obra_colegiatura)}
        {signer(profesional?.nombre_completo, profesional?.cargo ?? 'Profesional', profesional?.nro_colegiatura)}
      </View>
    </View>
  );
}

export function buildInformeDoc(input: InformeInput) {
  const { doc, visita, expediente, profesional, photos } = input;
  let hallazgo = 0;
  return (
    <Document title={`Informe ${expediente.nro_expediente} V${visita.nro_visita}`}>
      <Page size="A4" style={s.page}>
        {doc.blocks.map(block => {
          switch (block.type) {
            case 'header':
              return <HeaderBlock key={block.id} visita={visita} expediente={expediente} profesional={profesional} />;
            case 'checklist':
              return <ChecklistBlock key={block.id} visita={visita} />;
            case 'capture-group':
              hallazgo += 1;
              return <CaptureGroupBlock key={block.id} n={hallazgo} block={block} photos={photos} />;
            case 'text':
              return <Text key={block.id} style={s.para}>{block.content}</Text>;
            case 'conclusions':
              return (
                <View key={block.id}>
                  <Text style={s.h2}>Conclusiones</Text>
                  <View style={s.conclusionsBox}>
                    <Text style={s.para}>{block.content || '(Sin conclusiones registradas.)'}</Text>
                  </View>
                </View>
              );
            case 'signatures':
              return <SignaturesBlock key={block.id} visita={visita} profesional={profesional} />;
          }
        })}
      </Page>
    </Document>
  );
}

/**
 * Estampa el pie X/Y en cada página con coordenadas PDF exactas.
 * (El `fixed`+`absolute` de @react-pdf/renderer 4.9.0 ignora los offsets y el
 * pie cae fuera de página: verificado por render + extracción de texto.)
 */
export async function stampPageNumbers(
  pdfBytes: Uint8Array,
  rightText: (page: number, total: number) => string,
  leftText = 'ARCHFORMS',
  opts: { useObjectStreams?: boolean } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const { width } = page.getSize();
    const y = 30;
    page.drawText(leftText, { x: 40, y, size: 8, font, color: rgb(0.39, 0.45, 0.55) });
    const right = rightText(i + 1, pages.length);
    const w = font.widthOfTextAtSize(right, 8);
    page.drawText(right, { x: width - 40 - w, y, size: 8, font, color: rgb(0.2, 0.27, 0.35) });
    page.drawLine({
      start: { x: 40, y: y + 12 },
      end: { x: width - 40, y: y + 12 },
      thickness: 0.75,
      color: rgb(0.58, 0.64, 0.72),
    });
  });
  return (await doc.save({ useObjectStreams: opts.useObjectStreams ?? true })) as Uint8Array;
}

/** Nombre estable del PDF: Informe-<EXP>-V<NN>.pdf */
export function informeFileName(expediente: Pick<Expediente, 'nro_expediente'>, visita: Pick<Visita, 'nro_visita'>): string {
  const exp = expediente.nro_expediente.replace(/[^A-Za-z0-9_-]+/g, '_');
  return `Informe-${exp}-V${String(visita.nro_visita).padStart(2, '0')}.pdf`;
}
