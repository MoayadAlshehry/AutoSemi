import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

runTests({
    extensionDevelopmentPath: path.resolve(__dirname, '../..'),
    extensionTestsPath: path.resolve(__dirname, 'extension.test.js'),
    vscodeExecutablePath: process.env.AUTOSEMI_VSCODE_PATH,
    timeout: 120000,
    reuseMachineInstall: false,
    launchArgs: ['--disable-extensions', '--skip-welcome', '--skip-release-notes']
}).catch(error => { console.error(error); process.exitCode = 1; });
