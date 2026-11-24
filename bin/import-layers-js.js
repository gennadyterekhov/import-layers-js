#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { findConfig } from '../src/adapters/config.js';
import { analyzeProject } from '../src/index.js';

function sourceLocation(file, line) {
    return line === undefined ? file : `${file}:${line}`;
}

function reportResult({ graph, violations, unresolved, errors }, showGraph) {
    for (const error of errors) console.error(error);
    for (const { from, to, fromLayer, toLayer, line } of violations) {
        console.error(`${sourceLocation(from, line)} -> ${to}: cannot import package from lower layer (${fromLayer} -> ${toLayer})`);
    }
    for (const { from, specifier, line } of unresolved) {
        console.error(`${sourceLocation(from, line)}: unresolved import ${JSON.stringify(specifier)}`);
    }

    if (showGraph) console.log(JSON.stringify(graph, null, 2));
    if (errors.length || unresolved.length) return 2;
    if (violations.length) return 1;
    if (!showGraph) console.log('OK');
    return 0;
}

async function main() {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: {
            // Accept the former graph format flag for existing CLI invocations.
            format: { type: 'string', default: 'text' },
            config: { type: 'string', short: 'c' },
            graph: { type: 'boolean' },
            help: { type: 'boolean', short: 'h' },
        },
    });

    if (values.help) {
        console.log('Usage: import-layers-js [-c|--config PATH] [--graph] [path ...]');
        console.log('Paths default to the project root. Use --graph to emit the internal dependency graph as JSON.');
        return 0;
    }
    if (!['text', 'json'].includes(values.format)) {
        throw new Error('--format must be text or json');
    }

    if (values.config === '') throw new Error('--config requires a file path');
    const cwd = process.cwd();
    const defaultConfig = await findConfig(cwd, { searchParents: true });
    const root = defaultConfig ? dirname(defaultConfig) : cwd;
    const configPath = values.config ? resolve(cwd, values.config) : defaultConfig;
    const printDebug = values.graph ? console.error : console.log;
    const result = await analyzeProject({
        root,
        configPath,
        paths: positionals.length ? positionals.map((path) => resolve(cwd, path)) : ['.'],
        onFile: (file) => printDebug(`processing file ${file}`),
    });

    return reportResult(result, values.graph);
}

try {
    process.exitCode = await main();
} catch (error) {
    console.error(`import-layers-js: ${error.message}`);
    process.exitCode = 2;
}
