// Iconos de trazo (24×24, stroke 2). Sustituyen a los glifos unicode (⌂ ▤ ◎ ✓),
// que se ven distintos según la fuente del teléfono y no comunican bien.
const paths = {
  home: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'],
  folder: ['M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z'],
  clipboard: ['M9 3.5h6v3H9z', 'M9 5H6.5A1.5 1.5 0 0 0 5 6.5v13A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 17.5 5H15', 'm9 13.5 2 2 4-4'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21a8 8 0 0 1 16 0'],
  plus: ['M12 5v14', 'M5 12h14'],
  back: ['M19 12H5', 'm11 6-6 6 6 6'],
  chevron: ['m9 6 6 6-6 6'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'm20 20-4-4'],
  check: ['m5 12.5 4.5 4.5L19 7'],
  cloud: ['M7 18.5a4.5 4.5 0 1 1 1-8.9A6 6 0 0 1 19 11a3.75 3.75 0 0 1-.5 7.5z'],
  cloudOff: ['M7 18.5a4.5 4.5 0 0 1-.6-8.96', 'M10.3 6.3A6 6 0 0 1 19 11a3.75 3.75 0 0 1 1.4 6.5', 'm3 3 18 18'],
  phone: ['M8 2.5h8A1.5 1.5 0 0 1 17.5 4v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5z', 'M11 18h2'],
  refresh: ['M20 11.5a8 8 0 1 1-2.4-5.7L20 8', 'M20 3.5V8h-4.5'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'm13.5 6.5 4 4'],
  file: ['M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z', 'M14 3v5h5', 'M9 13h6', 'M9 17h6'],
  camera: ['M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z', 'M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  eye: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  eyeOff: ['M6.6 6.7C3.9 8.4 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.9 0 3.5-.6 4.8-1.5', 'M10 5.7c.6-.1 1.3-.2 2-.2 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.4 3.2', 'm3 3 18 18'],
  logout: ['M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15', 'm10 8-4 4 4 4', 'M6 12h10'],
  alert: ['M12 4 2.5 20h19z', 'M12 10v4', 'M12 17h.01'],
  calendar: ['M4.5 5h15A1.5 1.5 0 0 1 21 6.5v13a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-13A1.5 1.5 0 0 1 4.5 5z', 'M3 10h18', 'M8 3v4', 'M16 3v4'],
  mic: ['M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z', 'M5.5 11a6.5 6.5 0 0 0 13 0', 'M12 17.5V21'],
  undo: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  redo: ['m15 14 5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
  up: ['m6 15 6-6 6 6'],
  down: ['m6 9 6 6 6-6'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  download: ['M12 4v11', 'm7 10 5 5 5-5', 'M5 20h14'],
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 22, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}
    >
      {paths[name].map(d => <path key={d} d={d} />)}
    </svg>
  );
}
