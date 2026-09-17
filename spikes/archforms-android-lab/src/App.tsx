import { useEffect, useMemo, useRef, useState } from 'react'
import { CameraPreview } from '@capacitor-community/camera-preview'
import { Capacitor } from '@capacitor/core'
import { Device, type DeviceInfo } from '@capacitor/device'
import { compareLocalFeatures, extractLocalFeatures } from './local-features'
import { ArchFormsAudio } from './native-audio'
import { clearLabData, loadAudioClips, loadPhotos, saveNativeAudio, savePhoto, type AudioClip, type LabPhoto } from './lab-storage'
import './App.css'

type RecorderState = 'idle' | 'recording' | 'saving'
const formatDuration = (ms: number) => `${Math.floor(Math.round(ms / 1000) / 60)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`
const formatBytes = (bytes: number) => bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`

function App() {
  const [photos, setPhotos] = useState<LabPhoto[]>([])
  const [clips, setClips] = useState<AudioClip[]>([])
  const [device, setDevice] = useState<DeviceInfo | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [recorderState, setRecorderState] = useState<RecorderState>('idle')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [status, setStatus] = useState('Recuperando archivos locales…')
  const [error, setError] = useState<string | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let mounted = true
    void Promise.all([loadPhotos(), loadAudioClips(), Device.getInfo()]).then(([savedPhotos, savedClips, info]) => {
      if (!mounted) return
      setPhotos(savedPhotos); setClips(savedClips); setDevice(info); setStatus('Datos recuperados. El laboratorio funciona sin internet.')
    }).catch((caught) => setError(String(caught)))
    return () => { mounted = false; void CameraPreview.stop().catch(() => undefined) }
  }, [])

  useEffect(() => {
    if (!startedAt) return
    const timer = window.setInterval(() => setElapsed(Date.now() - startedAt), 250)
    return () => window.clearInterval(timer)
  }, [startedAt])

  const similarPairs = useMemo(() => {
    const result: Array<{ a: number; b: number; score: number; matches: number }> = []
    for (let a = 0; a < photos.length; a += 1) for (let b = a + 1; b < photos.length; b += 1) {
      const comparison = compareLocalFeatures(photos[a].features ?? [], photos[b].features ?? [])
      if (comparison.matches >= 6 && comparison.score >= 8) result.push({ a, b, ...comparison })
    }
    return result.sort((left, right) => right.score - left.score)
  }, [photos])

  const startCamera = async () => {
    setError(null); setStatus('Encendiendo cámara dentro de ArchForms…')
    try {
      const rect = viewportRef.current?.getBoundingClientRect()
      if (!rect) throw new Error('No se encontró el visor.')
      await CameraPreview.start({ position: 'rear', x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height), toBack: false, storeToFile: false, enableZoom: true, lockAndroidOrientation: true })
      setCameraOn(true); setStatus('Cámara encendida. Puedes tomar varias fotos sin salir de la app.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) }
  }
  const stopCamera = async () => { await CameraPreview.stop(); setCameraOn(false); setStatus('Cámara apagada.') }
  const takePhoto = async () => {
    setError(null); setStatus('Capturando y extrayendo descriptores locales…')
    try {
      const result = await CameraPreview.capture({ quality: 88 })
      const displayUrl = `data:image/jpeg;base64,${result.value}`
      const features = await extractLocalFeatures(displayUrl)
      const saved = await savePhoto({ base64: result.value, mimeType: 'image/jpeg', features })
      setPhotos((current) => [...current, saved]); setStatus(`Foto guardada con ${features.length} puntos locales.`)
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) }
  }
  const startRecording = async () => {
    setError(null)
    try { await ArchFormsAudio.startRecording(); setStartedAt(Date.now()); setElapsed(0); setRecorderState('recording'); setStatus('Grabando WAV nativo a 16 kHz; nada se envía a internet.') }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) }
  }
  const stopRecording = async () => {
    setRecorderState('saving'); setStatus('Cerrando archivo WAV…')
    try { const saved = await saveNativeAudio(await ArchFormsAudio.stopRecording()); setClips((current) => [...current, saved]); setStatus('Audio nativo persistido y listo para Whisper.') }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) }
    finally { setStartedAt(null); setElapsed(0); setRecorderState('idle') }
  }
  const reset = async () => {
    if (!window.confirm('¿Eliminar los archivos de este laboratorio?')) return
    if (cameraOn) await stopCamera()
    await Promise.allSettled(clips.filter((clip) => clip.path.startsWith('file:')).map((clip) => ArchFormsAudio.deleteRecording({ uri: clip.path })))
    await clearLabData(photos, clips); setPhotos([]); setClips([]); setStatus('Laboratorio reiniciado.')
  }

  return <main className="shell">
    <header className="hero"><div className="mark">A</div><div className="hero-copy"><span className="eyebrow">Iteración 0.2 · Android</span><h1>ArchForms Lab</h1><p>Cámara embebida, audio nativo y comparación local de fotografías.</p></div><span className="platform">{Capacitor.isNativePlatform() ? 'Android nativo' : 'Navegador'}</span></header>
    <div className="status" aria-live="polite"><i />{status}</div>{error && <div className="error" role="alert"><strong>Error de prueba</strong><span>{error}</span></div>}
    <section className="metrics"><div><span>Fotos persistidas</span><strong>{photos.length}</strong></div><div><span>Audios persistidos</span><strong>{clips.length}</strong></div><div><span>Pares similares</span><strong>{similarPairs.length}</strong></div></section>
    <section className="grid">
      <article className="panel photos-panel"><PanelTitle step="Prueba 01" title="Cámara embebida"><div className="actions"><button className="quiet compact" onClick={cameraOn ? stopCamera : startCamera}>{cameraOn ? 'Apagar' : 'Encender cámara'}</button><button className={`primary ${cameraOn ? '' : 'button-placeholder'}`} onClick={takePhoto} disabled={!cameraOn}>Tomar foto</button></div></PanelTitle><p className="hint">El visor permanece dentro de ArchForms. La comparación usa puntos locales y descriptores binarios, no un hash global.</p><div ref={viewportRef} className={`camera-viewport ${cameraOn ? 'live' : ''}`}>{!cameraOn && <div><span>Visor apagado</span><small>Enciende la cámara para iniciar la inspección</small></div>}</div>{photos.length > 0 && <div className="photos">{photos.map((photo, index) => <figure key={photo.id}><img src={photo.displayUrl} alt={`Captura ${index + 1}`} /><figcaption><strong>Foto {index + 1}</strong><span>{photo.features?.length ?? 0} descriptores</span></figcaption></figure>)}</div>}{similarPairs.length > 0 && <div className="similar"><strong>Posibles repetidas; nunca se eliminan automáticamente</strong>{similarPairs.map(({ a, b, score, matches }) => <span key={`${a}-${b}`}>Fotos {a + 1} y {b + 1}: {score}% · {matches} coincidencias geométricas</span>)}</div>}</article>
      <article className="panel whisper-panel"><PanelTitle step="Prueba 03" title="Whisper local"><span className="pending">Siguiente hito</span></PanelTitle><p className="hint">El WAV nativo ya está en el formato de entrada correcto para integrar <code>whisper.cpp</code>, sin conversión ni nube.</p><ol><li>Modelo multilingüe <strong>tiny</strong>.</li><li>Medir parciales, cierre, memoria y temperatura.</li><li>Comparar con <strong>base</strong>.</li></ol></article>
      <article className="panel audio-panel"><PanelTitle step="Prueba 02" title="Audio nativo">{recorderState === 'recording' ? <button className="record active" onClick={stopRecording}>Detener · {formatDuration(elapsed)}</button> : <button className="record" onClick={startRecording} disabled={recorderState === 'saving'}>{recorderState === 'saving' ? 'Guardando…' : 'Grabar audio'}</button>}</PanelTitle><p className="hint">Android graba directamente un WAV mono de 16 kHz dentro del almacenamiento privado de la app.</p>{clips.length === 0 ? <Empty text="Los audios persistidos aparecerán aquí." /> : <div className="audio-list">{clips.map((clip, index) => <div className="audio" key={clip.id}><div><strong>Comentario {index + 1}</strong><span>{formatDuration(clip.durationMs)} · {formatBytes(clip.sizeBytes)}</span></div><audio controls preload="metadata" src={clip.displayUrl} /></div>)}</div>}</article>
      <article className="panel device-panel"><PanelTitle step="Entorno" title="Dispositivo" /><dl><div><dt>Modelo</dt><dd>{device?.model ?? 'Detectando…'}</dd></div><div><dt>Sistema</dt><dd>{device ? `${device.operatingSystem} ${device.osVersion}` : '—'}</dd></div><div><dt>Plataforma</dt><dd>{Capacitor.getPlatform()}</dd></div></dl><button className="quiet" onClick={reset}>Reiniciar laboratorio</button></article>
    </section>
  </main>
}
function PanelTitle({ step, title, children }: { step: string; title: string; children?: React.ReactNode }) { return <div className="panel-title"><div><span className="eyebrow">{step}</span><h2>{title}</h2></div>{children}</div> }
function Empty({ text }: { text: string }) { return <div className="empty">{text}</div> }
export default App
