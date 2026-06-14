import { describe, it, expect } from 'vitest';
import { parseAIJson } from './parseAIJson.js';

describe('parseAIJson', () => {
  it('parses plain JSON object', () => {
    const result = parseAIJson('{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('parses JSON with nested objects', () => {
    const result = parseAIJson('{"outer": {"inner": 42}}');
    expect(result).toEqual({ outer: { inner: 42 } });
  });

  it('parses JSON wrapped in markdown code fence with json tag', () => {
    const result = parseAIJson('```json\n{"key": "value"}\n```');
    expect(result).toEqual({ key: 'value' });
  });

  it('parses JSON wrapped in markdown code fence without json tag', () => {
    const result = parseAIJson('```\n{"key": "value"}\n```');
    expect(result).toEqual({ key: 'value' });
  });

  it('parses JSON with leading/trailing whitespace', () => {
    const result = parseAIJson('  \n  {"key": "value"}  \n  ');
    expect(result).toEqual({ key: 'value' });
  });

  it('extracts first JSON object when extra text follows', () => {
    const result = parseAIJson('{"key": "value"}\nsome extra text');
    expect(result).toEqual({ key: 'value' });
  });

  it('extracts first JSON object when text precedes it', () => {
    const result = parseAIJson('Prefix text {"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('handles JSON with string containing escaped quotes', () => {
    const result = parseAIJson('{"key": "value with \\"quotes\\""}');
    expect(result).toEqual({ key: 'value with "quotes"' });
  });

  it('handles JSON with nested braces inside strings', () => {
    const result = parseAIJson('{"code": "function foo() { return 1; }"}');
    expect(result).toEqual({ code: 'function foo() { return 1; }' });
  });

  it('handles unicode content', () => {
    const result = parseAIJson('{"greeting": "こんにちは世界"}');
    expect(result).toEqual({ greeting: 'こんにちは世界' });
  });

  it('handles JSON with arrays', () => {
    const result = parseAIJson('{"items": [1, 2, 3], "nested": {"arr": ["a", "b"]}}');
    expect(result).toEqual({ items: [1, 2, 3], nested: { arr: ['a', 'b'] } });
  });

  it('handles boolean and null values', () => {
    const result = parseAIJson('{"bool": true, "nothing": null, "num": 0}');
    expect(result).toEqual({ bool: true, nothing: null, num: 0 });
  });

  it('extracts first of multiple JSON objects (AI sometimes appends a second)', () => {
    const result = parseAIJson('{"first": 1}\n{"second": 2}');
    expect(result).toEqual({ first: 1 });
  });

  it('throws descriptive error for empty string', () => {
    expect(() => parseAIJson('')).toThrow();
  });

  it('throws descriptive error for non-JSON text', () => {
    expect(() => parseAIJson('this is not json at all')).toThrow(/AI 返回内容解析失败/);
  });

  it('throws with text length in error message', () => {
    try {
      parseAIJson('just some text that is definitely not json');
    } catch (err) {
      expect(err.message).toContain('文本长度');
    }
  });

  it('handles real-world AI response with markdown and trailing text', () => {
    const input = '```json\n{"scenario": "The cat sat on the mat.", "question": "Where is the cat?"}\n```\nSome extra explanation...';
    const result = parseAIJson(input);
    expect(result.scenario).toBe('The cat sat on the mat.');
    expect(result.question).toBe('Where is the cat?');
  });

  it('handles JSON with escaped backslashes in strings', () => {
    const result = parseAIJson('{"path": "C:\\\\Users\\\\Admin"}');
    expect(result).toEqual({ path: 'C:\\Users\\Admin' });
  });
});
