import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { parse } from 'yaml';

export async function findConfig(directory, { searchParents = false } = {}) {
    for (;;) {
        for (const name of ['import_layers.json', 'import_layers.yaml', 'import_layers.yml']) {
            const path = join(directory, name);
            const info = await stat(path).catch((error) => {
                if (error.code !== 'ENOENT') throw error;
            });
            if (info?.isFile()) return path;
        }
        const parent = dirname(directory);
        if (!searchParents || parent === directory) return undefined;
        directory = parent;
    }
}

export async function readConfig(path) {
    try {
        const text = await readFile(path, 'utf8');
        const extension = extname(path).toLowerCase();
        const data = ['.yaml', '.yml'].includes(extension) ? parse(text) : JSON.parse(text);
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error('expected a configuration object');
        }
        const { layers, debug = false, rootDir = '' } = data;
        const { ignore_tests: legacyIgnoreTests = false, ignoreTests = legacyIgnoreTests } = data;
        if (!Array.isArray(layers) || !layers.length ||
            layers.some((layer) => typeof layer !== 'string' || !layer.trim()) ||
            new Set(layers).size !== layers.length) {
            throw new Error('layers must be a non-empty array of unique directory names or paths');
        }
        if (typeof debug !== 'boolean') throw new Error('debug must be a boolean');
        if (typeof rootDir !== 'string') throw new Error('rootDir must be a directory path');
        if (typeof ignoreTests !== 'boolean') throw new Error('ignoreTests must be a boolean');
        return { layers, debug, rootDir, ignoreTests };
    } catch (error) {
        throw new Error(`${path}: ${error.message}`, { cause: error });
    }
}
