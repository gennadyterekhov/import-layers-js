import { checkGraph } from './adapters/pipeline.js';
import { resolve } from 'node:path';
import { loadDependencies } from './adapters/dependencies.js';
import { openProject } from './adapters/project.js';
import { inspectSource } from './adapters/source.js';
import { analyzeSources } from './analysis/analyze.js';

export async function analyzeProject({ root = process.cwd(), paths = ['.'], configPath, onFile, usePipeline = false } = {}) {
    const project = await openProject({ root, paths, configPath });
    const sources = await loadDependencies(project.root, project.entries, project.config);
    const result = await analyzeSources(
        sources,
        project.config.layers,
        (file) => inspectSource(resolve(project.root, file)),
        project.config.debug ? onFile : undefined,
        usePipeline,
    );
    if (!usePipeline) return result;
    const checked = await checkGraph(project, result);
    return { ...result, graph: { nodes: result.graph.nodes, edges: checked.edges }, pipelineViolations: checked.violations };
}
