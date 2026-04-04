import React, { useMemo } from 'react'
import { getPieceOrientation } from '../game/pieces.js'

// Smaller triangle size for sidebar previews
const P_SIZE = 10
const P_H = P_SIZE * Math.sqrt(3) / 2

function previewVertices(dq, dr) {
  const isUp = (dq + dr) % 2 === 0
  const S = P_SIZE, H = P_H
  if (isUp) {
    return [
      { x: dq * S / 2,       y: (dr + 1) * H },
      { x: (dq + 2) * S / 2, y: (dr + 1) * H },
      { x: (dq + 1) * S / 2, y: dr * H },
    ]
  } else {
    return [
      { x: dq * S / 2,       y: dr * H },
      { x: (dq + 2) * S / 2, y: dr * H },
      { x: (dq + 1) * S / 2, y: (dr + 1) * H },
    ]
  }
}

export default function PiecePreview({
  piece,
  color,
  colorDark,
  size = 36,
  rotIndex = 0,
  flipped = false,
}) {
  const cells = useMemo(
    () => getPieceOrientation(piece, rotIndex, flipped),
    [piece, rotIndex, flipped]
  )

  const { vbX, vbY, vbW, vbH, offsetX, offsetY } = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const c of cells) {
      for (const v of previewVertices(c.dq, c.dr)) {
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x)
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y)
      }
    }
    const pad = 1
    return {
      vbX: minX - pad,
      vbY: minY - pad,
      vbW: maxX - minX + pad * 2,
      vbH: maxY - minY + pad * 2,
      offsetX: -(minX - pad),
      offsetY: -(minY - pad),
    }
  }, [cells])

  return (
    <svg
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      width={size}
      height={size}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {cells.map((c, i) => {
        const verts = previewVertices(c.dq, c.dr)
        const points = verts.map(v => `${v.x},${v.y}`).join(' ')
        return (
          <polygon
            key={i}
            points={points}
            fill={color}
            stroke={colorDark}
            strokeWidth={0.7}
            strokeLinejoin="round"
          />
        )
      })}
    </svg>
  )
}
