import { resolve } from 'node:path';
import { loadDependencies } from './adapters/dependencies.js';
import { openProject } from './adapters/project.js';
import { inspectSource } from './adapters/source.js';
import { analyzeSources } from './analysis/analyze.js';

export async function analyzeProject({ root = process.cwd(), paths = ['.'], configPath, onFile } = {}) {
    const project = await openProject({ root, paths, configPath });
    const sources = await loadDependencies(project.root, project.entries, project.config);
    return analyzeSources(
        sources,
        project.config.layers,
        (file) => inspectSource(resolve(project.root, file)),
        project.config.debug ? onFile : undefined,
    );
}
