import type { GraphicsObject } from "graphics-debug"
import { combineVisualizations } from "../utils/combineVisualizations"
import type {
  CapacityMeshNode,
  SimpleRouteJson,
  SimplifiedPcbTrace,
  SimplifiedPcbTraces,
  TraceId,
} from "../types"
import { BaseSolver } from "./BaseSolver"
import { CapacityMeshEdgeSolver } from "./CapacityMeshSolver/CapacityMeshEdgeSolver"
import { CapacityMeshNodeSolver } from "./CapacityMeshSolver/CapacityMeshNodeSolver1"
import { CapacityMeshNodeSolver2_NodeUnderObstacle } from "./CapacityMeshSolver/CapacityMeshNodeSolver2_NodesUnderObstacles"
import { CapacityPathingSolver } from "./CapacityPathingSolver/CapacityPathingSolver"
import { CapacityEdgeToPortSegmentSolver } from "./CapacityMeshSolver/CapacityEdgeToPortSegmentSolver"
import { getColorMap } from "./colors"
import { CapacitySegmentToPointSolver } from "./CapacityMeshSolver/CapacitySegmentToPointSolver"
import { HighDensitySolver } from "./HighDensitySolver/HighDensitySolver"
import type { NodePortSegment } from "../types/capacity-edges-to-port-segments-types"
import { CapacityPathingSolver2_AvoidLowCapacity } from "./CapacityPathingSolver/CapacityPathingSolver2_AvoidLowCapacity"
import { CapacityPathingSolver3_FlexibleNegativeCapacity_AvoidLowCapacity } from "./CapacityPathingSolver/CapacityPathingSolver3_FlexibleNegativeCapacity_AvoidLowCapacity"
import { CapacityPathingSolver4_FlexibleNegativeCapacity } from "./CapacityPathingSolver/CapacityPathingSolver4_FlexibleNegativeCapacity_AvoidLowCapacity_FixedDistanceCost"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { getConnectivityMapFromSimpleRouteJson } from "lib/utils/getConnectivityMapFromSimpleRouteJson"
import { CapacityNodeTargetMerger } from "./CapacityNodeTargetMerger/CapacityNodeTargetMerger"
import { CapacitySegmentPointOptimizer } from "./CapacitySegmentPointOptimizer/CapacitySegmentPointOptimizer"
import { calculateOptimalCapacityDepth } from "../utils/getTunedTotalCapacity1"
import { NetToPointPairsSolver } from "./NetToPointPairsSolver/NetToPointPairsSolver"
import { convertHdRouteToSimplifiedRoute } from "lib/utils/convertHdRouteToSimplifiedRoute"
import { mergeRouteSegments } from "lib/utils/mergeRouteSegments"
import { mapLayerNameToZ } from "lib/utils/mapLayerNameToZ"
import { MultipleHighDensityRouteStitchSolver } from "./RouteStitchingSolver/MultipleHighDensityRouteStitchSolver"
import { convertSrjToGraphicsObject } from "tests/fixtures/convertSrjToGraphicsObject"
import { UnravelMultiSectionSolver } from "./UnravelSolver/UnravelMultiSectionSolver"
import { CapacityPathingSolver5 } from "./CapacityPathingSolver/CapacityPathingSolver5"
import { CapacityMeshNodeSolver3_LargerSingleLayerNodes } from "./CapacityMeshSolver/CapacityMeshNodeSolver3_LargerSingleLayerNodes"
import { StrawSolver } from "./StrawSolver/StrawSolver"
import { SingleLayerNodeMergerSolver } from "./SingleLayerNodeMerger/SingleLayerNodeMergerSolver"
import { CapacityNodeTargetMerger2 } from "./CapacityNodeTargetMerger/CapacityNodeTargetMerger2"
import { PathSmoothingSolver } from "./PathSmoothingSolver/PathSmoothingSolver"

interface CapacityMeshSolverOptions {
  capacityDepth?: number
  targetMinCapacity?: number
}

type PipelineStep<T extends new (...args: any[]) => BaseSolver> = {
  solverName: string
  solverClass: T
  getConstructorParams: (
    instance: CapacityMeshSolver,
  ) => ConstructorParameters<T>
  onSolved?: (instance: CapacityMeshSolver) => void
}

function definePipelineStep<
  T extends new (
    ...args: any[]
  ) => BaseSolver,
  const P extends ConstructorParameters<T>,
>(
  solverName: keyof CapacityMeshSolver,
  solverClass: T,
  getConstructorParams: (instance: CapacityMeshSolver) => P,
  opts: {
    onSolved?: (instance: CapacityMeshSolver) => void
  } = {},
): PipelineStep<T> {
  return {
    solverName,
    solverClass,
    getConstructorParams,
    onSolved: opts.onSolved,
  }
}

export class CapacityMeshSolver extends BaseSolver {
  netToPointPairsSolver?: NetToPointPairsSolver
  nodeSolver?: CapacityMeshNodeSolver
  nodeTargetMerger?: CapacityNodeTargetMerger
  edgeSolver?: CapacityMeshEdgeSolver
  pathingSolver?: CapacityPathingSolver
  edgeToPortSegmentSolver?: CapacityEdgeToPortSegmentSolver
  colorMap: Record<string, string>
  segmentToPointSolver?: CapacitySegmentToPointSolver
  unravelMultiSectionSolver?: UnravelMultiSectionSolver
  pathSmoothingSolver?: PathSmoothingSolver
  segmentToPointOptimizer?: CapacitySegmentPointOptimizer
  highDensityRouteSolver?: HighDensitySolver
  highDensityStitchSolver?: MultipleHighDensityRouteStitchSolver
  singleLayerNodeMerger?: SingleLayerNodeMergerSolver
  strawSolver?: StrawSolver

  startTimeOfPhase: Record<string, number>
  endTimeOfPhase: Record<string, number>
  timeSpentOnPhase: Record<string, number>

  activeSubSolver?: BaseSolver | null = null
  connMap: ConnectivityMap
  srjWithPointPairs?: SimpleRouteJson
  capacityNodes: CapacityMeshNode[] | null = null

  pipelineDef = [
    definePipelineStep(
      "netToPointPairsSolver",
      NetToPointPairsSolver,
      (cms) => [cms.srj, cms.colorMap],
      {
        onSolved: (cms) => {
          cms.srjWithPointPairs =
            cms.netToPointPairsSolver?.getNewSimpleRouteJson()
          cms.colorMap = getColorMap(cms.srjWithPointPairs!, this.connMap)
          cms.connMap = getConnectivityMapFromSimpleRouteJson(
            cms.srjWithPointPairs!,
          )
        },
      },
    ),
    // definePipelineStep("nodeSolver", CapacityMeshNodeSolver, (cms) => [
    //   cms.netToPointPairsSolver?.getNewSimpleRouteJson() || cms.srj,
    //   cms.opts,
    // ]),
    definePipelineStep(
      "nodeSolver",
      CapacityMeshNodeSolver2_NodeUnderObstacle,
      (cms) => [
        cms.netToPointPairsSolver?.getNewSimpleRouteJson() || cms.srj,
        cms.opts,
      ],
    ),
    // definePipelineStep("nodeTargetMerger", CapacityNodeTargetMerger, (cms) => [
    //   cms.nodeSolver?.finishedNodes || [],
    //   cms.srj.obstacles,
    //   cms.connMap,
    // ]),
    // definePipelineStep("nodeTargetMerger", CapacityNodeTargetMerger2, (cms) => [
    //   cms.nodeSolver?.finishedNodes || [],
    //   cms.srj.obstacles,
    //   cms.connMap,
    //   cms.colorMap,
    //   cms.srj.connections,
    // ]),
    definePipelineStep(
      "singleLayerNodeMerger",
      SingleLayerNodeMergerSolver,
      (cms) => [cms.nodeSolver?.finishedNodes!],
    ),
    definePipelineStep(
      "strawSolver",
      StrawSolver,
      (cms) => [{ nodes: cms.singleLayerNodeMerger?.newNodes! }],
      {
        onSolved: (cms) => {
          cms.capacityNodes = cms.strawSolver?.getResultNodes()!
        },
      },
    ),
    definePipelineStep("edgeSolver", CapacityMeshEdgeSolver, (cms) => [
      cms.capacityNodes!,
    ]),
    definePipelineStep("pathingSolver", CapacityPathingSolver5, (cms) => [
      {
        simpleRouteJson: cms.srjWithPointPairs!,
        nodes: cms.capacityNodes!,
        edges: cms.edgeSolver?.edges || [],
        colorMap: cms.colorMap,
        hyperParameters: {
          MAX_CAPACITY_FACTOR: 1,
        },
      },
    ]),
    definePipelineStep(
      "edgeToPortSegmentSolver",
      CapacityEdgeToPortSegmentSolver,
      (cms) => [
        {
          nodes: cms.capacityNodes!,
          edges: cms.edgeSolver?.edges || [],
          capacityPaths: cms.pathingSolver?.getCapacityPaths() || [],
          colorMap: cms.colorMap,
        },
      ],
    ),
    definePipelineStep(
      "segmentToPointSolver",
      CapacitySegmentToPointSolver,
      (cms) => {
        const allSegments: NodePortSegment[] = []
        if (cms.edgeToPortSegmentSolver?.nodePortSegments) {
          cms.edgeToPortSegmentSolver.nodePortSegments.forEach((segs) => {
            allSegments.push(...segs)
          })
        }
        return [
          {
            segments: allSegments,
            colorMap: cms.colorMap,
            nodes: cms.capacityNodes!,
          },
        ]
      },
    ),
    // definePipelineStep(
    //   "segmentToPointOptimizer",
    //   CapacitySegmentPointOptimizer,
    //   (cms) => [
    //     {
    //       assignedSegments: cms.segmentToPointSolver?.solvedSegments || [],
    //       colorMap: cms.colorMap,
    //       nodes: cms.nodeTargetMerger?.newNodes || [],
    //     },
    //   ],
    // ),
    definePipelineStep(
      "unravelMultiSectionSolver",
      UnravelMultiSectionSolver,
      (cms) => [
        {
          assignedSegments: cms.segmentToPointSolver?.solvedSegments || [],
          colorMap: cms.colorMap,
          nodes: cms.capacityNodes!,
        },
      ],
    ),
    definePipelineStep("highDensityRouteSolver", HighDensitySolver, (cms) => [
      {
        nodePortPoints:
          cms.unravelMultiSectionSolver?.getNodesWithPortPoints() ??
          cms.segmentToPointOptimizer?.getNodesWithPortPoints() ??
          [],
        colorMap: cms.colorMap,
        connMap: cms.connMap,
      },
    ]),
    definePipelineStep(
      "highDensityStitchSolver",
      MultipleHighDensityRouteStitchSolver,
      (cms) => [
        {
          connections: cms.srjWithPointPairs!.connections,
          hdRoutes: cms.highDensityRouteSolver!.routes,
          layerCount: cms.srj.layerCount,
        },
      ],
    ),
    definePipelineStep("pathSmoothingSolver", PathSmoothingSolver, (cms) => [
      {},
    ]),
  ]

  constructor(
    public srj: SimpleRouteJson,
    public opts: CapacityMeshSolverOptions = {},
  ) {
    super()
    this.MAX_ITERATIONS = 1e6

    // If capacityDepth is not provided, calculate it automatically
    if (opts.capacityDepth === undefined) {
      // Calculate max width/height from bounds for initial node size
      const boundsWidth = srj.bounds.maxX - srj.bounds.minX
      const boundsHeight = srj.bounds.maxY - srj.bounds.minY
      const maxWidthHeight = Math.max(boundsWidth, boundsHeight)

      // Use the calculateOptimalCapacityDepth function to determine the right depth
      const targetMinCapacity = opts.targetMinCapacity ?? 0.5
      opts.capacityDepth = calculateOptimalCapacityDepth(
        maxWidthHeight,
        targetMinCapacity,
      )
    }

    this.connMap = getConnectivityMapFromSimpleRouteJson(srj)
    this.colorMap = getColorMap(srj, this.connMap)
    this.startTimeOfPhase = {}
    this.endTimeOfPhase = {}
    this.timeSpentOnPhase = {}
  }

  currentPipelineStepIndex = 0
  _step() {
    const pipelineStepDef = this.pipelineDef[this.currentPipelineStepIndex]
    if (!pipelineStepDef) {
      this.solved = true
      return
    }

    if (this.activeSubSolver) {
      this.activeSubSolver.step()
      if (this.activeSubSolver.solved) {
        this.endTimeOfPhase[pipelineStepDef.solverName] = performance.now()
        this.timeSpentOnPhase[pipelineStepDef.solverName] =
          this.endTimeOfPhase[pipelineStepDef.solverName] -
          this.startTimeOfPhase[pipelineStepDef.solverName]
        pipelineStepDef.onSolved?.(this)
        this.activeSubSolver = null
        this.currentPipelineStepIndex++
      } else if (this.activeSubSolver.failed) {
        this.error = this.activeSubSolver?.error
        this.failed = true
        this.activeSubSolver = null
      }
      return
    }

    const constructorParams = pipelineStepDef.getConstructorParams(this)
    // @ts-ignore
    this.activeSubSolver = new pipelineStepDef.solverClass(...constructorParams)
    ;(this as any)[pipelineStepDef.solverName] = this.activeSubSolver
    this.timeSpentOnPhase[pipelineStepDef.solverName] = 0
    this.startTimeOfPhase[pipelineStepDef.solverName] = performance.now()
  }

  getCurrentPhase(): string {
    return this.pipelineDef[this.currentPipelineStepIndex]?.solverName ?? "none"
  }

  visualize(): GraphicsObject {
    if (!this.solved && this.activeSubSolver)
      return this.activeSubSolver.visualize()
    const netToPPSolver = this.netToPointPairsSolver?.visualize()
    const nodeViz = this.nodeSolver?.visualize()
    const nodeTargetMergerViz = this.nodeTargetMerger?.visualize()
    const singleLayerNodeMergerViz = this.singleLayerNodeMerger?.visualize()
    const strawSolverViz = this.strawSolver?.visualize()
    const edgeViz = this.edgeSolver?.visualize()
    const pathingViz = this.pathingSolver?.visualize()
    const edgeToPortSegmentViz = this.edgeToPortSegmentSolver?.visualize()
    const segmentToPointViz = this.segmentToPointSolver?.visualize()
    const segmentOptimizationViz =
      this.unravelMultiSectionSolver?.visualize() ??
      this.segmentToPointOptimizer?.visualize()
    const highDensityViz = this.highDensityRouteSolver?.visualize()
    const highDensityStitchViz = this.highDensityStitchSolver?.visualize()
    const pathSmoothingViz = this.pathSmoothingSolver?.visualize()
    const problemViz = {
      points: [...this.srj.connections.flatMap((c) => c.pointsToConnect)],
      rects: [
        ...(this.srj.obstacles ?? []).map((o) => ({
          ...o,
          fill: o.layers?.includes("top")
            ? "rgba(255,0,0,0.25)"
            : o.layers?.includes("bottom")
              ? "rgba(0,0,255,0.25)"
              : "rgba(255,0,0,0.25)",
        })),
      ],
      lines: [
        {
          points: [
            // Add five points representing the bounds of the PCB
            {
              x: this.srj.bounds?.minX ?? -50,
              y: this.srj.bounds?.minY ?? -50,
            },
            { x: this.srj.bounds?.maxX ?? 50, y: this.srj.bounds?.minY ?? -50 },
            { x: this.srj.bounds?.maxX ?? 50, y: this.srj.bounds?.maxY ?? 50 },
            { x: this.srj.bounds?.minX ?? -50, y: this.srj.bounds?.maxY ?? 50 },
            {
              x: this.srj.bounds?.minX ?? -50,
              y: this.srj.bounds?.minY ?? -50,
            }, // Close the rectangle
          ],
          strokeColor: "rgba(255,0,0,0.25)",
        },
      ],
    } as GraphicsObject
    const visualizations = [
      problemViz,
      netToPPSolver,
      nodeViz,
      nodeTargetMergerViz,
      singleLayerNodeMergerViz,
      strawSolverViz,
      edgeViz,
      pathingViz,
      edgeToPortSegmentViz,
      segmentToPointViz,
      segmentOptimizationViz,
      highDensityViz ? combineVisualizations(problemViz, highDensityViz) : null,
      highDensityStitchViz,
      this.solved
        ? combineVisualizations(
            problemViz,
            convertSrjToGraphicsObject(this.getOutputSimpleRouteJson()),
          )
        : null,
      pathSmoothingViz,
    ].filter(Boolean) as GraphicsObject[]
    // return visualizations[visualizations.length - 1]
    return combineVisualizations(...visualizations)
  }

  /**
   * Get original connection name from connection name with MST suffix
   * @param mstConnectionName The MST-suffixed connection name (e.g. "connection1_mst0")
   * @returns The original connection name (e.g. "connection1")
   */
  private getOriginalConnectionName(mstConnectionName: string): string {
    // MST connections are named like "connection_mst0", so extract the original name
    const match = mstConnectionName.match(/^(.+?)_mst\d+$/)
    return match ? match[1] : mstConnectionName
  }

  /**
   * Returns the SimpleRouteJson with routes converted to SimplifiedPcbTraces
   */
  getOutputSimplifiedPcbTraces(): SimplifiedPcbTraces {
    if (!this.solved || !this.highDensityRouteSolver) {
      throw new Error("Cannot get output before solving is complete")
    }

    const traces: SimplifiedPcbTraces = []

    for (const connection of this.netToPointPairsSolver?.newConnections ?? []) {
      const netConnection = this.srj.connections.find(
        (c) => c.name === connection.netConnectionName,
      )

      // Find all the hdRoutes that correspond to this connection
      const hdRoutes = this.highDensityStitchSolver!.mergedHdRoutes.filter(
        (r) => r.connectionName === connection.name,
      )

      for (let i = 0; i < hdRoutes.length; i++) {
        const hdRoute = hdRoutes[i]
        const simplifiedPcbTrace: SimplifiedPcbTrace = {
          type: "pcb_trace",
          pcb_trace_id: `${connection.name}_${i}`,
          connection_name: this.getOriginalConnectionName(connection.name),
          route: convertHdRouteToSimplifiedRoute(hdRoute, this.srj.layerCount),
        }

        traces.push(simplifiedPcbTrace)
      }
    }

    return traces
  }

  getOutputSimpleRouteJson(): SimpleRouteJson {
    return {
      ...this.srj,
      traces: this.getOutputSimplifiedPcbTraces(),
    }
  }
}
