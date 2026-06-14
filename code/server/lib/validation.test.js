import { describe, it, expect } from 'vitest';
import { validateDeckId, validateEase, validateAiConfig, validateRequired, assertValid } from './validation.js';

describe('validateDeckId', () => {
  it('accepts valid deckId string', () => {
    const result = validateDeckId('ShiYi::daily');
    expect(result.valid).toBe(true);
    expect(result.value).toBe('ShiYi::daily');
  });

  it('trims whitespace', () => {
    const result = validateDeckId('  ShiYi::daily  ');
    expect(result.valid).toBe(true);
    expect(result.value).toBe('ShiYi::daily');
  });

  it('rejects null', () => {
    expect(validateDeckId(null).valid).toBe(false);
  });

  it('rejects undefined', () => {
    expect(validateDeckId(undefined).valid).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateDeckId('').valid).toBe(false);
  });

  it('rejects whitespace-only string', () => {
    expect(validateDeckId('   ').valid).toBe(false);
  });

  it('rejects non-string types', () => {
    expect(validateDeckId(123).valid).toBe(false);
    expect(validateDeckId({}).valid).toBe(false);
  });

  it('returns error message on failure', () => {
    const result = validateDeckId(null);
    expect(result.error).toBeTruthy();
  });
});

describe('validateEase', () => {
  it('accepts ease 1 (Again)', () => {
    const result = validateEase(1);
    expect(result.valid).toBe(true);
    expect(result.value).toBe(1);
  });

  it('accepts ease 3 (Good)', () => {
    const result = validateEase(3);
    expect(result.valid).toBe(true);
    expect(result.value).toBe(3);
  });

  it('accepts ease 4 (Easy)', () => {
    const result = validateEase(4);
    expect(result.valid).toBe(true);
    expect(result.value).toBe(4);
  });

  it('rounds float ease values', () => {
    const result = validateEase(3.4);
    expect(result.valid).toBe(true);
    expect(result.value).toBe(3);
  });

  it('rejects ease below 1', () => {
    expect(validateEase(0).valid).toBe(false);
    expect(validateEase(-1).valid).toBe(false);
  });

  it('rejects ease above 4', () => {
    expect(validateEase(5).valid).toBe(false);
    expect(validateEase(100).valid).toBe(false);
  });

  it('rejects null', () => {
    expect(validateEase(null).valid).toBe(false);
  });

  it('rejects undefined', () => {
    expect(validateEase(undefined).valid).toBe(false);
  });

  it('rejects NaN', () => {
    expect(validateEase(NaN).valid).toBe(false);
  });

  it('rejects non-numeric string', () => {
    expect(validateEase('three').valid).toBe(false);
  });

  it('accepts numeric string', () => {
    const result = validateEase('3');
    expect(result.valid).toBe(true);
    expect(result.value).toBe(3);
  });
});

describe('validateAiConfig', () => {
  it('accepts config with apiKey', () => {
    expect(validateAiConfig({ apiKey: 'sk-123' }).valid).toBe(true);
  });

  it('rejects null config', () => {
    expect(validateAiConfig(null).valid).toBe(false);
  });

  it('rejects undefined config', () => {
    expect(validateAiConfig(undefined).valid).toBe(false);
  });

  it('rejects config without apiKey', () => {
    expect(validateAiConfig({ provider: 'qwen' }).valid).toBe(false);
  });

  it('rejects config with empty apiKey', () => {
    expect(validateAiConfig({ apiKey: '' }).valid).toBe(false);
  });

  it('rejects config with whitespace-only apiKey', () => {
    expect(validateAiConfig({ apiKey: '   ' }).valid).toBe(false);
  });

  it('rejects non-object config', () => {
    expect(validateAiConfig('string').valid).toBe(false);
  });
});

describe('validateRequired', () => {
  it('passes when all fields present', () => {
    const result = validateRequired({ a: 1, b: '2' }, ['a', 'b']);
    expect(result.valid).toBe(true);
  });

  it('fails when a field is missing', () => {
    const result = validateRequired({ a: 1 }, ['a', 'b']);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('b');
  });

  it('fails when a field is null', () => {
    const result = validateRequired({ a: null, b: 'ok' }, ['a', 'b']);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('a');
  });

  it('fails when a field is empty string', () => {
    const result = validateRequired({ a: '', b: 'ok' }, ['a', 'b']);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('a');
  });

  it('passes when field is 0 or false', () => {
    const result = validateRequired({ a: 0, b: false }, ['a', 'b']);
    expect(result.valid).toBe(true);
  });

  it('returns all missing fields', () => {
    const result = validateRequired({}, ['a', 'b', 'c']);
    expect(result.missing).toEqual(['a', 'b', 'c']);
  });

  it('returns error message with missing fields', () => {
    const result = validateRequired({}, ['name', 'email']);
    expect(result.error).toContain('name');
    expect(result.error).toContain('email');
  });
});

describe('assertValid', () => {
  it('does not throw for valid result', () => {
    expect(() => assertValid({ valid: true })).not.toThrow();
  });

  it('throws for invalid result with error message', () => {
    expect(() => assertValid({ valid: false, error: 'bad input' })).toThrow('bad input');
  });

  it('throws generic message if no error provided', () => {
    expect(() => assertValid({ valid: false })).toThrow('校验失败');
  });
});
