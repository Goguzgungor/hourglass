import { describe, expect, it } from 'vitest';
import { envInt } from './config';

describe('envInt', () => {
  it('falls back to the default for unset, empty and non-numeric values', () => {
    expect(envInt('X', 3, undefined)).toBe(3);
    expect(envInt('X', 3, '')).toBe(3);
    expect(envInt('X', 3, 'abc')).toBe(3);
    expect(envInt('X', 3, '-5')).toBe(3);
    expect(envInt('X', 3, '2.5')).toBe(3);
  });
  it('rejects values below 1', () => {
    expect(envInt('X', 3, '0')).toBe(3);
  });
  it('accepts a positive integer', () => {
    expect(envInt('X', 3, '42')).toBe(42);
  });
  it('reads process.env when no raw value is passed', () => {
    process.env.INDEXER_TEST_ENV_INT = '7';
    try {
      expect(envInt('INDEXER_TEST_ENV_INT', 3)).toBe(7);
    } finally {
      delete process.env.INDEXER_TEST_ENV_INT;
    }
  });
});
