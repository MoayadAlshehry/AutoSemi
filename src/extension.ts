import * as vscode from 'vscode';

// This function is called when your extension is activated.
export function activate(context: vscode.ExtensionContext) {

    // A disposable to store our event listener.
    let disposable = vscode.workspace.onDidChangeTextDocument(event => {
        // Get the active text editor.
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        // Check if the change was a newline character being inserted.
        const change = event.contentChanges[0];
        // We only care about single-character changes that are newlines.
        if (!change.text.includes('\n') || change.text.trim() !== '') {
            return;
        }
        
        // The position *before* the newline was inserted.
        const originalPosition = change.range.start;
        const lineNumber = originalPosition.line;
        const line = editor.document.lineAt(lineNumber);
        const lineText = line.text.trim();

        // If the line is empty or a comment, do nothing.
        if (lineText.length === 0 || lineText.startsWith('//') || lineText.startsWith('*')) {
            return;
        }

        // Call our helper function to check if a semicolon is needed.
        if (shouldInsertSemicolon(lineText, editor.document.languageId)) {
            // Insert the semicolon at the end of the line.
            // We use an edit builder to make the change.
            editor.edit(editBuilder => {
                const endOfLinePosition = new vscode.Position(lineNumber, line.range.end.character);
                editBuilder.insert(endOfLinePosition, ';');
            }, { undoStopBefore: false, undoStopAfter: false }); // Merges this edit with the user's newline action
        }
    });

    context.subscriptions.push(disposable);
}

/**
 * Determines whether a semicolon should be inserted based on the line's content and language context.
 * This is the "smart" part of the extension.
 * @param lineText The trimmed text of the line to analyze.
 * @param languageId The language ID (e.g., 'javascript', 'java').
 * @returns {boolean} True if a semicolon should be inserted.
 */
function shouldInsertSemicolon(lineText: string, languageId: string): boolean {
    // 1. Don't add a semicolon if the line already has one.
    if (lineText.endsWith(';')) {
        return false;
    }

    // 2. Don't add a semicolon if the line ends with an opening brace or other block-starting character.
    const blockStarters = ['{', '(', '[', ',', '=>'];
    if (blockStarters.some(starter => lineText.endsWith(starter))) {
        return false;
    }

    // 3. Don't add a semicolon after control structure keywords.
    // This regex looks for keywords at the start of the line, possibly followed by '('.
    const controlStructureRegex = /^\s*(if|else|for|while|switch|try|catch|finally|do|class|interface|enum|function|\b(public|private|protected|static|final|abstract)\s.*)\b.*$/;
    if (controlStructureRegex.test(lineText)) {
        // A special case for `else if`
        if (lineText.startsWith('else if')) {
            return false;
        }
        // A simple `else` should also not have a semicolon
        if (lineText.trim() === 'else') {
            return false;
        }
        // Avoid adding semicolon on function declarations or class definitions
        if (lineText.includes('{')) {
            return false;
        }
    }
    
    // 4. A more robust check for control structures not ending in a brace
    const endsWithControl = /\)\s*$/.test(lineText); // e.g. if (condition)
    const startsWithControl = /^(if|for|while)\s*\(/.test(lineText);
    if(startsWithControl && endsWithControl) {
        return false;
    }

    // 5. Check for multi-line constructs (e.g., return statements, variable declarations).
    // This is a simplified check. A more advanced version might use a full parser.
    const lineContinuationOperators = ['+', '-', '*', '/', '%', '=', '==', '===', '!=', '!==', '>', '<', '>=', '<=', '&&', '||', '??'];
    if (lineContinuationOperators.some(op => lineText.endsWith(op))) {
        return false;
    }

    // If none of the above conditions are met, we can safely insert a semicolon.
    return true;
}

// This function is called when your extension is deactivated.
export function deactivate() {}