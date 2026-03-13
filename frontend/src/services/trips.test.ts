import { describe, it, expect } from 'vitest';
import { getAllTripIds, getTripById, getTripSummaries } from './trips';

describe('trips service', () => {
  describe('getAllTripIds', () => {
    it('returns an array of trip ids', () => {
      const ids = getAllTripIds();
      expect(Array.isArray(ids)).toBe(true);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids).toContain('trip_euro_2026');
    });
  });

  describe('getTripById', () => {
    it('returns null for an unknown trip id', async () => {
      const trip = await getTripById('unknown_trip_id');
      expect(trip).toBeNull();
    });

    it('returns trip data for a known trip id', async () => {
      const trip = await getTripById('trip_euro_2026');
      expect(trip).not.toBeNull();
      expect(trip?.id).toBe('trip_euro_2026');
      expect(trip?.title).toBeDefined();
    });
  });

  describe('getTripSummaries', () => {
    it('returns an array of trip summaries', async () => {
      const summaries = await getTripSummaries();
      expect(Array.isArray(summaries)).toBe(true);
      expect(summaries.length).toBeGreaterThan(0);
      expect(summaries[0].id).toBeDefined();
    });
  });
});
