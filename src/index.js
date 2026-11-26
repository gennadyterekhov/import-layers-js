import { checkGraph, parseProject } from './adapters/pipeline.js';
import { listSources, loadDependencies } from './adapters/dependencies.js';
import { openProject } from './adapters/project.js';
import { sourceFile } from './adapters/source.js';
import { collectReferences } from './analysis/analyze.js';

export async function analyzeProject({ root = process.cwd(), paths = ['.'], configPath, onFile } = {}) {
    const project = await openProject({ root, paths, configPath });
    const files = await listSources(project.root, project.config);
    const { trees, errors } = await parseProject(project, [...files].filter(file => sourceFile.test(file)));
    const sources = await loadDependencies(project.root, project.entries, project.config, files, trees);
    const result = collectReferences(sources, errors, project.config.debug ? onFile : undefined);
    const checked = await checkGraph(project, result, trees);
    return {
        graph: { nodes: result.nodes, edges: checked.edges },
        violations: checked.violationDetails.map(({ from, to, fromLayer, toLayer, line }) => ({
            from, to, fromLayer, toLayer, line,
        })),
        unresolved: result.unresolved,
        errors: result.errors,
    };
}
