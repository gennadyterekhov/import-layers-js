import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { cruise } from 'dependency-cruiser';
import { canonicalSource, projectPath, sourceExclusion } from './project.js';

async function findJsConfig(root) {
    for (const name of ['tsconfig.json', 'jsconfig.json']) {
        const fileName = join(root, name);
        const info = await stat(fileName).catch((error) => {
            if (error.code !== 'ENOENT') throw error;
        });
        if (info?.isFile()) return { fileName };
    }
}

function identifySources(modules, root, ignoreTests) {
    const sources = new Map();
    const canonicalPaths = new Map();

    for (const module of modules) {
        if (module.coreModule || module.couldNotResolve) continue;
        const source = projectPath(root, module.source);
        if (!source) continue;

        // The crawler can list a symlink under its apparent path during its directory scan.
        const canonical = canonicalSource(root, source, ignoreTests);
        if (!canonical) continue;
        canonicalPaths.set(source, canonical);
        if (canonical === source || !sources.has(canonical)) {
            sources.set(canonical, module.dependencies);
        }
    }
    return { sources, canonicalPaths };
}

export async function loadDependencies(root, entries, { ignoreTests }) {
    const { output: { modules } } = await cruise(entries, {
        baseDir: root,
        exclude: sourceExclusion(ignoreTests),
        tsConfig: await findJsConfig(root),
        tsPreCompilationDeps: true,
    }, {
        exportsFields: ['exports'],
        conditionNames: ['node', 'import', 'require', 'default'],
    });

    const { sources, canonicalPaths } = identifySources(modules, root, ignoreTests);
    const projectSources = new Map();
    for (const [source, dependencies] of sources) {
        const imports = [];
        const unresolved = new Set();
        for (const dependency of dependencies) {
            if (dependency.couldNotResolve) {
                unresolved.add(dependency.module);
            } else if (!dependency.coreModule) {
                const target = canonicalPaths.get(projectPath(root, dependency.resolved));
                if (target) imports.push({ target, specifier: dependency.module });
            }
        }
        projectSources.set(source, { imports, unresolved });
    }
    return projectSources;
}
