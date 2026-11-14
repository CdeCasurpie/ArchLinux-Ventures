import { useEffect, useRef, useState } from 'react';

export type DictationState = 'idle' | 'listening' | 'unsupported' | 'error';

interface SpeechRecognitionAlternativeLike { transcript: string }
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionErrorEventLike { error?: string }
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** Web Speech API (Chrome/Edge). En Android nativo el WebView no la expone:
 *  el hook lo reporta como 'unsupported' y la UI ofrece escribir el texto. */
export function useDictation(onFinalText: (text: string) => void, lang = 'es-PE') {
  const [state, setState] = useState<DictationState>('idle');
  const [error, setError] = useState('');
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const sink = useRef(onFinalText);
  sink.current = onFinalText;

  const w = typeof window === 'undefined'
    ? undefined
    : (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor });
  const supported = Boolean(w?.SpeechRecognition ?? w?.webkitSpeechRecognition);

  const start = () => {
    setError('');
    if (!supported) { setState('unsupported'); return; }
    const Ctor = w!.SpeechRecognition ?? w!.webkitSpeechRecognition!;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = event => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result?.isFinal) {
          const transcript = result[0]?.transcript.trim();
          if (transcript) sink.current(transcript);
        }
      }
    };
    rec.onerror = event => {
      setError(event.error === 'not-allowed'
        ? 'El navegador bloqueó el micrófono. Concede el permiso e inténtalo de nuevo.'
        : event.error === 'no-speech'
          ? 'No se detectó voz. Vuelve a intentarlo.'
          : 'El dictado se interrumpió. Vuelve a intentarlo.');
      setState('error');
    };
    rec.onend = () => { setState(current => (current === 'listening' ? 'idle' : current)); };
    recognition.current = rec;
    try {
      rec.start();
      setState('listening');
    } catch {
      setError('No se pudo iniciar el dictado.');
      setState('error');
    }
  };

  const stop = () => { recognition.current?.stop(); };

  useEffect(() => () => recognition.current?.stop(), []);

  return { state, error, start, stop, supported };
}
