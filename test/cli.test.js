import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { analyzeProject } from '../src/index.js';

const cli = fileURLToPath(new URL('../bin/import-layers-js.js', import.meta.url));

async function makeProject(t, files) {
    const root = await mkdtemp(join(tmpdir(), 'import-layers-js-'));
    t.after(() => rm(root, { recursive: true, force: true }));

    for (const [path, source] of Object.entries(files)) {
        const file = join(root, path);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, source);
    }

    return root;
}

function run(cwd, ...args) {
    return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

test('reports only direct layer violations and keeps the graph available through the API', async (t) => {
    const root = await makeProject(t, {
        'package.json': '{"type":"module","dependencies":{"external-lib":"1.0.0"}}',
        'import_layers.json': '{"layers":["high","low"]}',
        'src/high/index.js': [
            'export { example } from "../low/example.js";',
            'import "external-lib";',
            'import "node:fs";',
            'import("./dynamic.js");',
        ].join('\n'),
        'src/high/dynamic.js': 'export default 42;',
        'src/high/unused.js': 'export default true;',
        'src/low/example.js': 'export const example = 42;',
        'src/low/cjs.cjs': 'require("../high/dynamic.js");',
        'node_modules/external-lib/package.json': '{"main":"index.js"}',
        'node_modules/external-lib/index.js': 'exports.example = 42;',
    });

    const result = run(root, '--format', 'json');
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    const { graph } = await analyzeProject({ root });
    assert.deepEqual(graph, {
        nodes: [
            'src/high/dynamic.js', 'src/high/index.js', 'src/high/unused.js',
            'src/low/cjs.cjs', 'src/low/example.js',
        ],
        edges: [
            { from: 'src/high/index.js', to: 'src/high/dynamic.js' },
            { from: 'src/high/index.js', to: 'src/low/example.js' },
            { from: 'src/low/cjs.cjs', to: 'src/high/dynamic.js' },
        ],
    });
    assert.match(result.stderr, /src\/high\/index\.js.*src\/low\/example\.js.*cannot import package from lower layer/);
    assert.doesNotMatch(result.stderr, /external-lib|node:fs/);
});

test('resolves workspace package exports and uses root-relative layer paths', async (t) => {
    const root = await makeProject(t, {
        'package.json': '{"private":true,"workspaces":["packages/*"]}',
        'import_layers.json': '{"layers":["packages/high","packages/low"]}',
        'packages/high/package.json': '{"name":"@fixture/high","type":"module"}',
        'packages/high/index.js': 'import "@fixture/low/service";',
        'packages/low/package.json': '{"name":"@fixture/low","exports":{"./service":{"import":"./src/service.mjs"}}}',
        'packages/low/src/service.mjs': 'export default 42;',
    });
    const scope = join(root, 'node_modules', '@fixture');
    await mkdir(scope, { recursive: true });
    await symlink(join(root, 'packages', 'low'), join(scope, 'low'), 'junction');

    const result = run(root, 'packages/high');
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /packages\/high\/index\.js -> packages\/low\/src\/service\.mjs/);
});

test('reports unresolved imports without printing OK', async (t) => {
    const root = await makeProject(t, {
        'import_layers.json': '{"layers":["high","low"]}',
        'src/highish/index.js': 'import "../low/example.js"; import "./missing.js";',
        'src/low/example.js': 'export default 42;',
    });

    const result = run(root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /src\/highish\/index\.js.*unresolved import.*\.\/missing\.js/);
});

test('prints only OK on success with debug disabled', async (t) => {
    const root = await makeProject(t, {
        'import_layers.json': '{"layers":["high","low"],"debug":false}',
        'src/low/index.js': 'import "../high/example.js";',
        'src/high/example.js': 'export default 42;',
    });

    const result = run(root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'OK\n');
    assert.equal(result.stderr, '');
});

test('prints the paths of checked files with debug enabled', async (t) => {
    const root = await makeProject(t, {
        'import_layers.json': '{"layers":["high","low"],"debug":true}',
        'src/low/index.js': 'import "../high/example.js";',
        'src/high/example.js': 'export default 42;',
        'src/high/unused.js': 'export default true;',
    });

    const result = run(root, 'src/low/index.js');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'src/high/example.js\nsrc/low/index.js\nOK\n');
    assert.equal(result.stderr, '');
});

test('fails for a missing or invalid PHP-style configuration', async (t) => {
    const root = await makeProject(t, {});
    const missing = run(root);
    assert.equal(missing.status, 2);
    assert.equal(missing.stdout, '');
    assert.match(missing.stderr, /import_layers\.json/);

    await writeFile(join(root, 'import_layers.json'), '{"layers":["high","high"]}');
    const invalid = run(root);
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /layers.*unique/);

    await writeFile(join(root, 'import_layers.json'), '{"layers":["high","low"],"debug":"true"}');
    const invalidDebug = run(root);
    assert.equal(invalidDebug.status, 2);
    assert.match(invalidDebug.stderr, /debug must be a boolean/);
});

test('resolves a JavaScript alias before applying the layer rule', async (t) => {
    const root = await makeProject(t, {
        'import_layers.json': '{"layers":["high","low"]}',
        'jsconfig.json': '{"compilerOptions":{"baseUrl":".","paths":{"@low/*":["src/low/*"]}}}',
        'src/high/index.js': 'import "@low/service";',
        'src/low/service.js': 'export default 42;',
    });

    const result = run(root);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /src\/high\/index\.js -> src\/low\/service\.js/);
});

test('excludes symlinked directories outside the project from the graph', async (t) => {
    const root = await makeProject(t, {
        'import_layers.json': '{"layers":["high","low"]}',
        'src/high/index.js': 'import "../vendor/service.js";',
    });
    const external = await makeProject(t, { 'service.js': 'export default 42;' });
    await symlink(external, join(root, 'src', 'vendor'), 'junction');

    const { graph } = await analyzeProject({ root });
    assert.deepEqual(graph, {
        nodes: ['src/high/index.js'],
        edges: [],
    });
});
