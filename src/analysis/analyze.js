import { createLayerRule } from './layers.js';

function importLocations(imports, lines) {
    const locations = new Map();
    const syntaxByTarget = new Map();
    for (const { target, specifier } of imports) {
        const line = lines.get(specifier);
        if (!syntaxByTarget.has(target)) syntaxByTarget.set(target, []);
        syntaxByTarget.get(target).push(specifier);
        const previous = locations.get(target);
        if (previous === undefined || (line !== undefined && line < previous)) {
            locations.set(target, line);
        }
    }
    return { locations, syntaxByTarget };
}

export async function analyzeSources(sources, layers, inspectSource, onFile, deferPolicy = false) {
    const nodes = [...sources.keys()].sort();
    const layerViolation = deferPolicy ? null : createLayerRule(layers, nodes);
    const files = [];
    const references = [];
    const edges = [];
    const violations = [];
    const unresolved = [];
    const errors = [];

    for (const from of nodes) {
        onFile?.(from);
        const { lines, diagnostics } = await inspectSource(from);
        if (deferPolicy && !diagnostics.length && /\.(?:[cm]?[jt]s|[jt]sx)$/.test(from)) files.push(from);
        for (const { line, message } of diagnostics) errors.push(`${from}:${line}: ${message}`);

        const source = sources.get(from);
        const { locations, syntaxByTarget } = importLocations(source.imports, lines);
        for (const to of [...locations.keys()].sort()) {
            const edge = { from, to };
            const line = locations.get(to);
            if (deferPolicy) {
                references.push({ ...edge, syntax: syntaxByTarget.get(to), unlocated: line === undefined, specifier: to, line });
            } else {
                edges.push(edge);
                const violation = layerViolation(from, to);
                if (violation) violations.push({ ...edge, ...violation, line });
            }
        }
        for (const specifier of [...source.unresolved].sort()) {
            unresolved.push({ from, specifier, line: lines.get(specifier) });
        }
    }
    return { graph: { nodes, edges }, violations, unresolved, errors, ...(deferPolicy && { files, references }) };
}
