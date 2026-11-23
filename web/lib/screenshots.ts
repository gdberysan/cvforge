'use client'

/**
 * Shared or picked screenshots -> images the model reads well. A tall
 * capture (a scroll capture, a long page) is cut into overlapping tiles, so
 * nothing is shrunk into illegibility; every image is scaled to a long edge
 * of at most 1568 px — what the model sees without resizing — and sent as
 * JPEG. At most MAX_TILES per posting, which also bounds the cost.
 */
import type { Screenshot } from '@/lib/ai/stages/transcribe-posting'

const LONG_EDGE = 1568
/** A tile is at most this many widths tall. */
const TILE_RATIO = 2
/** Overlap between tiles, as a share of the width: a line cut in one is whole in the next. */
const OVERLAP = 0.12
export const MAX_TILES = 20

async function toJpeg(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.85),
  )
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

function draw(bitmap: ImageBitmap, sy: number, sh: number): HTMLCanvasElement {
  const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, sh))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(sh * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  ctx.drawImage(bitmap, 0, sy, bitmap.width, sh, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** Tile rows for one image: [top, height] pairs, top to bottom. */
export function tileRows(width: number, height: number): [number, number][] {
  const tileH = Math.round(width * TILE_RATIO)
  if (height <= tileH * 1.1) return [[0, height]]
  const step = Math.round(tileH - width * OVERLAP)
  const rows: [number, number][] = []
  for (let top = 0; top < height; top += step) {
    const h = Math.min(tileH, height - top)
    rows.push([top, h])
    if (top + h >= height) break
  }
  return rows
}

export async function prepareShots(
  files: Blob[],
): Promise<{ shots: Screenshot[]; dropped: number }> {
  const shots: Screenshot[] = []
  let dropped = 0
  for (const file of files) {
    const bitmap = await createImageBitmap(file)
    try {
      for (const [top, h] of tileRows(bitmap.width, bitmap.height)) {
        if (shots.length >= MAX_TILES) {
          dropped++
          continue
        }
        shots.push({ mediaType: 'image/jpeg', data: await toJpeg(draw(bitmap, top, h)) })
      }
    } finally {
      bitmap.close()
    }
  }
  return { shots, dropped }
}
