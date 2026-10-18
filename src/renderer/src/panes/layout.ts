/**
 * Árbol de paneles de una pestaña. Cada división parte su espacio en dos:
 * 'row' pone los paneles lado a lado y 'column' uno encima del otro.
 */
export type PaneNode =
  | { kind: 'leaf'; id: string }
  | {
      kind: 'split'
      id: string
      axis: 'row' | 'column'
      ratio: number
      first: PaneNode
      second: PaneNode
    }

/** Rectángulo en fracciones (0 a 1) del área de trabajo. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface PaneRect {
  id: string
  rect: Rect
}

export interface DividerRect {
  id: string
  axis: 'row' | 'column'
  /** Espacio de la división completa; sirve para calcular la proporción al arrastrar. */
  parent: Rect
  /** Posición del separador: x en 'row', y en 'column'. */
  at: number
}

export type Direction = 'left' | 'right' | 'up' | 'down'

export const MIN_RATIO = 0.1

export function leaves(node: PaneNode): string[] {
  return node.kind === 'leaf' ? [node.id] : [...leaves(node.first), ...leaves(node.second)]
}

/** Divide el panel `target` y pone el panel nuevo a la derecha o abajo. */
export function splitPane(
  node: PaneNode,
  target: string,
  axis: 'row' | 'column',
  newId: string,
  splitId: string
): PaneNode {
  if (node.kind === 'leaf') {
    if (node.id !== target) return node
    return {
      kind: 'split',
      id: splitId,
      axis,
      ratio: 0.5,
      first: node,
      second: { kind: 'leaf', id: newId }
    }
  }
  return {
    ...node,
    first: splitPane(node.first, target, axis, newId, splitId),
    second: splitPane(node.second, target, axis, newId, splitId)
  }
}

/** Quita un panel; su hermano ocupa el espacio. Devuelve null si era el último. */
export function removePane(node: PaneNode, target: string): PaneNode | null {
  if (node.kind === 'leaf') return node.id === target ? null : node
  const first = removePane(node.first, target)
  const second = removePane(node.second, target)
  if (!first) return second
  if (!second) return first
  return first === node.first && second === node.second ? node : { ...node, first, second }
}

export function setRatio(node: PaneNode, splitId: string, ratio: number): PaneNode {
  if (node.kind === 'leaf') return node
  if (node.id === splitId)
    return {
      ...node,
      ratio: Math.min(1 - MIN_RATIO, Math.max(MIN_RATIO, ratio))
    }
  return {
    ...node,
    first: setRatio(node.first, splitId, ratio),
    second: setRatio(node.second, splitId, ratio)
  }
}

export function layout(
  node: PaneNode,
  rect: Rect = { x: 0, y: 0, w: 1, h: 1 },
  out: { panes: PaneRect[]; dividers: DividerRect[] } = {
    panes: [],
    dividers: []
  }
): { panes: PaneRect[]; dividers: DividerRect[] } {
  if (node.kind === 'leaf') {
    out.panes.push({ id: node.id, rect })
    return out
  }
  if (node.axis === 'row') {
    const w = rect.w * node.ratio
    layout(node.first, { ...rect, w }, out)
    layout(node.second, { ...rect, x: rect.x + w, w: rect.w - w }, out)
    out.dividers.push({
      id: node.id,
      axis: 'row',
      parent: rect,
      at: rect.x + w
    })
  } else {
    const h = rect.h * node.ratio
    layout(node.first, { ...rect, h }, out)
    layout(node.second, { ...rect, y: rect.y + h, h: rect.h - h }, out)
    out.dividers.push({
      id: node.id,
      axis: 'column',
      parent: rect,
      at: rect.y + h
    })
  }
  return out
}

const EPSILON = 1e-6

/** Panel vecino en una dirección: el más cercano que comparte borde con el actual. */
export function neighbor(node: PaneNode, from: string, direction: Direction): string | undefined {
  const { panes } = layout(node)
  const current = panes.find((p) => p.id === from)?.rect
  if (!current) return undefined
  const overlaps = (a0: number, a1: number, b0: number, b1: number): number => Math.min(a1, b1) - Math.max(a0, b0)
  let best: { id: string; distance: number; overlap: number } | undefined
  for (const { id, rect } of panes) {
    if (id === from) continue
    let distance: number
    let overlap: number
    if (direction === 'left' || direction === 'right') {
      distance = direction === 'left' ? current.x - (rect.x + rect.w) : rect.x - (current.x + current.w)
      overlap = overlaps(current.y, current.y + current.h, rect.y, rect.y + rect.h)
    } else {
      distance = direction === 'up' ? current.y - (rect.y + rect.h) : rect.y - (current.y + current.h)
      overlap = overlaps(current.x, current.x + current.w, rect.x, rect.x + rect.w)
    }
    if (distance < -EPSILON || overlap <= EPSILON) continue
    if (
      !best ||
      distance < best.distance - EPSILON ||
      (Math.abs(distance - best.distance) < EPSILON && overlap > best.overlap)
    ) {
      best = { id, distance, overlap }
    }
  }
  return best?.id
}
