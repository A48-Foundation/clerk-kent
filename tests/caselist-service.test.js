jest.mock('node-fetch', () => jest.fn());

const fetch = require('node-fetch');
const CaselistService = require('../caselist-service');

describe('CaselistService', () => {
  let svc;

  beforeEach(() => {
    svc = new CaselistService();
    svc.cookie = 'caselist_token=test'; // skip login
    fetch.mockReset();
  });

  // ── lookupOpponent (parsing only) ──────────────────────────────────
  describe('lookupOpponent — team code parsing', () => {
    it('parses "Isidore Newman AW" into school + suffix', async () => {
      // Mock all network calls in sequence: findSchool, findTeam, getTeamRounds
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ displayName: 'Isidore Newman', name: 'Isidore+Newman' }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ display_name: 'Isidore Newman AW', name: 'IsidoreNewmanAW' }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ tournament: 'TOC', report: '1AC heg' }],
        });

      const result = await svc.lookupOpponent('Isidore Newman AW', 'A');
      expect(result.schoolName).toBe('Isidore Newman');
      expect(result.teamCode).toBe('AW');
      expect(result.caselistUrl).toContain('Isidore');
    });

    it('returns null for a single-word team code', async () => {
      const result = await svc.lookupOpponent('Solo', 'A');
      expect(result).toBeNull();
    });
  });

  // ── getWikiUrl ─────────────────────────────────────────────────────
  describe('getWikiUrl', () => {
    it('returns the correct caselist URL', () => {
      const url = svc.getWikiUrl('hspolicy25', 'Interlake', 'InterlakeOC');
      expect(url).toBe('https://opencaselist.com/hspolicy25/Interlake/InterlakeOC');
    });

    it('encodes special characters', () => {
      const url = svc.getWikiUrl('hspolicy25', 'Isidore Newman', 'AW');
      expect(url).toContain('Isidore%20Newman');
    });
  });

  // ── findSchool ─────────────────────────────────────────────────────
  describe('findSchool', () => {
    it('returns exact match on displayName', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { displayName: 'Interlake', name: 'Interlake' },
          { displayName: 'Isidore Newman', name: 'Isidore+Newman' },
        ],
      });

      const slug = await svc.findSchool('hspolicy25', 'Isidore Newman');
      expect(slug).toBe('Isidore+Newman');
    });

    it('falls back to fuzzy match', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { displayName: 'Isidore Newman School', name: 'IsidoreNewman' },
        ],
      });

      const slug = await svc.findSchool('hspolicy25', 'Isidore Newman');
      expect(slug).toBe('IsidoreNewman');
    });

    it('returns null when no schools match', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ displayName: 'Unrelated', name: 'Unrelated' }],
      });

      const slug = await svc.findSchool('hspolicy25', 'Nonexistent');
      expect(slug).toBeNull();
    });

    it('returns null for empty schools array', async () => {
      fetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
      const slug = await svc.findSchool('hspolicy25', 'Any');
      expect(slug).toBeNull();
    });
  });

  // ── findTeam ───────────────────────────────────────────────────────
  describe('findTeam', () => {
    it('matches team suffix', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { display_name: 'Interlake CG', name: 'InterlakeCG' },
          { display_name: 'Interlake OC', name: 'InterlakeOC' },
        ],
      });

      const slug = await svc.findTeam('hspolicy25', 'Interlake', 'OC');
      expect(slug).toBe('InterlakeOC');
    });

    it('returns null when suffix does not match', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { display_name: 'Interlake CG', name: 'InterlakeCG' },
        ],
      });

      const slug = await svc.findTeam('hspolicy25', 'Interlake', 'ZZ');
      expect(slug).toBeNull();
    });

    it('returns null for empty teams array', async () => {
      fetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
      const slug = await svc.findTeam('hspolicy25', 'School', 'AB');
      expect(slug).toBeNull();
    });
  });
});
