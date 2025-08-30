import * as vscode from 'vscode';

interface AutoSemiConfig {
    enabled: boolean;
    languages: string[];
    skipComments: boolean;
    skipStrings: boolean;
    debounceDelay: number;   // debounce for rapid changes
    postEditDelay: number;   // wait for other edits (indent/format) before inserting ;
    enableForJavascript: boolean;
    enableForTypescript: boolean;
    enableForJava: boolean;
    enableForCsharp: boolean;
    enableForCpp: boolean;
}

let cachedConfig: AutoSemiConfig | null = null;

function getConfiguration(): AutoSemiConfig {
    if (cachedConfig) return cachedConfig;
    const cfg = vscode.workspace.getConfiguration('autoSemi');
    cachedConfig = {
        enabled: cfg.get<boolean>('enabled', true),
        languages: cfg.get<string[]>('languages', ['javascript', 'typescript', 'java']),
        skipComments: cfg.get<boolean>('skipComments', true),
        skipStrings: cfg.get<boolean>('skipStrings', true),
        debounceDelay: cfg.get<number>('debounceDelay', 50),
        postEditDelay: cfg.get<number>('postEditDelay', 50),
        enableForJavascript: cfg.get<boolean>('enableForJavascript', true),
        enableForTypescript: cfg.get<boolean>('enableForTypescript', true),
        enableForJava: cfg.get<boolean>('enableForJava', true),
        enableForCsharp: cfg.get<boolean>('enableForCsharp', false),
        enableForCpp: cfg.get<boolean>('enableForCpp', false),
    };
    return cachedConfig;
}

export function activate(context: vscode.ExtensionContext) {
    let lastTrigger = 0;

    const disposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
        const config = getConfiguration();
        if (!config.enabled) return;

        const now = Date.now();
        if (now - lastTrigger < config.debounceDelay) return;
        lastTrigger = now;

        // handle any change that INSERTS a newline (covers "\n", "\r\n", "\n\t", "\n    ", etc.)
        const newlineChanges = event.contentChanges.filter(ch => ch.text.includes('\n'));
        if (newlineChanges.length === 0) return;

        for (const ch of newlineChanges) {
            const prevLineIndex = ch.range.start.line;
            if (prevLineIndex < 0) continue;

            // run after other auto-edits (indent, LSP, format) to avoid races inside classes/methods
            setTimeout(async () => {
                const editor: vscode.TextEditor | undefined =
                    vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === event.document.uri.toString())
                    ?? (vscode.window.activeTextEditor?.document.uri.toString() === event.document.uri.toString()
                        ? vscode.window.activeTextEditor
                        : undefined);

                if (!editor) return;

                // Recompute line safely (document may have changed)
                const lineCount = editor.document.lineCount;
                const lineIndex = Math.min(prevLineIndex, Math.max(0, lineCount - 1));
                const line = editor.document.lineAt(lineIndex);

                // Check context at END of the previous line
                const contextPos = line.range.end;
                if (isInSpecialContext(editor.document, contextPos, config)) return;

                // Language gated
                if (!isLanguageEnabled(editor.document.languageId, config)) return;

                // Strip comments if requested
                let lineText = line.text;
                if (config.skipComments) {
                    lineText = removeComments(lineText, editor.document.languageId);
                }

                const trimmed = lineText.trim();
                if (trimmed.length === 0) return;
                if (trimmed.endsWith(';')) return; // already has semicolon

                // Slice of text up to this line (heuristics may use it)
                const fullText = editor.document.getText(new vscode.Range(new vscode.Position(0, 0), line.range.end));

                const should = await shouldInsertSemicolon(trimmed, editor.document.languageId, fullText);
                if (!should) return;

                // re-check just before inserting (other edits may have added ;)
                const latestLine = editor.document.lineAt(Math.min(lineIndex, editor.document.lineCount - 1));
                if (latestLine.text.trim().endsWith(';')) return;

                await editor.edit(editBuilder => {
                    editBuilder.insert(latestLine.range.end, ';');
                }, { undoStopBefore: false, undoStopAfter: false });
            }, getConfiguration().postEditDelay);
        }
    });

    context.subscriptions.push(disposable);

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('autoSemi')) cachedConfig = null;
        })
    );
}

function isLanguageEnabled(languageId: string, cfg: AutoSemiConfig): boolean {
    if (!cfg.languages.includes(languageId)) return false;
    switch (languageId) {
        case 'javascript': return cfg.enableForJavascript;
        case 'typescript': return cfg.enableForTypescript;
        case 'java': return cfg.enableForJava;
        case 'csharp': return cfg.enableForCsharp;
        case 'cpp': return cfg.enableForCpp;
        default: return false;
    }
}

/* ---------------- Context detection ---------------- */

function isInSpecialContext(document: vscode.TextDocument, position: vscode.Position, cfg: AutoSemiConfig): boolean {
    if (!cfg.skipComments && !cfg.skipStrings) return false;

    const text = document.getText();
    const offset = document.offsetAt(position);

    if (cfg.skipStrings && isOffsetInsideString(text, offset)) return true;

    if (cfg.skipComments) {
        // Line comment?
        const lineText = document.lineAt(position.line).text;
        const slashSlash = lineText.indexOf('//');
        if (slashSlash !== -1 && slashSlash < position.character) return true;

        // Block comment open without close before offset?
        const upTo = text.substring(0, offset);
        const lastOpen = upTo.lastIndexOf('/*');
        if (lastOpen !== -1) {
            const lastClose = upTo.lastIndexOf('*/');
            if (lastClose < lastOpen) return true;
        }
    }
    return false;
}

function isOffsetInsideString(text: string, offset: number): boolean {
    let inSingle = false, inDouble = false, inTemplate = false;
    for (let i = 0; i < offset; i++) {
        const ch = text[i];
        if (ch === '\\') { i++; continue; } // skip escaped char
        if (!inDouble && !inTemplate && ch === '\'') { inSingle = !inSingle; continue; }
        if (!inSingle && !inTemplate && ch === '"') { inDouble = !inDouble; continue; }
        if (!inSingle && !inDouble && ch === '`') { inTemplate = !inTemplate; continue; }
    }
    return inSingle || inDouble || inTemplate;
}

function removeComments(lineText: string, languageId: string): string {
    if (languageId === 'javascript' || languageId === 'typescript' || languageId === 'java' || languageId === 'c') {
        return lineText.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
    }
    return lineText;
}

/* ---------------- Semicolon heuristics ---------------- */

async function shouldInsertSemicolon(trimmedLine: string, languageId: string, _fullText: string): Promise<boolean> {
    if (trimmedLine.endsWith(';')) return false;

    switch (languageId) {
        case 'javascript':
        case 'typescript': return shouldInsertSemicolonForJS(trimmedLine);
        case 'java':       return shouldInsertSemicolonForJava(trimmedLine);
        case 'csharp':     return shouldInsertSemicolonForCSharp(trimmedLine);
        case 'cpp':        return shouldInsertSemicolonForCpp(trimmedLine);
        default:           return false;
    }
}

function shouldInsertSemicolonForJS(lineText: string): boolean {
    const noSemi = [
        /^(\s*)(if|for|while|switch|try|catch|finally|function|class|interface|enum|export|import)\b/,
        /\{\s*$/,
        /\}\s*$/,
        /\([^)]*$/,
        /\[[^\]]*$/,
        /`[^`]*$/,
        /\/\/.*$/,
        /\/\*.*$/,
    ];
    if (noSemi.some(r => r.test(lineText))) return false;

    const yes = [
        /^\s*(return|throw|break|continue|yield|debugger)\b/,
        /^\s*(const|let|var)\s+\w+/,
        /^\s*\w+\([^)]*\)\s*$/,
        /^\s*[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*\s*$/,
        /=\s*[^=]/, // assignment (not '==')
    ];
    return yes.some(r => r.test(lineText));
}

function shouldInsertSemicolonForJava(lineText: string): boolean {
    const t = lineText.trim();

    // Don't add after these endings or empty
    if (t.length === 0 || /[{};,]\s*$/.test(t)) return false;

    // Annotations
    if (/^\s*@/.test(t)) return false;

    // Block/control starters
    if (/^\s*(class|interface|enum|if|for|while|switch|synchronized|try|catch|else|finally|do)\b/.test(t)) return false;

    // Unbalanced parens on this line -> incomplete
    const open = (t.match(/\(/g) || []).length;
    const close = (t.match(/\)/g) || []).length;
    if (open > close) return false;

    // With balanced parens: declaration vs call
    if (t.includes('(') && t.includes(')')) {
        const declLike = /^\s*(public|protected|private|static|final|abstract|synchronized|native|strictfp|void|int|long|short|byte|char|boolean|float|double|[A-Za-z_][\w<>,\s\[\]]*\s+)\b/;
        if (declLike.test(t)) return false;   // method/ctor/field decl
        return true;                          // call/expression -> needs ;
    }

    // Typical statements
    if (/=\s*[^=]/.test(t)) return true; // assignment
    if (/^\s*(return|throw|break|continue)\b/.test(t)) return true;
    if (/^\s*(int|long|double|float|boolean|char|byte|short|String|var)\s+\w+/.test(t)) return true;
    if (/^\s*[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)*\s*$/.test(t)) return true; // bare identifier/property chain

    // default conservative: add
    return true;
}

function shouldInsertSemicolonForCSharp(lineText: string): boolean {
    const no = [
        /^(\s*)(if|else|for|while|switch|try|catch|finally|class|interface|enum|public|private|protected|namespace|using)\b/,
        /\{\s*$/,
        /\}\s*$/,
        /\([^)]*$/,
        /\[[^\]]*$/,
    ];
    if (no.some(r => r.test(lineText))) return false;

    const yes = [
        /^\s*(return|break|continue|throw)\b/,
        /=\s*[^=]/,
        /^\s*\w+\([^)]*\)\s*$/,
        /^\s*[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)*\s*$/,
    ];
    return yes.some(r => r.test(lineText));
}

function shouldInsertSemicolonForCpp(lineText: string): boolean {
    const no = [
        /^(\s*)(if|else|for|while|switch|try|catch|class|struct|enum|namespace|using|#include|#define)\b/,
        /\{\s*$/,
        /\}\s*$/,
        /\([^)]*$/,
        /\[[^\]]*$/,
    ];
    if (no.some(r => r.test(lineText))) return false;

    const yes = [
        /^\s*(return|break|continue|throw)\b/,
        /=\s*[^=]/,
        /^\s*\w+\([^)]*\)\s*$/,
        /^\s*[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)*\s*$/,
    ];
    return yes.some(r => r.test(lineText));
}

export function deactivate() {}
