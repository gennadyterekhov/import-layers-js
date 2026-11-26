import ts from 'typescript';

export const sourceFile = /\.(?:[cm]?[jt]s|[jt]sx)$/;

function importSpecifier(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node.moduleSpecifier;
    if (ts.isExternalModuleReference(node)) return node.expression;
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) return node.argument.literal;
    if (ts.isCallExpression(node)) {
        const { expression } = node;
        if (expression?.kind === ts.SyntaxKind.ImportKeyword ||
            (expression && ts.isIdentifier(expression) && expression.escapedText === 'require')) {
            return node.arguments[0];
        }
    }
}

export function inspectSource(tree) {
    const lines = new Map();
    const specifiers = new Set();
    if (!tree) return { lines, specifiers };

    const lineStarts = ts.computeLineStarts(tree.text);
    function add(specifier, position, located = true) {
        specifiers.add(specifier);
        if (located && !lines.has(specifier)) {
            const { line } = ts.computeLineAndCharacterOfPosition(lineStarts, position);
            lines.set(specifier, line + 1);
        }
    }
    function visit(node) {
        const specifier = importSpecifier(node);
        if (specifier && ts.isStringLiteralLike(specifier)) {
            add(specifier.text, ts.skipTrivia(tree.text, specifier.pos));
        } else if (ts.isCallExpression(node)) {
            const { expression, arguments: args } = node;
            if (expression && ts.isIdentifier(expression) && ['define', 'require'].includes(expression.escapedText)) {
                const dependencies = args.find(ts.isArrayLiteralExpression);
                for (const item of dependencies?.elements ?? []) {
                    if (ts.isStringLiteralLike(item) && !['require', 'exports', 'module'].includes(item.text)) {
                        add(item.text, item.pos, false);
                    }
                }
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(tree);
    for (const reference of tree.referencedFiles ?? []) {
        const name = reference.fileName;
        add(name.startsWith('.') || name.startsWith('/') ? name : './' + name, reference.pos, false);
    }
    return { lines, specifiers };
}
