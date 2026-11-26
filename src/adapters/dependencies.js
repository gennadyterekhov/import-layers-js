import fs from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import { dirname, join } from 'node:path';
import enhancedResolve from 'enhanced-resolve';
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin';
import { canonicalSource, sourceExclusion } from './project.js';
import { inspectSource, sourceFile } from './source.js';

const extensions = ['.js', '.json', '.jsx', '.ts', '.tsx', '.cjs', '.mjs', '.cts', '.mts', '.d.ts'];

export async function listSources(root, { ignoreTests }) {
    const excluded = new RegExp(sourceExclusion(ignoreTests));
    const files = new Set();
    async function visit(directory) {
        for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
            const name = directory ? directory + '/' + entry.name : entry.name;
            if (excluded.test(name)) continue;
            if (entry.isDirectory()) {
                await visit(name);
            } else if (sourceFile.test(name) || name.endsWith('.json')) {
                if (entry.isFile()) {
                    files.add(name);
                } else if (entry.isSymbolicLink()) {
                    const canonical = canonicalSource(root, name, ignoreTests);
                    if (canonical && (await stat(join(root, canonical))).isFile()) files.add(canonical);
                }
            }
        }
    }
    await visit('');
    return files;
}

async function createResolver(root) {
    const plugins = [];
    for (const name of ['tsconfig.json', 'jsconfig.json']) {
        const configFile = join(root, name);
        const info = await stat(configFile).catch(error => {
            if (error.code !== 'ENOENT') throw error;
        });
        if (info?.isFile()) {
            plugins.push(new TsconfigPathsPlugin({ configFile, extensions, silent: true }));
            break;
        }
    }
    return enhancedResolve.ResolverFactory.createResolver({
        fileSystem: new enhancedResolve.CachedInputFileSystem(fs, 4000),
        useSyncFileSystemCalls: true,
        extensions,
        extensionAlias: {
            '.js': ['.js', '.ts', '.tsx', '.d.ts'],
            '.jsx': ['.jsx', '.ts', '.tsx', '.d.ts'],
            '.mjs': ['.mjs', '.mts', '.d.mts'],
            '.cjs': ['.cjs', '.cts', '.d.cts'],
        },
        conditionNames: ['node', 'import', 'require', 'default'],
        exportsFields: ['exports'],
        plugins,
    });
}

export async function loadDependencies(root, entries, { ignoreTests }, files, trees) {
    const resolver = await createResolver(root);
    const selected = entries.map(entry => canonicalSource(root, entry, ignoreTests));
    const pending = [...files].filter(file => sourceFile.test(file) && selected.some(entry =>
        entry === '' || file === entry || file.startsWith(entry + '/')));
    const sources = new Map();
    for (const from of pending) {
        if (sources.has(from)) continue;

        const { lines, specifiers } = inspectSource(trees[from]);
        const imports = [];
        const unresolved = new Set();
        sources.set(from, { imports, unresolved, lines });
        for (const specifier of specifiers.keys()) {
            if (isBuiltin(specifier) || /^(?:node|data|https?|bun):/.test(specifier)) continue;
            let resolved;
            try {
                resolved = resolver.resolveSync({}, dirname(join(root, from)), specifier);
            } catch {
                unresolved.add(specifier);
                continue;
            }
            if (!resolved) continue;
            const target = canonicalSource(root, resolved, ignoreTests);
            if (target && files.has(target)) {
                imports.push({ target, specifier });
                if (!sources.has(target)) pending.push(target);
            }
        }
    }
    return sources;
}
