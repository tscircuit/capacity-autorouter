import { BaseSolver } from "lib/solvers/BaseSolver"
import { HighDensityIntraNodeRoute } from "lib/types/high-density-types"
import { GraphicsObject } from "graphics-debug"
import { mergeRouteSegments } from "lib/utils/mergeRouteSegments"
import { safeTransparentize } from "lib/solvers/colors"
import { Obstacle } from "lib/types/srj-types"

/**
 * RemoveUselessViaSolver analyzes routes to eliminate unnecessary vias.
 * It detects patterns where a section of the route changes layer twice unnecessarily,
 * and optimizes the route by maintaining the section on a single layer.
 */
export class RemoveUselessViaSolver extends BaseSolver {
  originalRoutes: HighDensityIntraNodeRoute[]
  optimizedRoutes: HighDensityIntraNodeRoute[] = []
  currentRouteIndex: number = 0
  colorMap: Record<string, string>
  removedVias: { x: number; y: number; routeIndex: number }[] = []
  obstacles: Obstacle[]

  constructor({
    routes,
    obstacles,
    colorMap = {},
  }: {
    routes: HighDensityIntraNodeRoute[]
    obstacles: Obstacle[]
    colorMap?: Record<string, string>
  }) {
    super()
    this.originalRoutes = JSON.parse(JSON.stringify(routes)) // Deep clone
    this.colorMap = colorMap
    this.obstacles = obstacles
    this.MAX_ITERATIONS = routes.length * 10 // Allow multiple passes per route
  }

  _step() {
    // All routes processed - we're done
    if (this.currentRouteIndex >= this.originalRoutes.length) {
      this.solved = true
      return
    }

    // Process the current route
    const optimizedRoute = this.getRouteWithoutUnnecessaryVias(
      this.originalRoutes[this.currentRouteIndex],
    )

    // Add the optimized route
    this.optimizedRoutes.push(optimizedRoute)

    // Move to next route
    this.currentRouteIndex++
  }

  /**
   * Optimizes a route by removing unnecessary via pairs.
   * Identifies sections where layer changes happen and can be avoided.
   */
  private getRouteWithoutUnnecessaryVias(
    route: HighDensityIntraNodeRoute,
  ): HighDensityIntraNodeRoute {
    // Deep clone to avoid mutation issues
    const routePoints = JSON.parse(JSON.stringify(route.route))
    const vias = JSON.parse(JSON.stringify(route.vias))

    // This array will track sections that can be simplified
    const sectionsToOptimize: { start: number; end: number; layer: number }[] =
      []

    // First pass: Find layer transitions and analyze the patterns
    let currentLayer = routePoints[0].z
    let sectionStart = 0

    for (let i = 1; i < routePoints.length; i++) {
      if (routePoints[i].z !== currentLayer) {
        // Layer transition found
        const nextLayer = routePoints[i].z

        // Look ahead to find if we transition back to the original layer
        let returnIndex = -1
        for (let j = i + 1; j < routePoints.length; j++) {
          if (routePoints[j].z === currentLayer) {
            returnIndex = j
            break
          }
        }

        if (returnIndex > 0) {
          // This is a candidate for optimization - the section from i to returnIndex
          // could potentially stay on the original layer
          sectionsToOptimize.push({
            start: i - 1,
            end: returnIndex,
            layer: currentLayer,
          })

          // Skip ahead to after this section
          i = returnIndex
          sectionStart = returnIndex
        } else {
          // No return to original layer found, update the current layer
          currentLayer = nextLayer
          sectionStart = i
        }
      }
    }

    // TODO optimize...

    return route
  }

  /**
   * Gets the optimized routes after via removal
   */
  getOptimizedRoutes(): HighDensityIntraNodeRoute[] {
    if (!this.solved) {
      throw new Error("Cannot get optimized routes before solving is complete")
    }
    return this.optimizedRoutes
  }

  /**
   * Returns the number of vias removed during optimization
   */
  getTotalViasRemoved(): number {
    return this.removedVias.length
  }

  visualize(): GraphicsObject {
    const graphics: GraphicsObject = {
      lines: [],
      points: [],
      rects: [],
      circles: [],
      title: "Via Removal Optimization",
    }

    // Visualize original routes in lighter color
    this.originalRoutes.forEach((route, routeIndex) => {
      const color = this.colorMap[route.connectionName] || "#888888"

      // Draw original route with transparency
      const mergedSegments = mergeRouteSegments(
        route.route,
        route.connectionName,
        color,
      )

      for (const segment of mergedSegments) {
        graphics.lines!.push({
          points: segment.points,
          strokeColor: safeTransparentize(segment.color, 0.7),
          strokeWidth: route.traceThickness,
          strokeDash: segment.z !== 0 ? "10, 5" : undefined,
        })
      }

      // Draw original vias
      for (const via of route.vias) {
        graphics.circles!.push({
          center: via,
          radius: route.viaDiameter / 2,
          fill: safeTransparentize(color, 0.5),
          stroke: "#888888",
        })
      }
    })

    // Visualize optimized routes in solid color
    this.optimizedRoutes.forEach((route, routeIndex) => {
      const color = this.colorMap[route.connectionName] || "#888888"

      // Draw optimized route
      const mergedSegments = mergeRouteSegments(
        route.route,
        route.connectionName,
        color,
      )

      for (const segment of mergedSegments) {
        graphics.lines!.push({
          points: segment.points,
          strokeColor:
            segment.z === 0
              ? segment.color
              : safeTransparentize(segment.color, 0.2),
          strokeWidth: route.traceThickness * 1.2,
          strokeDash: segment.z !== 0 ? "10, 5" : undefined,
        })
      }

      // Draw optimized vias
      for (const via of route.vias) {
        graphics.circles!.push({
          center: via,
          radius: route.viaDiameter / 2,
          fill: color,
        })
      }
    })

    // Highlight removed vias
    for (const removedVia of this.removedVias) {
      const route = this.originalRoutes[removedVia.routeIndex]
      const color = this.colorMap[route.connectionName] || "#888888"

      graphics.circles!.push({
        center: removedVia,
        radius: route.viaDiameter,
        fill: "transparent",
        stroke: "#ff0000",
      })

      // Add an "X" mark over the removed via
      const size = route.viaDiameter / 2
      graphics.lines!.push({
        points: [
          { x: removedVia.x - size, y: removedVia.y - size },
          { x: removedVia.x + size, y: removedVia.y + size },
        ],
        strokeColor: "#ff0000",
        strokeWidth: 0.05,
      })
      graphics.lines!.push({
        points: [
          { x: removedVia.x - size, y: removedVia.y + size },
          { x: removedVia.x + size, y: removedVia.y - size },
        ],
        strokeColor: "#ff0000",
        strokeWidth: 0.05,
      })
    }

    // Add summary text
    const summaryPoint = {
      x: this.originalRoutes.length > 0 ? this.originalRoutes[0].route[0].x : 0,
      y:
        this.originalRoutes.length > 0
          ? this.originalRoutes[0].route[0].y - 3
          : 0,
    }

    graphics.points!.push({
      x: summaryPoint.x,
      y: summaryPoint.y,
      label: `Vias removed: ${this.removedVias.length}`,
      color: "#ff0000",
    })

    return graphics
  }
}
