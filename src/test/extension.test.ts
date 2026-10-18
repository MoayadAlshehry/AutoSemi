import * as assert from 'assert';
import * as vscode from 'vscode';
const wait = () => new Promise(resolve => setTimeout(resolve, 180));
const checks: { name: string; run: () => Promise<void> }[] = [];
const test = (name: string, run: () => Promise<void>) => checks.push({ name, run });
    async function setup() {
        await vscode.workspace.getConfiguration('autoSemi').update('enabled', true, vscode.ConfigurationTarget.Global);
        await vscode.extensions.getExtension('Moayad.AutoSemi')!.activate();
    }
    async function teardown() {
        await vscode.workspace.getConfiguration('autoSemi').update('enabled', undefined, vscode.ConfigurationTarget.Global);
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    }
    async function open(content: string) {
        const doc = await vscode.workspace.openTextDocument({ language: 'javascript', content });
        const editor = await vscode.window.showTextDocument(doc);
        editor.selection = new vscode.Selection(doc.positionAt(content.length), doc.positionAt(content.length));
        return editor;
    }
    test('Enter completes a statement', async () => {
        const editor = await open('const value = 1');
        await vscode.commands.executeCommand('type', { text: '\n' }); await wait();
        assert.strictEqual(editor.document.lineAt(0).text, 'const value = 1;');
    });
    test('semicolon precedes a trailing comment', async () => {
        const editor = await open('const value = 1 // note');
        await vscode.commands.executeCommand('type', { text: '\n' }); await wait();
        assert.strictEqual(editor.document.lineAt(0).text, 'const value = 1; // note');
    });
    test('bulk multiline insertion is unchanged', async () => {
        const editor = await open('');
        await editor.edit(edit => edit.insert(new vscode.Position(0, 0), 'const a = 1\nconst b = 2\n')); await wait();
        assert.ok(!editor.document.getText().includes(';'));
    });
    test('disabled configuration leaves Enter untouched', async () => {
        await vscode.workspace.getConfiguration('autoSemi').update('enabled', false, vscode.ConfigurationTarget.Global);
        const editor = await open('const value = 1');
        await vscode.commands.executeCommand('type', { text: '\n' }); await wait();
        assert.strictEqual(editor.document.lineAt(0).text, 'const value = 1');
    });
    test('typing after Enter cancels a stale edit', async () => {
        await vscode.workspace.getConfiguration('autoSemi').update('postEditDelay', 150, vscode.ConfigurationTarget.Global);
        const editor = await open('const value = 1');
        await vscode.commands.executeCommand('type', { text: '\n' });
        await vscode.commands.executeCommand('type', { text: 'x' }); await wait();
        assert.strictEqual(editor.document.lineAt(0).text, 'const value = 1');
        await vscode.workspace.getConfiguration('autoSemi').update('postEditDelay', undefined, vscode.ConfigurationTarget.Global);
    });
    test('undo and redo do not schedule insertion', async () => {
        const editor = await open('const value = 1');
        await vscode.commands.executeCommand('type', { text: '\n' }); await wait();
        await vscode.commands.executeCommand('undo'); await wait();
        const undone = editor.document.getText();
        await wait(); assert.strictEqual(editor.document.getText(), undone);
        await vscode.commands.executeCommand('redo'); await wait();
        assert.ok(!editor.document.getText().includes(';;'));
    });
export async function run(): Promise<void> {
    for (const check of checks) {
        try {
            await setup();
            await check.run();
            console.log('PASS: ' + check.name);
        } finally { await teardown(); }
    }
    console.log(checks.length + ' editor integration checks passed.');
}
