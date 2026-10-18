export interface ContextOptions { skipComments: boolean; skipStrings: boolean; }

/** Conservative lexical heuristics, not a language parser or formatter. */
export function insertionColumn(text: string, lineIndex: number, language: string,
    options: ContextOptions): number | null {
    const lines = text.split(/\r?\n/);
    if (lineIndex < 0 || lineIndex >= lines.length) { return null; }
    const prefix = lines.slice(0, lineIndex + 1).join('\n');
    let mode: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' | 'regex' = 'code';
    let escaped = false, regexClass = false, parens = 0, brackets = 0;
    let code = '', previous = '';
    for (let i = 0; i < prefix.length; i++) {
        const ch = prefix[i], next = prefix[i + 1];
        if (ch === '\n') {
            if (mode === 'line') { mode = 'code'; }
            code = ''; continue;
        }
        if (mode === 'line') { code += ' '; continue; }
        if (mode === 'block') {
            code += ' ';
            if (ch === '*' && next === '/') { code += ' '; i++; mode = 'code'; }
            continue;
        }
        if (mode !== 'code') {
            code += '_';
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (mode === 'regex') {
                if (ch === '[') { regexClass = true; }
                if (ch === ']') { regexClass = false; }
                if (ch === '/' && !regexClass) { mode = 'code'; previous = ')'; }
            } else if ((mode === 'single' && ch === "'") ||
                (mode === 'double' && ch === '"') || (mode === 'template' && ch === '`')) {
                mode = 'code'; previous = ')';
            }
            continue;
        }
        if (ch === '/' && next === '/') { mode = 'line'; code += '  '; i++; continue; }
        if (ch === '/' && next === '*') { mode = 'block'; code += '  '; i++; continue; }
        if (ch === "'" || ch === '"' || ch === '`') {
            mode = ch === "'" ? 'single' : ch === '"' ? 'double' : 'template';
            code += '_'; continue;
        }
        if (ch === '/' && ['javascript', 'typescript'].includes(language) &&
            (!previous || /[=(:,\[!&|?{};]/.test(previous) || /\b(return|throw)\s*$/.test(code))) {
            mode = 'regex'; code += '_'; continue;
        }
        if (ch === '(') { parens++; }
        if (ch === ')') { parens--; }
        if (ch === '[') { brackets++; }
        if (ch === ']') { brackets--; }
        code += ch;
        if (!/\s/.test(ch)) { previous = ch; }
    }
    if (options.skipComments && (mode === 'block' || (mode === 'line' && !code.trim()))) { return null; }
    if (options.skipStrings && ['single', 'double', 'template', 'regex'].includes(mode)) { return null; }
    const statement = code.trim();
    if (!statement || parens > 0 || brackets > 0 || /[;{},:\[.(=+\-*/%&|!?<>]$/.test(statement)) { return null; }
    if (/^(?:export\s+)?(?:if|else|for|while|switch|try|catch|finally|function|class|interface|enum|namespace|struct|do|synchronized)\b/.test(statement) ||
        /^[@#]/.test(statement) || /^(?:case\b|default\s*:)/.test(statement)) { return null; }
    if (!['javascript', 'typescript'].includes(language) && !/^(return|throw|break|continue)\b/.test(statement) &&
        /^(?:(?:public|private|protected|static|final|abstract|virtual|override|async)\s+)*(?:[\w<>\[\],?]+\s+)+\w+\s*\([^)]*\)(?:\s+throws\s+[\w., ]+)?$/.test(statement)) { return null; }
    if (['csharp', 'cpp'].includes(language) && /^using\b/.test(statement)) { return null; }
    const complete = /^(?:export\s+)?(?:const|let|var|return|throw|break|continue|yield|debugger|import)\b/.test(statement) ||
        /(?:^|[^=!<>])=(?!=)/.test(statement) || /(?:\+\+|--)$/.test(statement) ||
        /^[\w$.]+\s*\(.*\)$/.test(statement) ||
        (!['javascript', 'typescript'].includes(language) && /^(?:[\w<>\[\],?]+\s+)+\w+$/.test(statement));
    return complete ? code.trimEnd().length : null;
}
