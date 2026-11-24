# import-layers-js

Checks the direction of imports between layers. It uses dependency-cruiser to find and resolve imports.

## Use from another project

Requires Node.js 20 (20.12 or newer), 22, or 24+.

```sh
npm install --save-dev --install-links /path/to/import-layers-js
```

Create `import_layers.json`, `import_layers.yaml`, or `import_layers.yml` in the project root. The CLI searches upward from the current directory and prefers JSON when multiple configs exist in the same directory.

```json
{
  "layers": ["high", "low"],
  "debug": false,
  "ignoreTests": false
}
```

The order matches the PHP version. A file in `high` cannot directly import a file in `low`. The reverse direction and imports within the same layer are allowed.

A single name matches a complete directory segment anywhere in the project. Use a root-relative directory path such as `packages/core` to scope a layer. Root-relative paths take precedence over single directory names. If several entries of one kind match, the first matching entry wins. Files outside the configured layers are included in the graph.

Run from the project root.

```sh
npx import-layers-js
npx import-layers-js src packages
npx import-layers-js -c config/layers.yml --graph src
```

Without path arguments, the CLI starts from all scannable files under the project root, including files with no imports. Positional paths and `-c` (or `--config`) are relative to the current directory. Optional `rootDir` selects a directory relative to the project root and takes precedence over positional paths. Imports can still lead to other files inside the project.

Set `ignoreTests` to `true` to skip `*.test.*`, `*.spec.*`, and files in `test`, `tests`, and `__tests__` directories. `ignore_tests` is accepted as a fallback. The scan also skips dependency directories and common generated output such as `.nuxt`, `.next`, and top-level `dist` and `build`.

The CLI prints `OK` on success. Layer violations, unresolved imports, and JavaScript or TypeScript syntax errors go to stderr. Exit codes are `0` for success, `1` for layer violations, and `2` for invalid arguments, invalid configuration, or analysis errors. Line numbers are included for imports in JavaScript and TypeScript source. `debug: true` logs each checked file to stdout, or to stderr when `--graph` is used.

`--graph` writes the internal dependency graph as JSON to stdout in place of `OK`. Diagnostics and exit codes still apply.

The analyzer handles ES imports, re-exports, CommonJS `require()`, and dynamic `import()` with statically known targets. It uses the root `tsconfig.json` or `jsconfig.json`, in that order, to resolve aliases. Node.js `import` and `require` package export conditions are enabled in the same resolution pass, so dual-mode packages can resolve differently at runtime. Runtime-computed imports and virtual modules created by bundler plugins can leave gaps in the graph.

## JavaScript API

```js
import { analyzeProject } from 'import-layers-js';

const { graph, violations, unresolved, errors } = await analyzeProject({
    root: '/path/to/project',
    paths: ['src'],
});
```

`root` defaults to the current working directory and `paths` defaults to the whole project. Supply `configPath` to select another config relative to `root`. `errors` lists syntax diagnostics.

The graph contains a `nodes` array of project-relative file paths and an `edges` array of `{ "from": "...", "to": "..." }` objects. It omits installed third-party packages, Node.js built-ins, and files outside the project. Installed workspace links that resolve to files inside the project are included.

## Development

Run `npm ci` and `npm test` from this package directory.

## See also

- [import-layers-go](https://github.com/gennadyterekhov/import-layers-go)
- [import-layers-php](https://github.com/gennadyterekhov/import-layers-php)
- [import-layers-py](https://github.com/gennadyterekhov/import-layers-py)
