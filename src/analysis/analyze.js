import { createLayerRule } from './layers.js';

function importLocations(imports, lines) {
    const locations = new Map();
    for (const { target, specifier } of imports) {
        const line = lines.get(specifier);
        const previous = locations.get(target);
        if (previous === undefined || (line !== undefined && line < previous)) {
            locations.set(target, line);
        }
    }
    return locations;
}

export async function analyzeSources(sources, layers, inspectSource, onFile) {
    const nodes = [...sources.keys()].sort();
    const layerViolation = createLayerRule(layers, nodes);
    const edges = [];
    const violations = [];
    const unresolved = [];
    const errors = [];

    for (const from of nodes) {
        onFile?.(from);
        const { lines, diagnostics } = await inspectSource(from);
        for (const { line, message } of diagnostics) errors.push(`${from}:${line}: ${message}`);

        const source = sources.get(from);
        const locations = importLocations(source.imports, lines);
        for (const to of [...locations.keys()].sort()) {
            const edge = { from, to };
            edges.push(edge);
            const violation = layerViolation(from, to);
            if (violation) violations.push({ ...edge, ...violation, line: locations.get(to) });
        }
        for (const specifier of [...source.unresolved].sort()) {
            unresolved.push({ from, specifier, line: lines.get(specifier) });
        }
    }
    return { graph: { nodes, edges }, violations, unresolved, errors };
}
