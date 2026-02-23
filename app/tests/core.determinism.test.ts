import { describe, expect, it } from "vitest";
import { runPipeline, runlogHash, type PipelineParams } from "@core";

const params: PipelineParams = {
  seed: 42,
  nodeCount: 24,
  edgeDensity: 0.22,
  overlapPercent: 0.3,
  recursionDepth: 6,
  rigidity: 0.3,
  beamWidth: 4,
  activationThreshold: 0.5,
  contextBlend: 0.55,
  weightLearningRate: 0.2,
  driftBias: 0.08
};

describe("PUTMAN core determinism", () => {
  it("returns identical runlog hashes for same seed and params", () => {
    const first = runPipeline(params);
    const second = runPipeline(params);

    expect(runlogHash(first.runlog)).toEqual(runlogHash(second.runlog));
    expect(first.runlog).toEqual(second.runlog);
  });

  it("changes runlog hash for different seeds", () => {
    const first = runPipeline({ ...params, seed: 10 });
    const second = runPipeline({ ...params, seed: 11 });

    expect(runlogHash(first.runlog)).not.toEqual(runlogHash(second.runlog));
  });
});
