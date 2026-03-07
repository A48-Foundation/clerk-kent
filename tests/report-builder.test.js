const { EmbedBuilder } = require('discord.js');
const ReportBuilder = require('../report-builder');

describe('ReportBuilder', () => {
  let builder;
  beforeAll(() => {
    builder = new ReportBuilder();
  });

  // ── buildPairingEmbed ──────────────────────────────────────────────
  describe('buildPairingEmbed', () => {
    it('returns an EmbedBuilder with the correct title and fields', () => {
      const embed = builder.buildPairingEmbed({
        roundTitle: 'Round 3 of Policy - TOC',
        startTime: '2:15 PST',
        room: 'NSDA Campus Section 37',
        side: 'NEG',
        teamCode: 'Interlake OC',
        aff: { teamCode: 'Isidore Newman AW' },
        neg: { teamCode: 'Interlake OC' },
      });

      expect(embed).toBeInstanceOf(EmbedBuilder);

      const json = embed.toJSON();
      expect(json.title).toBe('📋 Round 3 of Policy - TOC');

      const fieldMap = Object.fromEntries(json.fields.map((f) => [f.name, f.value]));
      expect(fieldMap['Aff']).toBe('Isidore Newman AW');
      expect(fieldMap['Neg']).toContain('🟢');
      expect(fieldMap['Neg']).toContain('Interlake OC');
      expect(fieldMap['Room']).toBe('NSDA Campus Section 37');
      expect(fieldMap['Start Time']).toBe('2:15 PST');
      expect(fieldMap['Our Side']).toBe('NEG');
    });

    it('handles null pairing data gracefully', () => {
      const embed = builder.buildPairingEmbed(null);
      const json = embed.toJSON();
      expect(json.title).toBe('📋 Unknown Round');
    });
  });

  // ── buildOpponentEmbed ─────────────────────────────────────────────
  describe('buildOpponentEmbed', () => {
    it('returns an embed with opponent info', () => {
      const embed = builder.buildOpponentEmbed({
        schoolName: 'Isidore Newman',
        teamCode: 'AW',
        side: 'AFF',
        caselistUrl: 'https://opencaselist.com/hspolicy25/Isidore+Newman/AW',
        argumentSummary: '1AC Heg advantage',
      });

      const json = embed.toJSON();
      expect(json.title).toContain('Isidore Newman');
      expect(json.title).toContain('AW');

      const fieldMap = Object.fromEntries(json.fields.map((f) => [f.name, f.value]));
      expect(fieldMap['Side']).toBe('AFF');
      expect(fieldMap['Caselist']).toContain('OpenCaselist');
      expect(fieldMap['Argument Summary']).toBe('1AC Heg advantage');
    });

    it('handles null opponent data gracefully', () => {
      const embed = builder.buildOpponentEmbed(null);
      const json = embed.toJSON();
      expect(json.title).toContain('Unknown');
    });
  });

  // ── buildJudgeEmbed ────────────────────────────────────────────────
  describe('buildJudgeEmbed', () => {
    it('returns an embed with judge info', () => {
      const embed = builder.buildJudgeEmbed({
        name: 'Jenny Liu',
        school: 'Lincoln High',
        paradigmSummary: 'Flow judge, tech over truth.',
        paradigmUrl: 'https://tabroom.com/judge/123',
        notionNotes: 'Very strict on time.',
        notionUrl: 'https://notion.so/page',
      });

      const json = embed.toJSON();
      expect(json.title).toBe('⚖️ Jenny Liu');

      const fieldMap = Object.fromEntries(json.fields.map((f) => [f.name, f.value]));
      expect(fieldMap['School']).toBe('Lincoln High');
      expect(fieldMap['Paradigm Summary']).toBe('Flow judge, tech over truth.');
      expect(fieldMap['Paradigm Link']).toContain('View Paradigm');
      expect(fieldMap['Notion Notes']).toContain('View Notes');
      expect(fieldMap['Notion Notes']).toContain('Very strict on time.');
    });

    it('truncates paradigm summaries longer than 1000 chars', () => {
      const longText = 'A'.repeat(1500);
      const embed = builder.buildJudgeEmbed({ paradigmSummary: longText });
      const json = embed.toJSON();
      const field = json.fields.find((f) => f.name === 'Paradigm Summary');
      expect(field.value.length).toBeLessThanOrEqual(1000);
      expect(field.value).toMatch(/\.\.\.$/);
    });

    it('handles null judge data gracefully', () => {
      const embed = builder.buildJudgeEmbed(null);
      const json = embed.toJSON();
      expect(json.title).toBe('⚖️ Unknown Judge');
    });
  });

  // ── buildFullReport ────────────────────────────────────────────────
  describe('buildFullReport', () => {
    it('combines pairing, opponent, and judge embeds', () => {
      const embeds = builder.buildFullReport(
        { roundTitle: 'R1', aff: {}, neg: {} },
        { schoolName: 'Test School' },
        [{ name: 'Judge A' }, { name: 'Judge B' }],
      );
      expect(embeds).toHaveLength(4); // pairing + opponent + 2 judges
      embeds.forEach((e) => expect(e).toBeInstanceOf(EmbedBuilder));
    });

    it('limits total embeds to 10', () => {
      const judges = Array.from({ length: 15 }, (_, i) => ({ name: `Judge ${i}` }));
      const embeds = builder.buildFullReport(
        { roundTitle: 'R1', aff: {}, neg: {} },
        { schoolName: 'X' },
        judges,
      );
      expect(embeds.length).toBeLessThanOrEqual(10);
    });

    it('returns empty array when all inputs are null', () => {
      const embeds = builder.buildFullReport(null, null, null);
      expect(embeds).toEqual([]);
    });
  });
});
