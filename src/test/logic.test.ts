import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { insertionColumn } from '../semicolon';

const options = { skipComments: true, skipStrings: true };
const cases: [string, string, string][] = [
    ['variable', 'const count = 1', 'const count = 1;'],
    ['existing semicolon', 'const count = 1;', 'const count = 1;'],
    ['URL string', 'const url = "https://example.com"', 'const url = "https://example.com";'],
    ['trailing comment', 'const count = 1 // note', 'const count = 1; // note'],
    ['comment with quotes', '// don\'t break the next line\nconst count = 1', 'const count = 1;'],
    ['block comment', '/* const count = 1', '/* const count = 1'],
    ['multiline comment', '/* note\nconst count = 1', 'const count = 1'],
    ['template literal', 'const text = `hello\nworld', 'world'],
    ['closed template', 'const text = `hello`', 'const text = `hello`;'],
    ['multiline call', 'send(\n    item', '    item'],
    ['array entry', 'const items = [\n    1', '    1'],
    ['incomplete expression', 'const count =', 'const count ='],
    ['control flow', 'if (ready)', 'if (ready)'],
    ['regex literal', 'const match = /https?:\\/\\//', 'const match = /https?:\\/\\//;'],
    ['function call', 'console.log("hello")', 'console.log("hello");']
];
function result(source: string, language: string) {
    const lines = source.split('\n'), line = lines.length - 1;
    const column = insertionColumn(source, line, language, options), original = lines[line];
    return column === null ? original : original.slice(0, column) + ';' + original.slice(column);
}
for (const [name, source, expected] of cases) { test(name, () => assert.equal(result(source, 'javascript'), expected)); }
test('Java declaration is untouched', () => assert.equal(result('public void run()', 'java'), 'public void run()'));
test('Java call is completed', () => assert.equal(result('System.out.println("hello")', 'java'), 'System.out.println("hello");'));
test('Java return is completed', () => assert.equal(result('return getValue()', 'java'), 'return getValue();'));
