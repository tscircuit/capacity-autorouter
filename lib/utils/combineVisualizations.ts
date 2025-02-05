import type { GraphicsObject } from "graphics-debug"

export const combineVisualizations = (
  ...visualizations: GraphicsObject[]
): GraphicsObject => {
  const combined = {
    points: [],
    lines: [],
    circles: [],
    rects: [],
  }

  visualizations.forEach((viz, i) => {
    if (viz.lines) {
      combined.lines.push(...viz.lines.map(l => ({ ...l, step: i })))
    }
    if (viz.points) {
      combined.points.push(...viz.points.map(p => ({ ...p, step: i })))
    }
    if (viz.circles) {
      combined.circles.push(...viz.circles.map(c => ({ ...c, step: i })))
    }
    if (viz.rects) {
      combined.rects.push(...viz.rects.map(r => ({ ...r, step: i })))
    }
  })

  return combined
}
