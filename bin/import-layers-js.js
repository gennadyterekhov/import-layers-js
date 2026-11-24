#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { analyzeProject } from '../src/index.js';

function printTextGraph({ nodes, edges }) {
    const targets = new Map(nodes.map((node) => [node, []]));
    for (const { from, to } of edges) targets.get(from).push(to);

    for (const [node, dependencies] of targets) {
        console.log(node);
        for (const dependency of dependencies) console.log(`  -> ${dependency}`);
    }
}

async function main() {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: {
            // Accept the former graph format flag for existing CLI invocations.
            format: { type: 'string', default: 'text' },
            help: { type: 'boolean', short: 'h' },
        },
    });

    if (values.help) {
        console.log('Usage: import-layers-js [path ...]');
        console.log('Run from the directory containing import_layers.json. Paths default to the project root.');
        return;
    }
    if (!['text', 'json'].includes(values.format)) {
        throw new Error('--format must be text or json');
    }

    const { violations, unresolved } = await analyzeProject({
        paths: positionals.length ? positionals : ['.'],
        onFile: (file) => console.log(file),
    });

    for (const { from, to, fromLayer, toLayer } of violations) {
        console.error(`${from} -> ${to}: cannot import package from lower layer (${fromLayer} -> ${toLayer})`);
    }
    for (const { from, specifier } of unresolved) {
        console.error(`${from}: unresolved import ${JSON.stringify(specifier)}`);
    }
    if (!violations.length && !unresolved.length) console.log('OK');
    if (violations.length) process.exitCode = 1;
}

try {
    await main();
} catch (error) {
    console.error(`import-layers-js: ${error.message}`);
    process.exitCode = 2;
}
