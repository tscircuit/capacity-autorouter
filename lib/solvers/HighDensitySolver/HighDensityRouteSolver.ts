import type {
  HighDensityIntraNodeRoute,
  NodeWithPortPoints,
} from "../../types/high-density-types"
import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import { safeTransparentize } from "../colors"
import { SingleIntraNodeRouteSolver } from "./SingleIntraNodeRouteSolver"

export class HighDensityRouteSolver extends BaseSolver {
  unsolvedNodePortPoints: NodeWithPortPoints[]
  routes: HighDensityIntraNodeRoute[]
  colorMap: Record<string, string>

  // Defaults as specified: viaDiameter of 0.6 and traceThickness of 0.15
  readonly defaultViaDiameter = 0.6
  readonly defaultTraceThickness = 0.15

  failedSolvers: SingleIntraNodeRouteSolver[]

  constructor({
    nodePortPoints,
    colorMap,
  }: {
    nodePortPoints: NodeWithPortPoints[]
    colorMap?: Record<string, string>
  }) {
    super()
    this.unsolvedNodePortPoints = nodePortPoints
    this.colorMap = colorMap ?? {}
    this.routes = []
    this.failedSolvers = []
  }

  /**
   * Each iteration, pop an unsolved node and attempt to find the routes inside
   * of it.
   */
  step() {
    if (this.unsolvedNodePortPoints.length === 0) {
      this.solved = true
      return
    }
    const node = this.unsolvedNodePortPoints.pop()!

    const solver = new SingleIntraNodeRouteSolver({
      nodeWithPortPoints: node,
      colorMap: this.colorMap,
    })
    solver.solve()
    if (solver.solved) {
      this.routes.push(...solver.solvedRoutes)
    } else {
      this.failedSolvers.push(solver)
    }
  }

  visualize(): GraphicsObject {
    const graphics: GraphicsObject = {
      lines: [],
      points: [],
      rects: [],
      circles: [],
    }
    for (const route of this.routes) {
      // Split route into segments and check z-level
      for (let i = 0; i < route.route.length - 1; i++) {
        const start = route.route[i]
        const end = route.route[i + 1]
        const color = this.colorMap[route.connectionName]

        graphics.lines!.push({
          points: [
            { x: start.x, y: start.y },
            { x: end.x, y: end.y },
          ],
          label: route.connectionName,
          strokeColor: start.z === 0 ? color : safeTransparentize(color, 0.75),
          strokeWidth: route.traceThickness,
          strokeDash: start.z !== 0 ? "10, 5" : undefined,
        })
      }
      for (const via of route.vias) {
        graphics.circles!.push({
          center: via,
          radius: route.viaDiameter / 2,
          fill: this.colorMap[route.connectionName],
          label: `${route.connectionName} via`,
        })
      }
    }
    for (const solver of this.failedSolvers) {
      const node = solver.nodeWithPortPoints
      // Group port points by connectionName
      const connectionGroups: Record<string, { x: number; y: number }[]> = {}
      for (const pt of node.portPoints) {
        if (!connectionGroups[pt.connectionName]) {
          connectionGroups[pt.connectionName] = []
        }
        connectionGroups[pt.connectionName].push({ x: pt.x, y: pt.y })
      }

      for (const [connectionName, points] of Object.entries(connectionGroups)) {
        for (let i = 0; i < points.length - 1; i++) {
          const start = points[i]
          const end = points[i + 1]
          graphics.lines!.push({
            points: [start, end],
            strokeColor: "red",
            strokeDash: "10, 5",
          })
        }
      }
    }
    return graphics
  }
}
