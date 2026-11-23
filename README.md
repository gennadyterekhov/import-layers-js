# import-layers-js

Checks the direction of imports between layers and prints the project's internal dependency graph. It uses dependency-cruiser to find and resolve imports.

## Use from another project

Requires Node.js 20 (20.12 or newer), 22, or 24+.

```sh
npm install --save-dev --install-links /path/to/import-layers-js
```

Create `import_layers.json` in the project root.

```json
{
  "layers": ["high", "low"]
}
```

The order matches the PHP version. A file in `high` cannot directly import a file in `low`. The reverse direction and imports within the same layer are allowed.

A single name matches a complete directory segment anywhere in the project. Use a root-relative directory path such as `packages/core` to scope a layer. Root-relative paths take precedence over single directory names. If several entries of one kind match, the first matching entry wins. Files outside the configured layers are included in the graph.

Run from the project root.

```sh
npx import-layers-js
npx import-layers-js --format json > graph.json
npx import-layers-js --format json src packages
```

Without path arguments, the CLI starts from all scannable files under the project root, including files with no imports. Path arguments select the starting files or directories. Imports can still lead to other files inside the project.

The default text output lists each file and its direct dependencies. JSON contains a `nodes` array of project-relative file paths and an `edges` array of `{ "from": "...", "to": "..." }` objects. Both formats go to stdout. The graph omits installed third-party packages, Node.js built-ins, and files outside the project. Installed workspace links that resolve to files inside the project are included.

Layer violations and unresolved import warnings go to stderr. Exit codes are `0` when there are no layer violations, `1` when a layer violation is found, and `2` when the command or analysis fails.

The analyzer handles ES imports, re-exports, CommonJS `require()`, and dynamic `import()` with statically known targets. It uses the root `tsconfig.json` or `jsconfig.json`, in that order, to resolve aliases. Node.js `import` and `require` package export conditions are enabled in the same resolution pass, so dual-mode packages can resolve differently at runtime. Runtime-computed imports and virtual modules created by bundler plugins can leave gaps in the graph.

## JavaScript API

```js
import { analyzeProject } from 'import-layers-js';

const { graph, violations, unresolved } = await analyzeProject({
    root: '/path/to/project',
    paths: ['src'],
});
```

`root` defaults to the current working directory and `paths` defaults to the whole project.

## Development

Run `npm ci` and `npm test` from this package directory.

## See also

- [import-layers-go](https://github.com/gennadyterekhov/import-layers-go)
- [import-layers-php](https://github.com/gennadyterekhov/import-layers-php)
