import { Fragment } from 'react';
import type React from 'react';
import { Document, Page, View, Text, Image, Svg, Path, StyleSheet } from '@react-pdf/renderer';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { ReportDocumentV1, ReportBlock, Expediente, Visita, Profile } from '@archforms/domain';
import { AVANCE_OBRA_FIELD_ID } from '@archforms/domain';
import { imageSizeFromDataUrl } from './mosaic';
import { PAGE_TOP, PAGE_BOTTOM, MARGIN, MOSAIC, CAP_FULL } from './layout';
import { planPhotoPages, estimateChecklistHeight, estimateTextHeight, formatAnswerValue, H, SAFETY, type PlanGroup, type PlanUnit } from './paginate';

export interface InformeInput {
  doc: ReportDocumentV1;
  visita: Visita;
  expediente: Expediente;
  profesional: Profile | null;
  /** photoId -> dataURL (data:image/jpeg;base64,…) con bytes ya descargados. */
  photos: Record<string, string>;
  /** Opcional: dimensiones reales por photoId. Si falta, se leen del dataURL. */
  photoDims?: Record<string, { w: number; h: number }>;
}

// ── Paleta y medidas (ver layout.ts) ─────────────────────────────────────────
const C = {
  navy: '#01437a', blue: '#075292', ink: '#132238', muted: '#65758b',
  line: '#dfe5ee', zebra: '#f6f8fb', tint: '#e9f0f8', red: '#b3261e', okBg: '#01437a',
};

const s = StyleSheet.create({
  page: { paddingHorizontal: MARGIN, paddingTop: PAGE_TOP, paddingBottom: PAGE_BOTTOM, fontSize: 10, fontFamily: 'Helvetica', color: C.ink, lineHeight: 1.45 },

  // Encabezado
  band: { marginHorizontal: -MARGIN, marginTop: -PAGE_TOP, paddingHorizontal: MARGIN, paddingTop: 22, paddingBottom: 16, backgroundColor: C.navy },
  brand: { fontSize: 8, fontWeight: 'bold', letterSpacing: 2.2, color: '#9cc3e6', marginBottom: 6 },
  bandTitle: { fontSize: 20, fontWeight: 'bold', color: '#ffffff', lineHeight: 1.15 },
  bandSub: { fontSize: 9, color: '#c9dbee', marginTop: 5 },
  card: { marginTop: 12, marginBottom: 6, borderWidth: 0.75, borderColor: C.line, borderRadius: 4, backgroundColor: '#fbfcfe', paddingHorizontal: 10, paddingVertical: 8 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 5 },
  cell: { flex: 1 },
  label: { fontSize: 7, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  value: { fontSize: 10, color: C.ink },

  // Títulos
  h2: { fontSize: 12, fontWeight: 'bold', color: C.navy, marginTop: 16, marginBottom: 7, paddingBottom: 3, borderBottomWidth: 1.5, borderBottomColor: C.navy },
  para: { marginBottom: 6 },

  // Checklist minimalista: sin bloques de color, solo tipografía y líneas finas.
  ckSection: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 13, paddingBottom: 3, borderBottomWidth: 0.75, borderBottomColor: C.line },
  ckNum: { width: 14, fontSize: 7.2, lineHeight: 1.3, fontWeight: 'bold', color: C.muted, letterSpacing: 0.4 },
  ckSectionTxt: { flex: 1, fontSize: 9.2, lineHeight: 1.3, fontWeight: 'bold', color: C.navy, letterSpacing: 0.2 },
  ckLegend: { flexDirection: 'row', width: 78 },
  ckLegendTxt: { width: 26, textAlign: 'center', fontSize: 6.3, lineHeight: 1.2, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  ckRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 3.5, borderBottomWidth: 0.5, borderBottomColor: '#edf1f6' },
  ckLabelCell: { flex: 1, paddingRight: 12 },
  ckLabel: { fontSize: 8.8, lineHeight: 1.3, color: C.ink },
  ckDesc: { fontSize: 7.3, lineHeight: 1.3, color: C.muted, fontStyle: 'italic', marginTop: 1 },
  ckValue: { fontSize: 8.8, lineHeight: 1.3, color: C.ink, textAlign: 'right', maxWidth: 200 },
  ckNote: { fontSize: 8.6, lineHeight: 1.35, color: C.ink, marginTop: 3 },
  ckMarks: { flexDirection: 'row', width: 78 },
  ckCol: { width: 26, alignItems: 'center', paddingTop: 0.5 },
  avanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2, marginBottom: 8, paddingVertical: 4, borderBottomWidth: 0.75, borderBottomColor: C.line },
  avanceBandTxt: { fontSize: 7.5, fontWeight: 'bold', letterSpacing: 1.1, color: C.muted },
  avanceBandVal: { fontSize: 13, color: C.navy, lineHeight: 1.2 },
  box: { width: 10, height: 10, borderWidth: 0.9, borderColor: '#c6d0dc', borderRadius: 1.5, alignItems: 'center', justifyContent: 'center' },

  // Hallazgos y mosaico
  groupTitle: { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 5 },
  badge: { width: 16, height: 16, borderRadius: 8, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  badgeTxt: { color: '#ffffff', fontSize: 8.5, fontWeight: 'bold', lineHeight: 1 },
  groupTitleTxt: { fontSize: 10.5, fontWeight: 'bold', color: C.navy },
  mosaicRow: { flexDirection: 'row', gap: MOSAIC.gap, marginBottom: MOSAIC.gap },
  photo: { overflow: 'hidden', borderRadius: 2, backgroundColor: '#eef1f5' },
  comment: { marginTop: 4, marginBottom: 6, paddingLeft: 9, paddingVertical: 1, borderLeftWidth: 2.5, borderLeftColor: C.blue, fontSize: 9.5 },
  muted: { color: C.muted, fontStyle: 'italic', fontSize: 9 },

  // Firmas
  signBox: { marginTop: 24, flexDirection: 'row', flexWrap:'wrap', gap: 24 },
  signCell: { width:'46%' },
  signSpace: { height:64, justifyContent:'flex-end', alignItems:'center' },
  signIdentity: { borderTopWidth:1, borderTopColor:C.navy, paddingTop:4 },
});

// ── Utilidades ──────────────────────────────────────────────────────────────
type Answer = 'si' | 'no' | 'na' | null;
function asAnswer(v: unknown): Answer { return v === 'si' || v === 'no' || v === 'na' ? v : null; }
function Mark({ kind, on }: { kind: 'si' | 'no' | 'na'; on: boolean }) {
  if (!on) return <View style={s.box} />;
  const color = kind === 'si' ? C.okBg : kind === 'no' ? C.red : C.muted;
  return (
    <View style={[s.box, { borderColor: color, backgroundColor: kind === 'si' ? color : '#ffffff' }]}>
      <Svg width={8} height={8} viewBox="0 0 10 10">
        {kind === 'si' && <Path d="M1.8 5.4 L4.1 7.7 L8.3 2.4" stroke="#ffffff" strokeWidth={1.7} fill="none" />}
        {kind === 'no' && <Path d="M2.2 2.2 L7.8 7.8 M7.8 2.2 L2.2 7.8" stroke={color} strokeWidth={1.7} fill="none" />}
        {kind === 'na' && <Path d="M2.2 5 L7.8 5" stroke={color} strokeWidth={1.7} fill="none" />}
      </Svg>
    </View>
  );
}

// ── Bloques ─────────────────────────────────────────────────────────────────
function HeaderBlock({ visita, expediente, profesional }: { visita: Visita; expediente: Expediente; profesional: Profile | null }) {
  const item = (label: string, value: string | null | undefined) => (
    <View style={s.cell}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value || '—'}</Text>
    </View>
  );
  const sub = [expediente.detalle_obra || expediente.propietario, expediente.ubicacion].filter(Boolean).join('  ·  ');
  return (
    <View>
      <View style={s.band}>
        <Text style={s.brand}>ARCHFORMS · INFORME DE VISITA</Text>
        <Text style={s.bandTitle}>Visita {String(visita.nro_visita).padStart(2, '0')}{expediente.total_visitas_programadas?`/${expediente.total_visitas_programadas}`:''} · Exp. {expediente.nro_expediente}</Text>
        {sub ? <Text style={s.bandSub}>{sub}</Text> : null}
      </View>
      <View style={s.card}>
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
        <View style={[s.row, { marginBottom: 0 }]}>
          {item('Profesional', profesional?.nombre_completo)}
          {item('Cargo', profesional?.cargo)}
          {item('Colegiatura', profesional?.nro_colegiatura)}
        </View>
      </View>
    </View>
  );
}

function ChecklistBlock({ visita }: { visita: Visita }) {
  const answers = visita.checklist_respuestas_json;
  const avance = visita.checklist_esquema_json.sections.flatMap(sec => sec.fields).find(f => f.id === AVANCE_OBRA_FIELD_ID);
  const sections = visita.checklist_esquema_json.sections
    .map(section => ({ section, fields: section.fields.filter(f => f.id !== AVANCE_OBRA_FIELD_ID) }))
    .filter(({ fields }) => fields.length > 0);
  // Fragmento plano: cada fila es hijo directo de <Page> para que wrap/minPresenceAhead funcionen.
  // Fiel al formulario: casillas solo en boolean, valor en el resto y sin columna de observaciones.
  return (
    <Fragment>
      <Text style={s.h2} minPresenceAhead={80}>{visita.checklist_nombre}</Text>
      {avance && (
        <View style={s.avanceRow} wrap={false} minPresenceAhead={40}>
          <Text style={s.avanceBandTxt}>AVANCE DE OBRA</Text>
          <Text style={s.avanceBandVal}>{formatAnswerValue(avance, answers[avance.id])}</Text>
        </View>
      )}
      {sections.map(({ section, fields }, index) => {
        const booleans = fields.some(f => (f.type ?? 'boolean') === 'boolean');
        return (
          <Fragment key={section.id}>
            <View style={s.ckSection} wrap={false} minPresenceAhead={36}>
              <Text style={s.ckNum}>{String(index + 1).padStart(2, '0')}</Text>
              <Text style={s.ckSectionTxt}>{section.title}</Text>
              {booleans && (
                <View style={s.ckLegend}>
                  <Text style={s.ckLegendTxt}>Sí</Text>
                  <Text style={s.ckLegendTxt}>No</Text>
                  <Text style={s.ckLegendTxt}>N/A</Text>
                </View>
              )}
            </View>
            {fields.map(field => {
              const isBoolean = (field.type ?? 'boolean') === 'boolean';
              if (isBoolean) {
                const a = asAnswer(answers[field.id]);
                return (
                  <View key={field.id} style={s.ckRow} wrap={false}>
                    <View style={s.ckLabelCell}>
                      <Text style={s.ckLabel}>{field.label}</Text>
                      {field.description ? <Text style={s.ckDesc}>{field.description}</Text> : null}
                    </View>
                    <View style={s.ckMarks}>
                      <View style={s.ckCol}><Mark kind="si" on={a === 'si'} /></View>
                      <View style={s.ckCol}><Mark kind="no" on={a === 'no'} /></View>
                      <View style={s.ckCol}><Mark kind="na" on={a === 'na'} /></View>
                    </View>
                  </View>
                );
              }
              const value = formatAnswerValue(field, answers[field.id]);
              // Respuestas largas van a ancho completo: leerlas en una columna angosta
              // a la derecha rompe la armonía del bloque.
              if (field.type === 'textarea' || value.length > 60) {
                return (
                  <View key={field.id} style={[s.ckRow, { flexDirection: 'column', alignItems: 'stretch' }]} wrap={false}>
                    <Text style={s.ckLabel}>{field.label}</Text>
                    {field.description ? <Text style={s.ckDesc}>{field.description}</Text> : null}
                    <Text style={s.ckNote}>{value}</Text>
                  </View>
                );
              }
              return (
                <View key={field.id} style={s.ckRow} wrap={false}>
                  <View style={s.ckLabelCell}>
                    <Text style={s.ckLabel}>{field.label}</Text>
                    {field.description ? <Text style={s.ckDesc}>{field.description}</Text> : null}
                  </View>
                  <Text style={s.ckValue}>{value}</Text>
                </View>
              );
            })}
          </Fragment>
        );
      })}
    </Fragment>
  );
}

/** Una unidad indivisible del plan: [encabezado] + fila de fotos + [comentario]. */
function PhotoUnit({ unit, n, comment, missing, ids, photos, lead }: {
  unit: PlanUnit; n: number; comment: string; missing: number; ids: string[];
  photos: Record<string, string>; lead?: React.ReactNode;
}) {
  const r = unit.row;
  return (
    <View wrap={false}>
      {unit.first && lead}
      {unit.first && (
        <View style={s.groupTitle}>
          <View style={s.badge}><Text style={s.badgeTxt}>{n}</Text></View>
          <Text style={s.groupTitleTxt}>Hallazgo</Text>
        </View>
      )}
      {r && (
        <View style={s.mosaicRow}>
          {r.idx.map((pi, k) => (
            <View key={pi} style={[s.photo, { width: r.widths[k], height: r.height }]}>
              <Image src={photos[ids[pi]]} style={{ width: r.widths[k], height: r.height, objectFit: 'cover' }} />
            </View>
          ))}
        </View>
      )}
      {unit.last && (
        <View>
          <Text style={s.comment}>{comment || 'Sin comentario.'}</Text>
          {missing > 0 && <Text style={s.muted}>[{missing} foto(s) aún no descargadas en este dispositivo]</Text>}
        </View>
      )}
    </View>
  );
}

function SignaturesBlock({ visita, profesional,doc }: { visita: Visita; profesional: Profile | null;doc:ReportDocumentV1 }) {
  const signer = (nombre: string | null | undefined, cargo: string | null | undefined, extra?: string | null) => (
    <View style={s.signCell}>
      <View style={s.signSpace}/>
      <View style={s.signIdentity}>
      <Text style={[s.value, { fontWeight: 'bold' }]}>{nombre || '—'}</Text>
      <Text style={s.label}>{cargo || 'Firma'}</Text>
      {extra ? <Text style={s.label}>{extra}</Text> : null}
      </View>
    </View>
  );
  return (
    <View wrap={false}>
      <Text style={s.h2}>Firmas</Text>
      <View style={s.signBox}>
        {doc.signers?.length?doc.signers.map(person=><View key={person.id} style={s.signCell}><View style={s.signSpace}>{person.image?<Image src={person.image} style={{width:150,height:60,objectFit:'contain'}}/>:null}</View><View style={s.signIdentity}><Text style={s.value}>{person.nombre||'—'}</Text><Text style={s.label}>{person.cargo||'Firmante'}</Text><Text style={s.label}>{person.colegiatura}</Text></View></View>):<>
        {signer(visita.responsable_obra_nombre, 'Responsable de obra', visita.responsable_obra_colegiatura)}
        {signer(profesional?.nombre_completo, profesional?.cargo ?? 'Profesional', profesional?.nro_colegiatura)}
        </>}
      </View>
    </View>
  );
}

export function buildInformeDoc(input: InformeInput) {
  const { doc, visita, expediente, profesional, photos } = input;
  const dims: Record<string, { w: number; h: number }> = { ...(input.photoDims ?? {}) };
  for (const id of Object.keys(photos)) {
    if (!dims[id]) { const d = imageSizeFromDataUrl(photos[id]); if (d) dims[id] = d; }
  }

  const children: React.ReactNode[] = [];
  const blocks = doc.blocks;
  let usedBefore = 0; // alto estimado de lo que precede al primer mosaico en la primera hoja
  let hallazgo = 0;
  let runs = 0;

  for (let i = 0; i < blocks.length; ) {
    const block = blocks[i];
    if (block.type === 'capture-group') {
      const run: Extract<ReportBlock, { type: 'capture-group' }>[] = [];
      while (i < blocks.length && blocks[i].type === 'capture-group') run.push(blocks[i++] as any);

      const firstRun = runs === 0;
      const meta = run.map((b, gi) => {
        const ids = b.photoIds.filter(id => photos[id]);
        return {
          b, ids, n: ++hallazgo,
          plan: {
            aspects: ids.map(id => { const d = dims[id]; return d ? d.w / d.h : 4 / 3; }),
            comment: b.comment, missing: b.photoIds.length - ids.length,
            leadH: firstRun && gi === 0 ? H.h2 : 0,
          } as PlanGroup,
        };
      });
      const cap1 = firstRun ? CAP_FULL - usedBefore - SAFETY * 2 : CAP_FULL - SAFETY;
      const pages = planPhotoPages(meta.map(m => m.plan), MOSAIC, cap1);
      pages.forEach((pg, k) => {
        if (pg.units.length === 0) return; // hoja sin espacio útil: la siguiente fuerza salto
        children.push(
          <View key={`ph-${runs}-${k}`} break={k > 0 || !firstRun}>
            {pg.units.map((u, ui) => {
              const m = meta[u.g];
              return (
                <PhotoUnit key={`${u.g}-${ui}`} unit={u} n={m.n} comment={m.b.comment} missing={m.plan.missing}
                  ids={m.ids} photos={photos}
                  lead={firstRun && u.g === 0 ? <Text style={s.h2}>Registro fotográfico</Text> : undefined} />
              );
            })}
          </View>,
        );
      });
      runs++;
      continue;
    }

    i++;
    switch (block.type) {
      case 'header':
        usedBefore += H.header;
        children.push(<HeaderBlock key={block.id} visita={visita} expediente={expediente} profesional={profesional} />);
        break;
      case 'checklist':
        usedBefore += estimateChecklistHeight(visita.checklist_esquema_json.sections, visita.checklist_respuestas_json);
        children.push(<ChecklistBlock key={block.id} visita={visita} />);
        break;
      case 'text':
        usedBefore += estimateTextHeight(block.content);
        children.push(<Text key={block.id} style={s.para}>{block.content}</Text>);
        break;
      case 'conclusions':
        children.push(
          <Fragment key={block.id}>
            <Text style={s.h2} minPresenceAhead={60}>Conclusiones</Text>
            <Text style={s.para}>{block.content || '(Sin conclusiones registradas.)'}</Text>
          </Fragment>,
        );
        break;
      case 'signatures':
        children.push(<SignaturesBlock key={block.id} visita={visita} profesional={profesional} doc={doc} />);
        break;
    }
  }

  return (
    <Document title={`Informe ${expediente.nro_expediente} V${visita.nro_visita}`}>
      <Page size="A4" style={s.page}>{children}</Page>
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
    page.drawText(leftText, { x: 40, y, size: 8, font, color: rgb(0.4, 0.46, 0.55) });
    const right = rightText(i + 1, pages.length);
    const w = font.widthOfTextAtSize(right, 8);
    page.drawText(right, { x: width - 40 - w, y, size: 8, font, color: rgb(0.01, 0.26, 0.48) });
    page.drawLine({
      start: { x: 40, y: y + 12 },
      end: { x: width - 40, y: y + 12 },
      thickness: 0.75,
      color: rgb(0.87, 0.9, 0.93),
    });
  });
  return (await doc.save({ useObjectStreams: opts.useObjectStreams ?? true })) as Uint8Array;
}

/** Nombre estable del PDF: Informe-<EXP>-V<NN>.pdf */
export function informeFileName(expediente: Pick<Expediente, 'nro_expediente'>, visita: Pick<Visita, 'nro_visita'>): string {
  const exp = expediente.nro_expediente.replace(/[^A-Za-z0-9_-]+/g, '_');
  return `Informe-${exp}-V${String(visita.nro_visita).padStart(2, '0')}.pdf`;
}
