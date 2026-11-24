import { spawn } from 'node:child_process';
import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function isExecutable(path) {
    try {
        accessSync(path, constants.X_OK);
        return statSync(path).isFile();
    } catch {
        return false;
    }
}

export async function checkGraph(project, result) {
    const checkout = fileURLToPath(new URL('../../../', import.meta.url));
    const directory = process.env.IMPORT_LAYERS_TOOLS;
    const installed = directory
        ? join(directory, 'degra')
        : (process.env.PATH ?? '').split(delimiter).map(path => join(path, 'degra')).find(isExecutable);
    const local = existsSync(join(checkout, 'degra', 'go.mod'));
    const command = installed ?? (local ? 'go' : 'degra');
    const args = installed || !local ? [] : ['-C', join(checkout, 'degra'), 'run', '.'];
    const child = spawn(command, [...args, '--project', local ? checkout : '']);
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    const payload = JSON.stringify({
        language: 'js',
        interpreter: process.execPath,
        root: project.root,
        layers: project.config.layers,
        files: result.files,
        references: result.references,
    });
    return new Promise((resolve, reject) => {
        child.on('error', reject);
        child.stdin.on('error', reject);
        child.on('close', code => {
            if (code !== 0) {
                reject(new Error(Buffer.concat(stderr).toString().trim() || `degra exited with status ${code}`));
                return;
            }
            try {
                resolve(JSON.parse(Buffer.concat(stdout).toString()));
            } catch (error) {
                reject(error);
            }
        });
        child.stdin.end(payload);
    });
}
