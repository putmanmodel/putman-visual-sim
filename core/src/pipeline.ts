import { clamp01, createRng } from "./rng";
import {
  BeamCandidate,
  ContextVector,
  Edge,
  Graph,
  InterpretationSummary,
  PipelineParams,
  RunLog,
  SimulationOutput,
  StepRunLog
} from "./types";
import { generateGraph } from "./generator";

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function makeAdjacency(edges: Edge[]): Map<string, Edge[]> {
  const adjacency = new Map<string, Edge[]>();
  edges.forEach((edge) => {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source)?.push(edge);
    adjacency.get(edge.target)?.push(edge);
  });
  return adjacency;
}

function activationScores(
  graph: Graph,
  context: ContextVector,
  params: PipelineParams
): Record<string, number> {
  const adjacency = makeAdjacency(graph.edges);
  const scores: Record<string, number> = {};
  graph.nodes.forEach((node) => {
    const incident = adjacency.get(node.id) ?? [];
    const degreeScore = incident.length === 0 ? 0 : incident.reduce((sum, edge) => sum + edge.weight, 0) / incident.length;
    const contextScore = context[node.id] ?? 0;
    const noveltyBonus = node.novelty ? 0.08 : 0;
    const raw = params.contextBlend * contextScore + (1 - params.contextBlend) * degreeScore + noveltyBonus;
    scores[node.id] = Math.round(sigmoid((raw - 0.5) * 4) * 1000) / 1000;
  });
  return scores;
}

function applyRigidity(
  graph: Graph,
  scores: Record<string, number>,
  params: PipelineParams
): { keptGraph: Graph; prunedNodes: string[]; prunedEdges: string[]; activeSet: string[] } {
  const activeThreshold = params.activationThreshold;
  const edgeThreshold = params.rigidity;

  const activeSet = graph.nodes.filter((node) => scores[node.id] >= activeThreshold).map((node) => node.id);
  const keptNodes = graph.nodes.filter((node) => scores[node.id] >= activeThreshold * params.rigidity);
  const keptNodeSet = new Set(keptNodes.map((n) => n.id));
  const prunedNodes = graph.nodes.filter((node) => !keptNodeSet.has(node.id)).map((node) => node.id);

  const keptEdges = graph.edges.filter(
    (edge) =>
      keptNodeSet.has(edge.source) &&
      keptNodeSet.has(edge.target) &&
      edge.weight >= edgeThreshold
  );
  const keptEdgeSet = new Set(keptEdges.map((edge) => edge.id));
  const prunedEdges = graph.edges.filter((edge) => !keptEdgeSet.has(edge.id)).map((edge) => edge.id);

  return {
    keptGraph: { nodes: keptNodes, edges: keptEdges },
    prunedNodes,
    prunedEdges,
    activeSet
  };
}

function beamReconstruct(
  graph: Graph,
  scores: Record<string, number>,
  activeSet: string[],
  beamWidth: number
): BeamCandidate[] {
  const adjacency = makeAdjacency(graph.edges);
  const seeds = activeSet.length > 0 ? activeSet : graph.nodes.slice(0, Math.min(3, graph.nodes.length)).map((n) => n.id);
  let beams: BeamCandidate[] = seeds.map((seed) => ({ nodePath: [seed], edgePath: [], score: scores[seed] ?? 0 }));

  for (let depth = 0; depth < 3; depth += 1) {
    const expansions: BeamCandidate[] = [];
    beams.forEach((beam) => {
      const tail = beam.nodePath[beam.nodePath.length - 1];
      const neighbors = adjacency.get(tail) ?? [];
      neighbors.forEach((edge) => {
        const next = edge.source === tail ? edge.target : edge.source;
        if (beam.nodePath.includes(next)) return;
        expansions.push({
          nodePath: [...beam.nodePath, next],
          edgePath: [...beam.edgePath, edge.id],
          score: Math.round((beam.score + (scores[next] ?? 0) + edge.weight) * 1000) / 1000
        });
      });
    });

    if (expansions.length === 0) break;
    expansions.sort((a, b) => b.score - a.score || a.nodePath.join("").localeCompare(b.nodePath.join("")));
    beams = expansions.slice(0, beamWidth);
  }

  return beams;
}

function interpret(
  beams: BeamCandidate[],
  scores: Record<string, number>,
  graph: Graph
): InterpretationSummary {
  const topNodes = Object.entries(scores)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([id, score]) => ({ id, score: Math.round(score * 1000) / 1000 }));

  const edgeContribution = new Map<string, number>();
  beams.forEach((beam) => {
    beam.edgePath.forEach((edgeId) => {
      edgeContribution.set(edgeId, (edgeContribution.get(edgeId) ?? 0) + beam.score);
    });
  });

  const topEdges = Array.from(edgeContribution.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([id, score]) => ({ id, score: Math.round(score * 1000) / 1000 }));

  const centroid: Record<string, number> = {};
  graph.nodes.forEach((node) => {
    centroid[node.id] = scores[node.id] ?? 0;
  });

  return { topNodes, topEdges, centroid };
}

function l2Distance(a: Record<string, number>, b: Record<string, number>): number {
  // Delta uses L2 distance between consecutive activation vectors.
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let sum = 0;

  keys.forEach((key) => {
    const va = a[key] ?? 0;
    const vb = b[key] ?? 0;
    const diff = va - vb;
    sum += diff * diff;
  });

  return Math.sqrt(sum);
}

function updateWeights(
  graph: Graph,
  scores: Record<string, number>,
  params: PipelineParams,
  stepSeed: number
): Graph {
  const rng = createRng(stepSeed);
  const edges = graph.edges.map((edge) => {
    const sourceScore = scores[edge.source] ?? 0;
    const targetScore = scores[edge.target] ?? 0;
    const meanActivation = (sourceScore + targetScore) / 2;
    const noveltyPush = edge.prior ? 0 : params.driftBias;
    const stochastic = (rng.next() - 0.5) * 0.02;
    const nextWeight = clamp01(
      edge.weight * (1 - params.weightLearningRate) +
        meanActivation * params.weightLearningRate +
        noveltyPush * 0.05 +
        stochastic
    );

    return { ...edge, weight: Math.round(nextWeight * 1000) / 1000 };
  });

  return { ...graph, edges };
}

function toEdgeWeightMap(edges: Edge[]): Record<string, number> {
  const result: Record<string, number> = {};
  edges.forEach((edge) => {
    result[edge.id] = edge.weight;
  });
  return result;
}

export function runPipeline(params: PipelineParams): SimulationOutput {
  let { graph, context } = generateGraph(params.seed, params);
  const steps: StepRunLog[] = [];
  let previousActivationVector: Record<string, number> | null = null;

  for (let step = 0; step < params.recursionDepth; step += 1) {
    const scores = activationScores(graph, context, params);
    const rigid = applyRigidity(graph, scores, params);
    const beamCandidates = beamReconstruct(rigid.keptGraph, scores, rigid.activeSet, params.beamWidth);
    const interpretation = interpret(beamCandidates, scores, rigid.keptGraph);
    const delta = previousActivationVector ? Number(l2Distance(previousActivationVector, scores).toFixed(3)) : 0;

    steps.push({
      step,
      seed: params.seed,
      params: { ...params },
      activeSet: [...rigid.activeSet].sort(),
      prunedNodes: [...rigid.prunedNodes].sort(),
      prunedEdges: [...rigid.prunedEdges].sort(),
      beamCandidates,
      interpretation,
      activationVector: scores,
      edgeWeights: toEdgeWeightMap(graph.edges),
      delta
    });

    previousActivationVector = { ...scores };

    if (step < params.recursionDepth - 1) {
      graph = updateWeights(graph, scores, params, params.seed + step + 1);
      const contextKeys = Object.keys(context);
      contextKeys.forEach((key, index) => {
        const perturb = Math.sin((step + 1) * (index + 1)) * 0.005;
        context[key] = Math.round(clamp01(context[key] + perturb + params.driftBias * 0.01) * 1000) / 1000;
      });
    }
  }

  const runlog: RunLog = {
    model: "PUTMAN Pipeline Visual Simulator",
    createdAt: "deterministic",
    params: { ...params },
    steps
  };

  return { graph, context, runlog };
}
