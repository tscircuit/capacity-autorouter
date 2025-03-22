import { BaseSolver } from "../BaseSolver"
import { HighDensityRoute } from "lib/types/high-density-types"
import { removeUselessVias } from "lib/utils/removeUselessVias"
import { GraphicsObject } from "graphics-debug"
import { mergeRouteSegments } from "lib/utils/mergeRouteSegments"
import { safeTransparentize } from "../colors"

interface ViaRemovalSolverInput {
  routes: HighDensityRoute[]
  colorMap: Record<string, string>
}

export class ViaRemovalSolver extends BaseSolver {
  routes: HighDensityRoute[]
  colorMap: Record<string, string>
  processedRoutes: HighDensityRoute[] = []

  constructor({ routes, colorMap }: ViaRemovalSolverInput) {
    super()
    this.routes = [...routes]
    this.colorMap = colorMap
  }

  _step(): void {
    if (this.routes.length === 0) {
      this.solved = true
      return
    }

    // Process one route at a time
    const route = this.routes.shift()!

    // Get all other routes as obstacles
    const obstacles = [...this.processedRoutes, ...this.routes]

    // Remove useless vias from the route
    const optimizedRoute = removeUselessVias(route, obstacles)

    // Add to processed routes
    this.processedRoutes.push(optimizedRoute)
  }

  visualize(): GraphicsObject {
    const graphics: GraphicsObject = {
      lines: [],
      points: [],
      circles: [],
      rects: [],
    }

    const allRoutes = [...this.processedRoutes, ...this.routes]

    for (const route of allRoutes) {
      // Merge segments based on z-coordinate
      const mergedSegments = mergeRouteSegments(
        route.route,
        route.connectionName,
        this.colorMap[route.connectionName] || "#000000",
      )

      // Add merged segments to graphics
      for (const segment of mergedSegments) {
        graphics.lines!.push({
          points: segment.points,
          label: segment.connectionName,
          strokeColor:
            segment.z === 0
              ? segment.color
              : safeTransparentize(segment.color, 0.75),
          strokeWidth: route.traceThickness,
          strokeDash: segment.z !== 0 ? "10, 5" : undefined,
        })
      }

      // Add vias
      for (const via of route.vias) {
        graphics.circles!.push({
          center: via,
          radius: route.viaDiameter / 2,
          fill: this.colorMap[route.connectionName] || "#000000",
          label: `${route.connectionName} via`,
        })
      }
    }

    return graphics
  }

  getOptimizedRoutes(): HighDensityRoute[] {
    return this.processedRoutes
  }
}
