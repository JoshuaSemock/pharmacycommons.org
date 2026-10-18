/**
 * Where new nodes land when a neighborhood is added. Pure maths, so it is tested
 * without a browser.
 *
 * Force-directed layouts re-flow the whole picture on every change, which loses
 * the reader's place. Instead a neighborhood is laid out once, on rings around
 * the node that was expanded, and everything already on the canvas stays put.
 * "Re-arrange" on the page runs a real layout when the reader asks for one.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type Point = { x: number; y: number }

const RING_CAPACITY = 18
const FIRST_RADIUS = 170
const RING_STEP = 110

/**
 * Positions for `count` new nodes around `anchor`.
 *
 * Around the root they form a full circle. Around any other node they fan out
 * over a 240° arc facing away from the middle of the drawing (`origin`), so
 * the new branch does not land on top of the node's own parent.
 */
export function ringPositions(anchor: Point, count: number, origin: Point = { x: 0, y: 0 }): Point[] {
  if (count <= 0) return []
  const dx = anchor.x - origin.x
  const dy = anchor.y - origin.y
  const atCenter = Math.hypot(dx, dy) < 1
  const facing = atCenter ? -Math.PI / 2 : Math.atan2(dy, dx)
  const arc = atCenter ? Math.PI * 2 : (Math.PI * 4) / 3

  const out: Point[] = []
  let placed = 0
  for (let ring = 0; placed < count; ring++) {
    const inRing = Math.min(RING_CAPACITY + ring * 6, count - placed)
    const radius = FIRST_RADIUS + ring * RING_STEP
    for (let i = 0; i < inRing; i++) {
      // A full circle spaces by 1/n; an arc puts the first and last at its ends.
      const t = atCenter ? i / inRing : inRing === 1 ? 0.5 : i / (inRing - 1)
      const angle = atCenter ? facing + t * arc : facing - arc / 2 + t * arc
      // Stagger alternate nodes within a ring so neighbors' labels do not collide.
      const r = radius + (i % 2 === 1 ? 28 : 0)
      out.push({ x: anchor.x + Math.cos(angle) * r, y: anchor.y + Math.sin(angle) * r })
    }
    placed += inRing
  }
  return out
}
