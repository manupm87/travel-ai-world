import { describe, it, expect } from 'vitest';
import { getFlag } from './countryFlag';

describe('countryFlag utils', () => {
  describe('getFlag', () => {
    it('returns the correct flag for a known country code', () => {
      expect(getFlag('FR')).toBe('🇫🇷');
      expect(getFlag('JP')).toBe('🇯🇵');
      expect(getFlag('US')).toBe('🇺🇸');
    });

    it('returns the fallback flag for an unknown country code', () => {
      expect(getFlag('UNKNOWN')).toBe('🏳️');
      expect(getFlag('')).toBe('🏳️');
    });
  });
});
