import * as vscode from 'vscode';
import { insertionColumn } from './semicolon';

interface PendingEdit { timer: ReturnType<typeof setTimeout>; line: number; version: number; text: string; }

export function activate(context: vscode.ExtensionContext) {
    const pending = new Map<string, PendingEdit>();
    const cancel = (key: string) => {
        const item = pending.get(key);
        if (item) { clearTimeout(item.timer); pending.delete(key); }
    };
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
        const key = event.document.uri.toString(), item = pending.get(key);
        // Preserve a candidate for the editor's follow-up indentation only.
        if (item && !event.reason && event.contentChanges.length > 0 &&
            event.contentChanges.every(ch => ch.rangeLength === 0 && ch.range.start.line === item.line + 1 && /^[\t ]+$/.test(ch.text))) {
            item.version = event.document.version; return;
        }
        cancel(key);
        if (event.reason || event.contentChanges.length !== 1) { return; }
        const change = event.contentChanges[0];
        if (change.rangeLength !== 0 || !/^\r?\n[\t ]*$/.test(change.text)) { return; }
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== event.document) { return; }
        const cfg = vscode.workspace.getConfiguration('autoSemi', event.document.uri);
        const language = event.document.languageId;
        const flags: Record<string, string> = { javascript: 'Javascript', typescript: 'Typescript', java: 'Java', csharp: 'Csharp', cpp: 'Cpp' };
        const enabled = (settings: vscode.WorkspaceConfiguration) => settings.get('enabled', true) && flags[language] &&
            settings.get<string[]>('languages', ['javascript', 'typescript', 'java']).includes(language) &&
            settings.get('enableFor' + flags[language], ['javascript', 'typescript', 'java'].includes(language));
        if (!enabled(cfg)) { return; }
        const line = change.range.start.line;
        const candidate: PendingEdit = {
            line, version: event.document.version, text: event.document.lineAt(line).text,
            timer: setTimeout(() => { void apply(); }, Math.max(0, Math.min(500,
                Math.max(cfg.get<number>('debounceDelay', 50), cfg.get<number>('postEditDelay', 50)))))
        };
        pending.set(key, candidate);
        async function apply() {
            if (pending.get(key) !== candidate) { return; }
            pending.delete(key);
            const document = event.document;
            if (document.isClosed || document.version !== candidate.version ||
                vscode.window.activeTextEditor !== editor || document.lineAt(line).text !== candidate.text) { return; }
            const current = vscode.workspace.getConfiguration('autoSemi', document.uri);
            if (!enabled(current)) { return; }
            const column = insertionColumn(document.getText(), line, language, {
                skipComments: current.get('skipComments', true), skipStrings: current.get('skipStrings', true)
            });
            if (column === null) { return; }
            await editor!.edit(builder => builder.insert(new vscode.Position(line, column), ';'),
                { undoStopBefore: false, undoStopAfter: false });
        }
    }));
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => cancel(doc.uri.toString())));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('autoSemi')) { for (const key of pending.keys()) { cancel(key); } }
    }));
    context.subscriptions.push({ dispose() { for (const key of pending.keys()) { cancel(key); } } });
}
export function deactivate() {}
