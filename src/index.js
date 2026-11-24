import { checkGraph } from './adapters/pipeline.js';
import { resolve } from 'node:path';
import { loadDependencies } from './adapters/dependencies.js';
import { openProject } from './adapters/project.js';
import { inspectSource } from './adapters/source.js';
import { collectReferences } from './analysis/analyze.js';

export async function analyzeProject({ root = process.cwd(), paths = ['.'], configPath, onFile } = {}) {
    const project = await openProject({ root, paths, configPath });
    const sources = await loadDependencies(project.root, project.entries, project.config);
    const result = await collectReferences(
        sources,
        (file) => inspectSource(resolve(project.root, file)),
        project.config.debug ? onFile : undefined,
    );
    const checked = await checkGraph(project, result);
    return {
        graph: { nodes: result.nodes, edges: checked.edges },
        violations: checked.violationDetails.map(({ from, to, fromLayer, toLayer, line }) => ({
            from, to, fromLayer, toLayer, line,
        })),
        unresolved: result.unresolved,
        errors: result.errors,
    };
}
