import { createRng } from "./rng";
import { ContextVector, Edge, GeneratorParams, Graph, Node } from "./types";

function makeNodeId(index: number): string {
  return `n${index.toString().padStart(3, "0")}`;
}

export function generateGraph(seed: number, params: GeneratorParams): { graph: Graph; context: ContextVector } {
  const rng = createRng(seed);
  const { nodeCount, edgeDensity, overlapPercent } = params;
  const overlapCount = Math.max(1, Math.floor(nodeCount * overlapPercent));
  const priorCount = Math.max(overlapCount + 1, Math.floor(nodeCount * 0.6));

  const nodes: Node[] = [];
  for (let i = 0; i < nodeCount; i += 1) {
    const id = makeNodeId(i);
    const prior = i < priorCount;
    const novelty = i >= priorCount - overlapCount;
    nodes.push({ id, prior, novelty });
  }

  const edges: Edge[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (rng.next() <= edgeDensity) {
        const source = nodes[i].id;
        const target = nodes[j].id;
        const id = `${source}->${target}`;
        const weight = Math.round((0.2 + rng.next() * 0.8) * 1000) / 1000;
        const prior = nodes[i].prior && nodes[j].prior;
        edges.push({ id, source, target, weight, prior });
      }
    }
  }

  const context: ContextVector = {};
  nodes.forEach((node) => {
    const base = node.prior ? 0.45 : 0.35;
    const noveltyLift = node.novelty ? 0.2 : 0;
    context[node.id] = Math.round((base + noveltyLift + rng.next() * 0.25) * 1000) / 1000;
  });

  return { graph: { nodes, edges }, context };
}
