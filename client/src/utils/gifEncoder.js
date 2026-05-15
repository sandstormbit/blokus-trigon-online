/**
 * Minimal GIF89a encoder — no external dependencies.
 *
 * Supports:
 *  - Fixed global color table (up to 256 colors)
 *  - Multiple frames with per-frame delay (in centiseconds)
 *  - Netscape 2.0 infinite loop extension
 *  - Trie-based LZW compression for speed
 */

// ─── Bit writer (LSB-first, as required by GIF) ───────────────────────────────

class BitWriter {
  constructor() {
    this._buf = 0
    this._bitsIn = 0
    this._bytes = []
  }

  write(code, numBits) {
    this._buf |= (code & 0xffffff) << this._bitsIn
    this._bitsIn += numBits
    while (this._bitsIn >= 8) {
      this._bytes.push(this._buf & 0xff)
      this._buf = (this._buf >>> 8) & 0xffffff
      this._bitsIn -= 8
    }
  }

  flush() {
    if (this._bitsIn > 0) this._bytes.push(this._buf & 0xff)
    return this._bytes
  }
}

// ─── Trie-based LZW encoder ───────────────────────────────────────────────────
// Uses a flat Int32Array trie (children[code * paletteSize + sym]) for O(1)
// lookups — much faster than string-keyed Maps for large frames.

function lzwEncode(indices, minCodeSize) {
  const clearCode = 1 << minCodeSize
  const eoiCode = clearCode + 1
  const paletteSize = clearCode
  const MAX_CODES = 4096

  const bw = new BitWriter()
  const children = new Int32Array(MAX_CODES * paletteSize).fill(-1)

  let codeSize = minCodeSize + 1
  let nextCode = eoiCode + 1

  const reset = () => {
    children.fill(-1)
    codeSize = minCodeSize + 1
    nextCode = eoiCode + 1
  }

  bw.write(clearCode, codeSize)

  if (indices.length === 0) {
    bw.write(eoiCode, codeSize)
    return bw.flush()
  }

  // curCode is the current trie node (= the code we'll output if no child found).
  // After a reset, single-symbol entries are their own codes (0..clearCode-1).
  let curCode = indices[0]

  for (let i = 1; i < indices.length; i++) {
    const sym = indices[i]
    const childIdx = curCode * paletteSize + sym
    const child = children[childIdx]

    if (child !== -1) {
      curCode = child
    } else {
      bw.write(curCode, codeSize)

      if (nextCode < MAX_CODES) {
        children[childIdx] = nextCode++
        if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++
      } else {
        // Table full — emit clear and reset
        bw.write(clearCode, codeSize)
        reset()
      }

      curCode = sym
    }
  }

  bw.write(curCode, codeSize)
  bw.write(eoiCode, codeSize)
  return bw.flush()
}

// ─── GIF byte packing helpers ─────────────────────────────────────────────────

function packSubBlocks(dataBytes) {
  const out = []
  for (let i = 0; i < dataBytes.length; i += 255) {
    const chunk = dataBytes.slice(i, i + 255)
    out.push(chunk.length)
    for (const b of chunk) out.push(b)
  }
  out.push(0) // block terminator
  return out
}

// ─── Color quantization ───────────────────────────────────────────────────────

/**
 * Build a fast lookup from packed RGB integer → palette index.
 * Falls back to nearest-neighbor (Euclidean RGB) for unrecognized colors
 * (canvas anti-aliasing at triangle edges).
 */
export function buildColorLookup(palette) {
  const exact = new Map()
  for (let i = 0; i < palette.length; i++) {
    const [r, g, b] = palette[i]
    exact.set((r << 16) | (g << 8) | b, i)
  }

  return function quantize(r, g, b) {
    const key = (r << 16) | (g << 8) | b
    const hit = exact.get(key)
    if (hit !== undefined) return hit

    let best = 0, bestDist = Infinity
    for (let i = 0; i < palette.length; i++) {
      const [pr, pg, pb] = palette[i]
      const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
      if (d < bestDist) { bestDist = d; best = i }
    }
    exact.set(key, best) // cache for next time
    return best
  }
}

/**
 * Convert a canvas ImageData buffer (Uint8ClampedArray, RGBA) to a flat
 * Uint8Array of palette indices.
 */
export function quantizeImageData(data, width, height, quantize) {
  const indices = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const base = i * 4
    indices[i] = quantize(data[base], data[base + 1], data[base + 2])
    // alpha ignored — GIF doesn't support partial transparency
  }
  return indices
}

// ─── Main encoder ─────────────────────────────────────────────────────────────

/**
 * Encode an animated GIF from pre-quantized index frames.
 *
 * @param {Uint8Array[]} frames   — one Uint8Array of palette indices per frame
 * @param {number}       width
 * @param {number}       height
 * @param {number[][]}   palette  — [[r,g,b], ...] — length must be power of 2 (2,4,8,16,32,64,128,256)
 * @param {number[]}     delays   — per-frame delay in centiseconds (1cs = 10ms)
 * @returns {Uint8Array}
 */
export function encodeGIF(frames, width, height, palette, delays) {
  const out = []

  const u8  = (b) => out.push(b & 0xff)
  const u16 = (n) => { out.push(n & 0xff); out.push((n >> 8) & 0xff) }
  const raw = (arr) => { for (const b of arr) out.push(b) }

  // ── Header ──────────────────────────────────────────────────────────────────
  raw([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]) // "GIF89a"

  // ── Logical Screen Descriptor ────────────────────────────────────────────────
  u16(width)
  u16(height)

  // GCT size field M: actual palette size = 2^(M+1)
  // palette.length must already be a power of 2
  const gctM = Math.log2(palette.length) - 1  // e.g. 16 colors → M=3
  u8(0x80 | (gctM & 0x07))  // GCT present + gctM
  u8(0)  // background color index
  u8(0)  // pixel aspect ratio

  // ── Global Color Table ───────────────────────────────────────────────────────
  for (let i = 0; i < palette.length; i++) {
    out.push(palette[i][0], palette[i][1], palette[i][2])
  }

  // ── Netscape 2.0 loop extension ─────────────────────────────────────────────
  raw([0x21, 0xff, 0x0b])
  raw([78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48]) // "NETSCAPE2.0"
  raw([0x03, 0x01, 0x00, 0x00]) // sub-block: loop count = 0 (infinite)
  u8(0x00) // block terminator

  const minCodeSize = Math.max(2, Math.ceil(Math.log2(palette.length)))

  // ── Frames ───────────────────────────────────────────────────────────────────
  for (let f = 0; f < frames.length; f++) {
    const delay = delays[f] ?? 10

    // Graphic Control Extension
    raw([0x21, 0xf9, 0x04, 0x00]) // extension, GCE, 4 bytes, disposal=0 (keep)
    u16(delay)
    u8(0)   // transparent color index (not used)
    u8(0x00) // block terminator

    // Image Descriptor
    u8(0x2c)   // image separator
    u16(0); u16(0)       // left, top
    u16(width); u16(height)
    u8(0x00)   // no local color table, not interlaced

    // LZW image data
    u8(minCodeSize)
    raw(packSubBlocks(lzwEncode(frames[f], minCodeSize)))
  }

  // ── Trailer ──────────────────────────────────────────────────────────────────
  u8(0x3b)

  return new Uint8Array(out)
}
