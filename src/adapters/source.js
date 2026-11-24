import { readFile } from 'node:fs/promises';
import ts from 'typescript';

function importSpecifier(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node.moduleSpecifier;
    if (ts.isExternalModuleReference(node)) return node.expression;
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) return node.argument.literal;
    if (ts.isCallExpression(node)) {
        const { expression } = node;
        if (expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(expression) && expression.text === 'require')) {
            return node.arguments[0];
        }
    }
}

export async function inspectSource(path) {
    const lines = new Map();
    if (!/\.(?:[cm]?[jt]s|[jt]sx)$/.test(path)) return { lines, diagnostics: [] };

    const file = ts.createSourceFile(path, await readFile(path, 'utf8'), ts.ScriptTarget.Latest);
    const diagnostics = file.parseDiagnostics.map(({ start, messageText }) => ({
        line: file.getLineAndCharacterOfPosition(start ?? 0).line + 1,
        message: ts.flattenDiagnosticMessageText(messageText, ' '),
    }));

    function visit(node) {
        const specifier = importSpecifier(node);
        if (specifier && ts.isStringLiteralLike(specifier) && !lines.has(specifier.text)) {
            lines.set(specifier.text, file.getLineAndCharacterOfPosition(specifier.getStart(file)).line + 1);
        }
        ts.forEachChild(node, visit);
    }
    visit(file);
    return { lines, diagnostics };
}
