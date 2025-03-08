export type CapacityMeshNodeId = string

export interface CapacityMesh {
  nodes: CapacityMeshNode[]
  edges: CapacityMeshEdge[]
}

export interface CapacityMeshNode {
  capacityMeshNodeId: string
  center: { x: number; y: number }
  width: number
  height: number
  layer: string
  availableZ: number[]

  _depth?: number

  _completelyInsideObstacle?: boolean
  _containsObstacle?: boolean
  _containsTarget?: boolean
  _targetConnectionName?: string

  _shouldBeInGraph?: boolean

  _parent?: CapacityMeshNode
}

export interface CapacityMeshEdge {
  capacityMeshEdgeId: string
  nodeIds: [CapacityMeshNodeId, CapacityMeshNodeId]
}
