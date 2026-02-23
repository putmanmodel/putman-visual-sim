export interface Node {
  id: string;
  prior: boolean;
  novelty: boolean;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  weight: number;
  prior: boolean;
}

export interface Graph {
  nodes: Node[];
  edges: Edge[];
}

export interface GeneratorParams {
  nodeCount: number;
  edgeDensity: number;
  overlapPercent: number;
}

export interface PipelineParams extends GeneratorParams {
  seed: number;
  recursionDepth: number;
  rigidity: number;
  beamWidth: number;
  activationThreshold: number;
  contextBlend: number;
  weightLearningRate: number;
  driftBias: number;
}

export interface ContextVector {
  [nodeId: string]: number;
}

export interface BeamCandidate {
  nodePath: string[];
  edgePath: string[];
  score: number;
}

export interface InterpretationSummary {
  topNodes: Array<{ id: string; score: number }>;
  topEdges: Array<{ id: string; score: number }>;
  centroid: Record<string, number>;
}

export interface StepRunLog {
  step: number;
  seed: number;
  params: PipelineParams;
  activeSet: string[];
  prunedNodes: string[];
  prunedEdges: string[];
  beamCandidates: BeamCandidate[];
  interpretation: InterpretationSummary;
  activationVector: Record<string, number>;
  edgeWeights: Record<string, number>;
  delta: number;
}

export interface RunLog {
  model: string;
  createdAt: string;
  params: PipelineParams;
  steps: StepRunLog[];
}

export interface SimulationOutput {
  graph: Graph;
  context: ContextVector;
  runlog: RunLog;
}
