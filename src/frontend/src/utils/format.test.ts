import { describe, it, expect } from 'vitest';
import { formatWeekdayTime, formatDate, formatCurrency, formatDuration } from './format';

describe('format utils', () => {
  describe('formatDate', () => {
    it('formats date with default locale and options', () => {
      const date = '2026-05-15T10:00:00Z';
      // Use string checks that are locale-resilient
      expect(formatDate(date)).toContain('2026');
      expect(formatDate(date)).toContain('15');
    });

    it('formats date with specific locale', () => {
      const date = '2026-05-15T10:00:00Z';
      const formatted = formatDate(date, 'es-ES');
      expect(formatted).toContain('2026');
      expect(formatted).toContain('15');
    });
  });

  describe('formatCurrency', () => {
    it('formats currency correctly', () => {
      // The exact whitespace might differ depending on the node version, so we check for the digits and symbol
      const usd = formatCurrency(1500, 'USD');
      expect(usd).toContain('1,500');
      expect(usd).toContain('$');

      const eur = formatCurrency(1500, 'EUR', 'de-DE');
      expect(eur).toContain('1.500');
      expect(eur).toContain('€');
    });
  });

  describe('formatWeekdayTime', () => {
    it('gives the local weekday, hour and minute, the locale\'s way', () => {
      const iso = '2026-10-02T00:00:00+00:00';
      const local = new Date(iso);
      const minutes = String(local.getMinutes()).padStart(2, '0');
      const weekday = (locale: string) => local.toLocaleDateString(locale, { weekday: 'short' });

      const en = formatWeekdayTime(iso, 'en-US');
      expect(en).toMatch(new RegExp(`\\d{1,2}:${minutes}\\s?(AM|PM)$`));
      expect(en).toContain(weekday('en-US'));
      const es = formatWeekdayTime(iso, 'es-ES');
      expect(es).toContain(`${local.getHours()}:${minutes}`);
      expect(es).toContain(weekday('es-ES'));
    });

    it('is empty for something that is not a date', () => {
      expect(formatWeekdayTime('soon')).toBe('');
    });
  });

  describe('formatDuration', () => {
    it('formats duration in minutes correctly', () => {
      expect(formatDuration(0)).toBe('0m');
      expect(formatDuration(45)).toBe('45m');
      expect(formatDuration(60)).toBe('1h');
      expect(formatDuration(90)).toBe('1h 30m');
      expect(formatDuration(125)).toBe('2h 5m');
      expect(formatDuration(NaN)).toBe('0m');
    });
  });
});
