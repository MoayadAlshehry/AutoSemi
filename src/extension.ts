import * as vscode from 'vscode';
import * as babelParser from '@babel/parser';

// Cache parsers for better performance
let jsParser: typeof babelParser;
let javaParser: any;

// Configuration interface
interface AutoSemiConfig {
    enabled: boolean;
    languages: string[];
    skipComments: boolean;
    skipStrings: boolean;
    debounceDelay: number;
    enableForJavascript: boolean;
    enableForTypescript: boolean;
    enableForJava: boolean;
    enableForCsharp: boolean;
    enableForCpp: boolean;
}

export function activate(context: vscode.ExtensionContext) {
    let lastTrigger = 0;
    
    const disposable = vscode.workspace.onDidChangeTextDocument(async event => {
        const config = getConfiguration();
        if (!config.enabled) return;
        
        const now = Date.now();
        if (now - lastTrigger < config.debounceDelay) return;
        lastTrigger = now;

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== event.document || !event.contentChanges.length) {
            return;
        }

        const change = event.contentChanges[0];
        if (change.text !== '\n' && change.text !== '\r\n') return;

        const lineNumber = change.range.start.line;
        const line = editor.document.lineAt(lineNumber);
        
        // Skip if in special context (comments, strings, etc.)
        if (isInSpecialContext(editor.document, change.range.start, config)) {
            return;
        }

        let lineText = line.text;
        if (config.skipComments) {
            lineText = removeComments(lineText, editor.document.languageId);
        }

        const trimmedLine = lineText.trim();
        if (trimmedLine.length === 0) return;

        // Check if language is enabled
        if (!isLanguageEnabled(editor.document.languageId, config)) {
            return;
        }

        if (await shouldInsertSemicolon(trimmedLine, editor.document.languageId, editor, lineNumber, config)) {
            editor.edit(editBuilder => {
                const endOfLinePosition = new vscode.Position(lineNumber, line.range.end.character);
                editBuilder.insert(endOfLinePosition, ';');
            }, { undoStopBefore: false, undoStopAfter: false });
        }
    });

    context.subscriptions.push(disposable);
    
    // Register configuration change listener
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('autoSemi')) {
                // Reset cached configuration
                cachedConfig = null;
            }
        })
    );
}

// Cache configuration for performance
let cachedConfig: AutoSemiConfig | null = null;

function getConfiguration(): AutoSemiConfig {
    if (cachedConfig) return cachedConfig;
    
    const config = vscode.workspace.getConfiguration('autoSemi');
    cachedConfig = {
        enabled: config.get<boolean>('enabled', true),
        languages: config.get<string[]>('languages', ['javascript', 'typescript', 'java']),
        skipComments: config.get<boolean>('skipComments', true),
        skipStrings: config.get<boolean>('skipStrings', true),
        debounceDelay: config.get<number>('debounceDelay', 50),
        enableForJavascript: config.get<boolean>('enableForJavascript', true),
        enableForTypescript: config.get<boolean>('enableForTypescript', true),
        enableForJava: config.get<boolean>('enableForJava', true),
        enableForCsharp: config.get<boolean>('enableForCsharp', false),
        enableForCpp: config.get<boolean>('enableForCpp', false),
    };
    
    return cachedConfig;
}

function isLanguageEnabled(languageId: string, config: AutoSemiConfig): boolean {
    if (!config.languages.includes(languageId)) return false;
    
    switch (languageId) {
        case 'javascript': return config.enableForJavascript;
        case 'typescript': return config.enableForTypescript;
        case 'java': return config.enableForJava;
        case 'csharp': return config.enableForCsharp;
        case 'cpp': return config.enableForCpp;
        default: return false;
    }
}

function isInSpecialContext(document: vscode.TextDocument, position: vscode.Position, config: AutoSemiConfig): boolean {
    if (!config.skipComments && !config.skipStrings) return false;
    
    const text = document.getText();
    const offset = document.offsetAt(position);
    
    // Check if we're inside a string or template literal
    if (config.skipStrings) {
        const previousText = text.substring(0, offset);
        const openDoubleQuotes = (previousText.match(/"/g) || []).length % 2 === 1;
        const openSingleQuotes = (previousText.match(/'/g) || []).length % 2 === 1;
        const openTemplate = (previousText.match(/`/g) || []).length % 2 === 1;
        
        if (openDoubleQuotes || openSingleQuotes || openTemplate) {
            return true;
        }
    }
    
    // Check if we're inside a comment
    if (config.skipComments) {
        const lineText = document.lineAt(position.line).text;
        const commentMatch = /(\/\/|\/\*|\*)/.exec(lineText);
        if (commentMatch && commentMatch.index < position.character) {
            return true;
        }
    }
    
    return false;
}

function removeComments(lineText: string, languageId: string): string {
    // Remove line comments
    if (languageId === 'javascript' || languageId === 'typescript' || languageId === 'java') {
        return lineText.replace(/\/\/.*$/, '').replace(/\/\*.*\*\//, '');
    }
    return lineText;
}

/**
 * Router for language-specific semicolon logic.
 */
async function shouldInsertSemicolon(
    lineText: string,
    languageId: string,
    editor: vscode.TextEditor,
    lineNumber: number,
    config: AutoSemiConfig
): Promise<boolean> {
    if (lineText.endsWith(';')) {
        return false;
    }

    // Get full document up to current line for parsing
    const fullText = editor.document.getText(new vscode.Range(0, 0, lineNumber + 1, lineText.length));

    switch (languageId) {
        case 'javascript':
        case 'typescript':
            return shouldInsertSemicolonForJS(lineText, fullText);
        case 'java':
            return await shouldInsertSemicolonForJava(lineText, fullText);
        case 'csharp':
            return shouldInsertSemicolonForCSharp(lineText, fullText);
        case 'cpp':
            return shouldInsertSemicolonForCpp(lineText, fullText);
        default:
            return false;
    }
}

/**
 * JavaScript/TypeScript semicolon rules using Babel.
 */
function shouldInsertSemicolonForJS(lineText: string, fullText: string): boolean {
    // Patterns that should not end with semicolon
    const noSemiPatterns = [
        /^(\s*)(if|for|while|switch|try|catch|finally|function|class|interface|enum|export|import)\b/,
        /^.*\{$/,
        /^.*\}$/,
        /^.*\([^)]*$/, // Unclosed parentheses
        /^.*\[[^\]]*$/, // Unclosed brackets
        /^.*`[^`]*$/, // Unclosed template literal
        /^.*\/\/.*$/, // Line comments
        /^.*\/\*.*$/, // Block comments start
    ];

    if (noSemiPatterns.some(pattern => pattern.test(lineText))) {
        return false;
    }

    // Patterns that should end with semicolon
    const needsSemiPatterns = [
        /^\s*(return|throw|break|continue|yield|debugger)\b/,
        /^\s*(const|let|var)\s+\w+/,
        /^.*[^={}]\s*=>\s*[^{]*$/, // Arrow function without block
        /^.*[^!]==?[^=].*$/, // Assignments and comparisons
        /^.*[+\-*/%&|^]=$/, // Operation assignments
        /^\s*\w+\([^)]*\)$/, // Function calls
        /^\s*[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)*\s*$/, // Property access
    ];

    return needsSemiPatterns.some(pattern => pattern.test(lineText));
}

/**
 * Java semicolon rules using java-parser.
 */
async function shouldInsertSemicolonForJava(lineText: string, fullText: string): Promise<boolean> {
    // Fast heuristics
    const noSemiPatterns = [
        /^(\s*)(if|else|for|while|switch|try|catch|finally|class|interface|enum|public|private|protected|package|import)\b/,
        /^.*\{$/,
        /^.*\}$/,
        /^.*\([^)]*$/, // Unclosed parentheses
        /^.*\[[^\]]*$/, // Unclosed brackets
    ];

    if (noSemiPatterns.some(pattern => pattern.test(lineText))) {
        return false;
    }

    // Patterns that need semicolons
    const needsSemiPatterns = [
        /^\s*(return|break|continue|throw)\b/,
        /^\s*(int|long|double|float|boolean|char|byte|short|var)\s+\w+/,
        /^\s*\w+\s*=\s*[^;]*$/, // Assignments
        /^\s*\w+\([^)]*\)$/, // Method calls
        /^\s*[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)*\s*$/, // Property access
    ];

    return needsSemiPatterns.some(pattern => pattern.test(lineText));
}

/**
 * C# semicolon rules (heuristic-based).
 */
function shouldInsertSemicolonForCSharp(lineText: string, fullText: string): boolean {
    // Patterns that should not end with semicolon
    const noSemiPatterns = [
        /^(\s*)(if|else|for|while|switch|try|catch|finally|class|interface|enum|public|private|protected|namespace|using)\b/,
        /^.*\{$/,
        /^.*\}$/,
        /^.*\([^)]*$/, // Unclosed parentheses
        /^.*\[[^\]]*$/, // Unclosed brackets
    ];

    if (noSemiPatterns.some(pattern => pattern.test(lineText))) {
        return false;
    }

    // Patterns that need semicolons
    const needsSemiPatterns = [
        /^\s*(return|break|continue|throw)\b/,
        /^\s*(int|long|double|float|bool|char|byte|short|var)\s+\w+/,
        /^\s*\w+\s*=\s*[^;]*$/, // Assignments
        /^\s*\w+\([^)]*\)$/, // Method calls
        /^\s*[a-zA-Z_][\w]*(\.[a-zA-Z_][\w]*)*\s*$/, // Property access
    ];

    return needsSemiPatterns.some(pattern => pattern.test(lineText));
}

/**
 * C++ semicolon rules (heuristic-based).
 */
function shouldInsertSemicolonForCpp(lineText: string, fullText: string): boolean {
    // Patterns that should not end with semicolon
    const noSemiPatterns = [
        /^(\s*)(if|else|for|while|switch|try|catch|finally|class|struct|enum|public|private|protected|namespace|using|#include|#define)\b/,
        /^.*\{$/,
        /^.*\}$/,
        /^.*\([^)]*$/, // Unclosed parentheses
        /^.*\[[^\]]*$/, // Unclosed brackets
    ];

    if (noSemiPatterns.some(pattern => pattern.test(lineText))) {
        return false;
    }

    // Patterns that need semicolons
    const needsSemiPatterns = [
        /^\s*(return|break|continue|throw)\b/,
        /^\s*(int|long|double|float|bool|char|short|auto)\s+\w+/,
        /^\s*\w+\s*=\s*[^;]*$/, // Assignments
        /^\s*\w+\([^)]*\)$/, // Function calls
        /^\s*[a-zA-Z_][\w]*(\.[a-zA-Z_][\w]*)*\s*$/, // Property access
    ];

    return needsSemiPatterns.some(pattern => pattern.test(lineText));
}

export function deactivate() {}