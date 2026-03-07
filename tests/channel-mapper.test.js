// Mock discord.js so requiring channel-mapper doesn't fail on EmbedBuilder import
jest.mock('discord.js', () => ({
  EmbedBuilder: class FakeEmbedBuilder {
    constructor() { this.data = {}; }
    setTitle(t) { this.data.title = t; return this; }
    setDescription(d) { this.data.description = d; return this; }
    setColor(c) { this.data.color = c; return this; }
  },
}));

const ChannelMapper = require('../channel-mapper');

// discord.js Collection extends Map with .find() — lightweight mock
class MockCollection extends Map {
  find(fn) {
    for (const [, v] of this) {
      if (fn(v)) return v;
    }
    return undefined;
  }
}

function buildMockClient(channels) {
  const channelCache = new MockCollection(
    channels.map((ch) => [ch.id, ch]),
  );

  const guild = { channels: { cache: channelCache } };
  const guildCache = new MockCollection([['guild1', guild]]);

  return { guilds: { cache: guildCache } };
}

describe('ChannelMapper', () => {
  // ── extractTeamSuffix ──────────────────────────────────────────────
  describe('extractTeamSuffix', () => {
    let mapper;
    beforeAll(() => {
      mapper = new ChannelMapper({});
    });

    it('extracts suffix from "Interlake CG"', () => {
      expect(mapper.extractTeamSuffix('Interlake CG')).toBe('CG');
    });

    it('extracts suffix from "Cuttlefish AB"', () => {
      expect(mapper.extractTeamSuffix('Cuttlefish AB')).toBe('AB');
    });

    it('returns null for a single-word code', () => {
      expect(mapper.extractTeamSuffix('Solo')).toBeNull();
    });

    it('returns null for null input', () => {
      expect(mapper.extractTeamSuffix(null)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(mapper.extractTeamSuffix('')).toBeNull();
    });
  });

  // ── findChannel ────────────────────────────────────────────────────
  describe('findChannel', () => {
    let mapper;
    beforeAll(() => {
      const client = buildMockClient([
        { id: 'ch1', name: 'cg-tournaments' },
        { id: 'ch2', name: 'oc-tournaments' },
      ]);
      mapper = new ChannelMapper(client);
    });

    it('finds a channel matching the suffix', async () => {
      const ch = await mapper.findChannel('CG');
      expect(ch).toBeDefined();
      expect(ch.id).toBe('ch1');
      expect(ch.name).toBe('cg-tournaments');
    });

    it('returns null for an unmatched suffix', async () => {
      const ch = await mapper.findChannel('ZZ');
      expect(ch).toBeNull();
    });

    it('returns null for null suffix', async () => {
      const ch = await mapper.findChannel(null);
      expect(ch).toBeNull();
    });
  });

  // ── autoMap ────────────────────────────────────────────────────────
  describe('autoMap', () => {
    let mapper;
    beforeAll(() => {
      const client = buildMockClient([
        { id: 'ch1', name: 'cg-tournaments' },
        { id: 'ch2', name: 'oc-tournaments' },
      ]);
      mapper = new ChannelMapper(client);
    });

    it('maps team codes to their channels', async () => {
      const mapping = await mapper.autoMap(['Interlake CG', 'Interlake OC']);
      expect(mapping['Interlake CG']).toEqual({
        channelId: 'ch1',
        channelName: 'cg-tournaments',
        confidence: 'auto',
      });
      expect(mapping['Interlake OC']).toEqual({
        channelId: 'ch2',
        channelName: 'oc-tournaments',
        confidence: 'auto',
      });
    });

    it('marks unmatched teams', async () => {
      const mapping = await mapper.autoMap(['Unknown ZZ']);
      expect(mapping['Unknown ZZ']).toEqual({
        channelId: null,
        channelName: null,
        confidence: 'unmatched',
      });
    });

    it('marks single-word team codes as unmatched', async () => {
      const mapping = await mapper.autoMap(['Solo']);
      expect(mapping['Solo']).toEqual({
        channelId: null,
        channelName: null,
        confidence: 'unmatched',
      });
    });

    it('returns empty object for non-array input', async () => {
      const mapping = await mapper.autoMap(null);
      expect(mapping).toEqual({});
    });
  });
});
