export type LocalFeature = { x: number; y: number; descriptor: string }

const PAIRS = Array.from({ length: 128 }, (_, index) => {
  let seed = (index + 1) * 2654435761
  const next = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822519)) >>> 0) / 4294967296
  return [Math.floor(next() * 17) - 8, Math.floor(next() * 17) - 8, Math.floor(next() * 17) - 8, Math.floor(next() * 17) - 8]
})

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('No se pudo analizar la fotografía.'))
    image.src = url
  })
}

export async function extractLocalFeatures(url: string): Promise<LocalFeature[]> {
  const image = await loadImage(url)
  const width = 256
  const height = Math.max(96, Math.round(image.height * width / image.width))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas no disponible.')
  context.drawImage(image, 0, 0, width, height)
  const rgba = context.getImageData(0, 0, width, height).data
  const gray = new Uint8Array(width * height)
  for (let i = 0; i < gray.length; i += 1) gray[i] = (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8
  const candidates: Array<{ x: number; y: number; score: number }> = []
  for (let y = 10; y < height - 10; y += 2) for (let x = 10; x < width - 10; x += 2) {
    const i = y * width + x
    const gx = gray[i + 1] - gray[i - 1]
    const gy = gray[i + width] - gray[i - width]
    const score = gx * gx + gy * gy
    if (score > 1400) candidates.push({ x, y, score })
  }
  candidates.sort((a, b) => b.score - a.score)
  const selected: typeof candidates = []
  for (const point of candidates) {
    if (selected.every((other) => (point.x - other.x) ** 2 + (point.y - other.y) ** 2 > 64)) selected.push(point)
    if (selected.length === 120) break
  }
  return selected.map(({ x, y }) => {
    let descriptor = ''
    for (let offset = 0; offset < PAIRS.length; offset += 4) {
      let nibble = 0
      for (let bit = 0; bit < 4; bit += 1) {
        const [ax, ay, bx, by] = PAIRS[offset + bit]
        if (gray[(y + ay) * width + x + ax] < gray[(y + by) * width + x + bx]) nibble |= 1 << bit
      }
      descriptor += nibble.toString(16)
    }
    return { x: x / width, y: y / height, descriptor }
  })
}

const POPCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]
function distance(a: string, b: string) {
  let count = 0
  for (let i = 0; i < a.length; i += 1) count += POPCOUNT[Number.parseInt(a[i], 16) ^ Number.parseInt(b[i], 16)]
  return count
}

export function compareLocalFeatures(a: LocalFeature[], b: LocalFeature[]) {
  if (a.length < 8 || b.length < 8) return { score: 0, matches: 0 }
  const matches = a.flatMap((left) => {
    const nearest = b.map((right) => ({ right, distance: distance(left.descriptor, right.descriptor) })).sort((x, y) => x.distance - y.distance)
    if (!nearest[1] || nearest[0].distance >= nearest[1].distance * 0.78 || nearest[0].distance > 48) return []
    return [{ dx: nearest[0].right.x - left.x, dy: nearest[0].right.y - left.y }]
  })
  let consistent = 0
  for (const anchor of matches) consistent = Math.max(consistent, matches.filter((match) => Math.hypot(match.dx - anchor.dx, match.dy - anchor.dy) < 0.08).length)
  return { matches: consistent, score: Math.round(100 * consistent / Math.max(12, Math.min(a.length, b.length))) }
}
