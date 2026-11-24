import { realpathSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { findConfig, readConfig } from './config.js';

const excludedPath = /(?:^|\/)(?:node_modules|\.git|\.yarn|\.nuxt|\.next|\.output)(?:\/|$)|^(?:\.\.|build|dist|coverage)(?:\/|$)/;
const testPath = /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[^/]+$/;

export function projectPath(root, path) {
    const relativePath = relative(root, resolve(root, path)).split(sep).join('/');
    return isAbsolute(relativePath) || excludedPath.test(relativePath) ? null : relativePath;
}

export function sourceExclusion(ignoreTests) {
    return ignoreTests ? `${excludedPath.source}|${testPath.source}` : excludedPath.source;
}

export function canonicalSource(root, path, ignoreTests = false) {
    const canonical = projectPath(root, realpathSync(resolve(root, path)));
    return ignoreTests && canonical !== null && testPath.test(canonical) ? null : canonical;
}

function sourceEntry(requestedRoot, root, path) {
    const entry = projectPath(requestedRoot, path);
    if (entry === null || canonicalSource(root, entry) === null) {
        throw new Error(`source path is outside the project or excluded: ${path}`);
    }
    return entry || '.';
}

export async function openProject({ root, paths, configPath }) {
    const requestedRoot = resolve(root);
    const canonicalRoot = await realpath(requestedRoot);
    const configFile = configPath ? resolve(requestedRoot, configPath) : await findConfig(canonicalRoot);
    const config = await readConfig(configFile ?? join(canonicalRoot, 'import_layers.json'));

    if (config.rootDir && !(await stat(resolve(canonicalRoot, config.rootDir))).isDirectory()) {
        throw new Error(`rootDir is not a directory: ${config.rootDir}`);
    }
    const selection = config.rootDir ? [config.rootDir] : paths;
    const entries = selection.map((path) => sourceEntry(requestedRoot, canonicalRoot, path));
    return { root: canonicalRoot, entries, config };
}
