import { HighDensityIntraNodeRoute } from "lib/types/high-density-types"
import { distance, doSegmentsIntersect } from "@tscircuit/math-utils"

interface Point3D {
  x: number
  y: number
  z: number
}

/**
 * Checks if a path between two points on the same layer intersects with any obstacles
 */
function pathIntersectsObstacles(
  start: Point3D,
  end: Point3D,
  obstacleRoutes: HighDensityIntraNodeRoute[],
  traceThickness: number,
  viaDiameter: number,
): boolean {
  if (start.z !== end.z) return false

  for (const route of obstacleRoutes) {
    // Check intersection with traces
    for (let i = 0; i < route.route.length - 1; i++) {
      const routeStart = route.route[i]
      const routeEnd = route.route[i + 1]

      // Only check segments on the same layer
      if (routeStart.z === routeEnd.z && routeStart.z === start.z) {
        if (doSegmentsIntersect(start, end, routeStart, routeEnd)) {
          return true
        }
      }
    }

    // Check intersection with vias
    for (const via of route.vias) {
      const viaPoint = { ...via, z: start.z }
      const distToVia = Math.min(
        distance(start, viaPoint),
        distance(end, viaPoint),
      )
      if (distToVia < (viaDiameter + traceThickness) / 2) {
        return true
      }
    }
  }

  return false
}

/**
 * Removes unnecessary vias from a route. A via is considered unnecessary if:
 * 1. It changes layers but immediately changes back to the original layer
 * 2. It changes layers when the entire path could stay on a single layer without intersecting obstacles
 */
export function removeUselessVias(
  route: HighDensityIntraNodeRoute,
  obstacleRoutes: HighDensityIntraNodeRoute[],
): HighDensityIntraNodeRoute {
  const newRoute = { ...route }
  const points = [...route.route]
  const vias = new Set(route.vias.map((v) => `${v.x},${v.y}`))
  let modified = false

  // First pass: Remove redundant layer changes (case 1)
  for (let i = 0; i < points.length - 2; i++) {
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2]

    // Check if we have a layer change that immediately reverts
    if (p1.z === p3.z && p1.z !== p2.z) {
      // Remove the via at p2's position
      vias.delete(`${p2.x},${p2.y}`)
      // Keep p2's position but change its layer
      points[i + 1] = { ...p2, z: p1.z }
      modified = true
    }
  }

  // Second pass: Remove unnecessary layer changes (case 2)
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]
    const end = points[i + 1]

    // If points are on different layers
    if (start.z !== end.z) {
      // Check if we could route directly on either layer
      const canRouteOnStartLayer = !pathIntersectsObstacles(
        start,
        { ...end, z: start.z },
        obstacleRoutes,
        route.traceThickness,
        route.viaDiameter,
      )

      if (canRouteOnStartLayer) {
        // Remove the via and keep everything on the start layer
        vias.delete(`${end.x},${end.y}`)
        points[i + 1] = { ...end, z: start.z }
        modified = true
      }
    }
  }

  if (modified) {
    newRoute.route = points
    newRoute.vias = route.vias.filter((v) => vias.has(`${v.x},${v.y}`))
  }

  return newRoute
}
