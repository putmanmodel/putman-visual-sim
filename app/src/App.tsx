import { useMemo, useRef, useState } from "react";
import { PipelineParams, runPipeline } from "@core";
import type { BeamCandidate, Graph, RunLog, SimulationOutput } from "@core";
import stableSpec from "../../specs/stable.json";
import driftSpec from "../../specs/drift.json";
import collapseSpec from "../../specs/collapse.json";

type Preset = {
  name: string;
  description: string;
  params: PipelineParams;
};

const presets: Preset[] = [stableSpec, driftSpec, collapseSpec] as Preset[];
const defaultParams = stableSpec.params as PipelineParams;

type SliderKey = Exclude<keyof PipelineParams, "seed">;

type SliderSpec = {
  key: SliderKey;
  label: string;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  tooltip?: string;
};

const seedBounds = { key: "seed" as const, label: "Seed", min: 0, max: 9999, step: 1 };

const sliders: SliderSpec[] = [
  { key: "nodeCount", label: "Nodes", min: 12, max: 60, step: 1 },
  { key: "edgeDensity", label: "Edge density", min: 0.08, max: 0.45, step: 0.01 },
  { key: "overlapPercent", label: "Overlap %", min: 0.05, max: 0.8, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
  { key: "recursionDepth", label: "Recursion depth d", min: 2, max: 16, step: 1, tooltip: "d is the number of recursive update cycles in the pipeline." },
  { key: "rigidity", label: "Rigidity ρ", min: 0.1, max: 0.7, step: 0.01, tooltip: "ρ controls pruning strictness, where higher values remove more weak structure." },
  { key: "beamWidth", label: "Beam width k", min: 1, max: 10, step: 1, tooltip: "k is how many top reconstruction candidates are retained per expansion." },
  { key: "activationThreshold", label: "Activation threshold", min: 0.3, max: 0.8, step: 0.01 },
  { key: "contextBlend", label: "Context blend", min: 0.1, max: 0.9, step: 0.01, tooltip: "E denotes edge contribution to activation via weighted local structure." },
  { key: "weightLearningRate", label: "Learning rate", min: 0.05, max: 0.5, step: 0.01 },
  { key: "driftBias", label: "Drift bias", min: 0, max: 0.4, step: 0.01, tooltip: "Δ measures activation shift between consecutive steps using L2 distance." }
];

const sliderByKey = new Map<SliderKey, SliderSpec>(sliders.map((slider) => [slider.key, slider]));
const integerKeys = new Set<keyof PipelineParams>(["seed", "nodeCount", "recursionDepth", "beamWidth"]);

function formatBound(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
}

function hash01(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function createLayout(graph: Graph, seed: number): Record<string, { x: number; y: number }> {
  const centerX = 500;
  const centerY = 330;
  const radius = 240;
  const total = graph.nodes.length;
  const positions: Record<string, { x: number; y: number }> = {};

  graph.nodes.forEach((node, i) => {
    const base = (Math.PI * 2 * i) / total;
    const jitterA = (hash01(`${seed}-${node.id}-a`) - 0.5) * 0.42;
    const jitterR = (hash01(`${seed}-${node.id}-r`) - 0.5) * 45;
    const r = radius + jitterR;
    positions[node.id] = {
      x: centerX + Math.cos(base + jitterA) * r,
      y: centerY + Math.sin(base + jitterA) * r
    };
  });

  return positions;
}

function download(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function clampParamValue(key: keyof PipelineParams, value: number): number {
  const bounds = key === "seed" ? seedBounds : sliderByKey.get(key as SliderKey);
  if (!bounds) return value;
  const clamped = Math.min(bounds.max, Math.max(bounds.min, value));
  return integerKeys.has(key) ? Math.round(clamped) : clamped;
}

function clampPresetParams(requested: PipelineParams): {
  applied: PipelineParams;
  clampedFields: Array<keyof PipelineParams>;
} {
  const applied: PipelineParams = { ...requested };
  const clampedFields: Array<keyof PipelineParams> = [];

  (Object.keys(requested) as Array<keyof PipelineParams>).forEach((key) => {
    const nextValue = clampParamValue(key, requested[key]);
    applied[key] = nextValue;
    if (nextValue !== requested[key]) {
      clampedFields.push(key);
    }
  });

  return { applied, clampedFields };
}

function App() {
  const [params, setParams] = useState<PipelineParams>({ ...defaultParams });
  const [seedInput, setSeedInput] = useState<string>(String(defaultParams.seed));
  const [paramsRequested, setParamsRequested] = useState<PipelineParams | null>(null);
  const [clampedFields, setClampedFields] = useState<Array<keyof PipelineParams>>([]);
  const [activePreset, setActivePreset] = useState<string>(stableSpec.name);
  const [showAbout, setShowAbout] = useState(true);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [result, setResult] = useState<SimulationOutput>(() => runPipeline(defaultParams));
  const [stepIndex, setStepIndex] = useState(0);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const runlog: RunLog = result.runlog;
  const step = runlog.steps[Math.min(stepIndex, runlog.steps.length - 1)];
  const prevStep = stepIndex > 0 ? runlog.steps[stepIndex - 1] : null;

  const layout = useMemo(() => createLayout(result.graph, params.seed), [result.graph, params.seed]);
  const beamWinner: BeamCandidate | undefined = step.beamCandidates[0];
  const beamEdgeSet = new Set(beamWinner?.edgePath ?? []);
  const beamNodeSet = new Set(beamWinner?.nodePath ?? []);
  const prunedNodeSet = new Set(step.prunedNodes);
  const prunedEdgeSet = new Set(step.prunedEdges);
  const activeSet = new Set(step.activeSet);
  const prevActiveSet = new Set(prevStep?.activeSet ?? []);
  const newlyActive = new Set(step.activeSet.filter((nodeId) => !prevActiveSet.has(nodeId)));
  const newlyPruned = stepIndex === 0
    ? new Set<string>()
    : step.prunedNodes.length > 0 || (prevStep?.prunedNodes.length ?? 0) > 0
      ? new Set(step.prunedNodes.filter((nodeId) => !(prevStep?.prunedNodes ?? []).includes(nodeId)))
      : new Set((prevStep?.activeSet ?? []).filter((nodeId) => !activeSet.has(nodeId)));

  const deltas = runlog.steps.map((s) => s.delta);
  const maxDelta = Math.max(...deltas, 0);
  const hasDeltaChange = maxDelta > 0;
  const chartMax = hasDeltaChange ? maxDelta * 1.1 : 1;
  const avgDelta = deltas.length > 0 ? deltas.reduce((sum, value) => sum + value, 0) / deltas.length : 0;

  const clearPresetClampState = () => {
    setParamsRequested(null);
    setClampedFields([]);
  };

  const updateParam = (key: keyof PipelineParams, nextValue: number) => {
    const clampedValue = clampParamValue(key, nextValue);
    setParams((prev) => ({ ...prev, [key]: clampedValue }));
    clearPresetClampState();
  };

  const applyPreset = (preset: Preset) => {
    setActivePreset(preset.name);
    const requested = { ...preset.params };
    const { applied, clampedFields: presetClampedFields } = clampPresetParams(requested);
    setParamsRequested(requested);
    setClampedFields(presetClampedFields);
    setParams(applied);
    setSeedInput(String(applied.seed));
    const next = runPipeline(applied);
    setResult(next);
    setStepIndex(0);
  };

  const runSimulation = () => {
    const next = runPipeline(params);
    setResult(next);
    setStepIndex(0);
  };

  const exportSvg = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    download(`putman-step-${step.step}.svg`, `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n${xml}`, "image/svg+xml");
  };

  const exportRunlog = () => {
    const exportPayload = {
      exportedAtISO: new Date().toISOString(),
      selectedStepIndex: stepIndex,
      selectedDelta: step.delta,
      diff: {
        newlyActiveCount: newlyActive.size,
        droppedCount: newlyPruned.size
      },
      paramsRequested: paramsRequested ?? { ...params },
      paramsApplied: { ...params },
      clampedFields,
      runlog
    };

    download(
      `putman-runlog-seed-${params.seed}.json`,
      JSON.stringify(exportPayload, null, 2),
      "application/json"
    );
  };

  const commitSeedInput = () => {
    const parsed = Number.parseInt(seedInput.trim(), 10);
    if (Number.isNaN(parsed)) {
      setSeedInput(String(params.seed));
      return;
    }
    const nextSeed = clampParamValue("seed", parsed);
    updateParam("seed", nextSeed);
    setSeedInput(String(nextSeed));
  };

  return (
    <div className="shell">
      <aside className="panel left-panel">
        <h1>PUTMAN Pipeline Visual Simulator</h1>
        <p className="muted">M = (V, E, w, t) + C → S → beam reconstruction → I → Δ</p>

        <section>
          <h2>Presets</h2>
          <div className="preset-row">
            {presets.map((preset) => (
              <button
                key={preset.name}
                className={preset.name === activePreset ? "active" : ""}
                onClick={() => applyPreset(preset)}
              >
                {preset.name}
              </button>
            ))}
          </div>
          {clampedFields.length > 0 ? (
            <p className="preset-clamped-badge muted small">
              Preset clamped: {clampedFields.join(", ")}
            </p>
          ) : null}
          <p className="muted small">{presets.find((p) => p.name === activePreset)?.description}</p>
        </section>

        <section>
          <h2>Generator + Controls</h2>
          <div className="sliders">
            <label>
              <span>Seed</span>
              <div className="control-row seed-control-row">
                <input
                  type="text"
                  inputMode="numeric"
                  value={seedInput}
                  onChange={(event) => setSeedInput(event.target.value)}
                  onBlur={commitSeedInput}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      commitSeedInput();
                    }
                  }}
                />
                <div className="value-meta">
                  <output>{params.seed}</output>
                  <span className="range-text">({seedBounds.min}–{seedBounds.max})</span>
                </div>
              </div>
            </label>

            {sliders.map((slider) => {
              const value = params[slider.key] as number;
              return (
                <label key={String(slider.key)}>
                  <span>
                    {slider.label}
                    {slider.tooltip ? <abbr title={slider.tooltip}> ⓘ</abbr> : null}
                  </span>
                  <div className="control-row">
                    <input
                      type="range"
                      min={slider.min}
                      max={slider.max}
                      step={slider.step}
                      value={value}
                      onChange={(event) => updateParam(slider.key, Number(event.target.value))}
                    />
                    <input
                      className="numeric-input"
                      type="number"
                      min={slider.min}
                      max={slider.max}
                      step={slider.step}
                      value={value}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        if (Number.isNaN(parsed)) return;
                        updateParam(slider.key, parsed);
                      }}
                    />
                    <div className="value-meta">
                      <output>{slider.format ? slider.format(value) : value.toFixed(slider.step >= 1 ? 0 : 2)}</output>
                      <span className="range-text">({formatBound(slider.min)}–{formatBound(slider.max)})</span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </section>

        <section className="button-column">
          <button onClick={runSimulation}>Run</button>
          <button onClick={exportSvg}>Export SVG</button>
          <button onClick={exportRunlog}>Export JSON Runlog</button>
          <button onClick={() => setAboutOpen((prev) => !prev)}>{aboutOpen ? "Close About" : "About"}</button>
        </section>

        {aboutOpen ? (
          <section className="about-drawer">
            <h2>About Mapping</h2>
            <ul>
              <li>Left sidebar maps to Experimental Setup.</li>
              <li>Center graph maps to Pipeline Mechanics.</li>
              <li>Right metrics map to Results and Analysis.</li>
              <li>Step trace maps to Recursion Dynamics.</li>
              <li>Export tools map to Reproducibility Appendix.</li>
            </ul>
          </section>
        ) : null}
      </aside>

      <main className="center">
        <header className="center-head">
          <h2>Graph State</h2>
          <p className="muted">Step {step.step + 1} / {runlog.steps.length}</p>
        </header>

        <svg ref={svgRef} viewBox="0 0 1000 660" className="graph-canvas" role="img" aria-label="Pipeline graph visualization">
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {result.graph.edges.map((edge) => {
            const src = layout[edge.source];
            const dst = layout[edge.target];
            const weight = step.edgeWeights[edge.id] ?? edge.weight;
            const isPruned = prunedEdgeSet.has(edge.id);
            const inBeam = beamEdgeSet.has(edge.id);
            const edgeClass = inBeam ? "beam-win" : undefined;
            return (
              <line
                key={edge.id}
                className={edgeClass}
                x1={src.x}
                y1={src.y}
                x2={dst.x}
                y2={dst.y}
                stroke={inBeam ? "#6ac4ff" : "#738091"}
                strokeWidth={inBeam ? 2.8 : Math.max(0.8, weight * 2.4)}
                opacity={isPruned ? 0.12 : inBeam ? 0.95 : 0.36}
              />
            );
          })}

          {result.graph.nodes.map((node) => {
            const pos = layout[node.id];
            const score = step.activationVector[node.id] ?? 0;
            const isActive = activeSet.has(node.id);
            const isPruned = prunedNodeSet.has(node.id);
            const inBeam = beamNodeSet.has(node.id);
            const isNew = newlyActive.has(node.id);
            const isLost = newlyPruned.has(node.id);
            const nodeClass = [isNew ? "node-new" : "", isLost ? "node-lost" : "", inBeam ? "beam-win" : ""]
              .filter(Boolean)
              .join(" ");
            const r = 7 + score * 10;
            return (
              <g key={node.id} transform={`translate(${pos.x}, ${pos.y})`} filter={isActive ? "url(#glow)" : undefined}>
                <circle
                  className={nodeClass || undefined}
                  r={r}
                  fill={inBeam ? "#4ca6ff" : node.prior ? "#9aa4b2" : "#8fbf9f"}
                  opacity={isPruned ? 0.18 : isActive ? 0.95 : 0.72}
                  stroke={isActive ? "#daf1ff" : "#11151b"}
                  strokeWidth={isActive ? 2 : 1}
                />
                <text y={-r - 4} textAnchor="middle" className="node-label">{node.id}</text>
              </g>
            );
          })}
        </svg>
      </main>

      <aside className="panel right-panel">
        <section>
          <div className="panelHeader">
            <div>
              <h2 className="panelTitle">PUTMAN Model Pipeline Visual Simulator</h2>
              <p className="panelSub">Deterministic, local-only pipeline simulator</p>
            </div>
            <button className="btn small" onClick={() => setShowAbout((prev) => !prev)}>
              {showAbout ? "Hide" : "Show"}
            </button>
          </div>
          {showAbout ? (
            <div className="panelBody">
              <p className="equation">
                M = (V, E, w, t) + context C → activation S → beam reconstruction → interpretation I → shift metric Δ
              </p>
              <p className="sectionLabel">Pipeline</p>
              <ul className="bullets">
                <li>Seeded synthetic graph generation (node count, edge density, prior/new overlap)</li>
                <li>Activation scoring from context + weighted structure</li>
                <li>Rigidity pruning (ρ) over weak nodes/edges</li>
                <li>Beam reconstruction with width k</li>
                <li>Recursive updates across depth d</li>
                <li>Interpretation summaries (I) and per-step shift metric (Δ)</li>
                <li>Deterministic runlogs + export (SVG + JSON)</li>
              </ul>
              <p className="note">Tip: try drift vs collapse presets and compare the Δ chart + top nodes/edges.</p>
            </div>
          ) : null}
        </section>

        <section>
          <h2>Metrics</h2>
          <div className="stats">
            <div><span>Active S</span><strong>{step.activeSet.length}</strong></div>
            <div><span>Pruned nodes</span><strong>{step.prunedNodes.length}</strong></div>
            <div><span>Pruned edges</span><strong>{step.prunedEdges.length}</strong></div>
            <div><span>Beam k</span><strong>{params.beamWidth}</strong></div>
            <div><span>Δ (current)</span><strong>{step.delta.toFixed(3)}</strong></div>
          </div>
          <p className="muted small">
            New active: {newlyActive.size} | Dropped: {newlyPruned.size} | Beam candidates: {step.beamCandidates.length} | Δ: {step.delta.toFixed(3)}
          </p>
        </section>

        <section>
          <h2>Δ Chart</h2>
          <div className="stats">
            <div><span>Δ current</span><strong>{step.delta.toFixed(3)}</strong></div>
            <div><span>Δ max</span><strong>{maxDelta.toFixed(3)}</strong></div>
            <div><span>Δ avg</span><strong>{avgDelta.toFixed(3)}</strong></div>
          </div>
          {hasDeltaChange ? (
            <svg viewBox="0 0 280 120" className="delta-chart" role="img" aria-label="Shift metric chart">
              <line
                x1={5}
                y1={110 - (avgDelta / chartMax) * 90}
                x2={275}
                y2={110 - (avgDelta / chartMax) * 90}
                stroke="#cfd8e399"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <polyline
                fill="none"
                stroke="#6ac4ff"
                strokeWidth="2"
                points={deltas
                  .map((value, index) => {
                    const x = (index / Math.max(1, deltas.length - 1)) * 270 + 5;
                    const y = 110 - (value / chartMax) * 90;
                    return `${x},${y}`;
                  })
                  .join(" ")}
              />
              {deltas.map((value, index) => {
                const x = (index / Math.max(1, deltas.length - 1)) * 270 + 5;
                const y = 110 - (value / chartMax) * 90;
                return <circle key={`${index}-${value}`} cx={x} cy={y} r={index === stepIndex ? 4 : 2.5} fill={index === stepIndex ? "#e9f4ff" : "#6ac4ff"} />;
              })}
            </svg>
          ) : (
            <p className="muted small">Delta is zero (no change detected)</p>
          )}
        </section>

        <section>
          <h2>Step Trace</h2>
          <div className="trace-list">
            {runlog.steps.map((entry, idx) => (
              <button
                key={entry.step}
                className={idx === stepIndex ? "active" : ""}
                onClick={() => setStepIndex(idx)}
              >
                t{entry.step} · Δ {entry.delta.toFixed(3)} · |S| {entry.activeSet.length}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>Interpretation I</h2>
          <p className="muted small">
            Top nodes: {step.interpretation.topNodes.map((n) => `${n.id}(${n.score.toFixed(2)})`).join(", ") || "none"}
          </p>
          <p className="muted small">
            Top edges: {step.interpretation.topEdges.map((e) => `${e.id}(${e.score.toFixed(2)})`).join(", ") || "none"}
          </p>
        </section>

        <section>
          <h2>Bounds</h2>
          <ul className="bounds-list">
            <li>{seedBounds.label}: {formatBound(seedBounds.min)}–{formatBound(seedBounds.max)}</li>
            {sliders.map((slider) => (
              <li key={slider.key}>{slider.label}: {formatBound(slider.min)}–{formatBound(slider.max)}</li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}

export default App;
