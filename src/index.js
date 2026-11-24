import { realpathSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { cruise } from 'dependency-cruiser';

const excludedPath = /(?:^|\/)(?:node_modules|\.git|\.yarn)(?:\/|$)|^\.\.(?:\/|$)/;

function projectPath(root, path) {
    const relativePath = relative(root, resolve(root, path)).split(sep).join('/');
    if (isAbsolute(relativePath) || excludedPath.test(relativePath)) {
        return null;
    }
    return relativePath;
}

async function readConfig(root) {
    try {
        const { layers, debug = false } = JSON.parse(await readFile(join(root, 'import_layers.json'), 'utf8'));
        if (!Array.isArray(layers) || layers.length === 0 ||
            layers.some((layer) => typeof layer !== 'string' || !layer.trim()) ||
            new Set(layers).size !== layers.length) {
            throw new Error('layers must be a non-empty array of unique directory names or paths');
        }
        if (typeof debug !== 'boolean') {
            throw new Error('debug must be a boolean');
        }
        return { layers, debug };
    } catch (error) {
        throw new Error(`import_layers.json: ${error.message}`, { cause: error });
    }
}

function layerIndex(file, layers) {
    const directories = file.split('/').slice(0, -1);
    // Match explicit project paths before matching individual directory names.
    const explicitLayer = layers.findIndex((layer) => layer.includes('/') && file.startsWith(`${layer}/`));
    return explicitLayer === -1
        ? layers.findIndex((layer) => directories.includes(layer))
        : explicitLayer;
}

async function findJsConfig(root) {
    for (const name of ['tsconfig.json', 'jsconfig.json']) {
        const fileName = join(root, name);
        if ((await stat(fileName).catch((error) => {
            if (error.code !== 'ENOENT') throw error;
        }))?.isFile()) {
            return { fileName };
        }
    }
}

export async function analyzeProject({ root = process.cwd(), paths = ['.'], onFile } = {}) {
    const requestedRoot = resolve(root);
    root = await realpath(requestedRoot);
    const { layers, debug } = await readConfig(root);
    const entries = paths.map((path) => {
        const entry = projectPath(requestedRoot, path);
        if (entry === null || projectPath(root, realpathSync(resolve(root, entry))) === null) {
            throw new Error(`source path is outside the project or excluded: ${path}`);
        }
        return entry || '.';
    });
    const tsConfig = await findJsConfig(root);
    const { output: { modules } } = await cruise(entries, {
        baseDir: root,
        exclude: excludedPath.source,
        tsConfig,
    }, {
        exportsFields: ['exports'],
        conditionNames: ['node', 'import', 'require', 'default'],
    });
    const sources = new Map();
    const canonicalPaths = new Map();
    for (const module of modules) {
        if (module.coreModule || module.couldNotResolve) continue;
        const source = projectPath(root, module.source);
        if (!source) continue;

        // The crawler can list a symlink under its apparent path during its directory scan.
        const canonical = projectPath(root, realpathSync(resolve(root, source)));
        if (!canonical) continue;
        canonicalPaths.set(source, canonical);
        if (canonical === source || !sources.has(canonical)) {
            sources.set(canonical, module.dependencies);
        }
    }

    const nodes = [...sources.keys()].sort();
    const layerByNode = new Map(nodes.map((node) => [node, layerIndex(node, layers)]));
    const edges = [];
    const violations = [];
    const unresolved = [];

    for (const from of nodes) {
        if (debug) onFile?.(from);
        const fromIndex = layerByNode.get(from);
        const targets = new Set();
        const missing = new Set();
        for (const dependency of sources.get(from)) {
            if (dependency.couldNotResolve) {
                missing.add(dependency.module);
            } else if (!dependency.coreModule) {
                const target = canonicalPaths.get(projectPath(root, dependency.resolved));
                if (target) targets.add(target);
            }
        }

        for (const to of [...targets].sort()) {
            const edge = { from, to };
            edges.push(edge);
            const toIndex = layerByNode.get(to);
            if (fromIndex !== -1 && fromIndex < toIndex) {
                violations.push({ ...edge, fromLayer: layers[fromIndex], toLayer: layers[toIndex] });
            }
        }
        for (const specifier of [...missing].sort()) {
            unresolved.push({ from, specifier });
        }
    }

    return { graph: { nodes, edges }, violations, unresolved };
}
