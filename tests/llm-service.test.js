// Ensure no API key so the module uses fallback paths
const originalKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = '';

const LlmService = require('../llm-service');

afterAll(() => {
  // Restore original value
  if (originalKey !== undefined) {
    process.env.OPENAI_API_KEY = originalKey;
  }
});

describe('LlmService (fallback / no API key)', () => {
  let svc;

  beforeAll(() => {
    svc = new LlmService();
  });

  it('is constructed with LLM disabled', () => {
    expect(svc.enabled).toBe(false);
    expect(svc.client).toBeNull();
  });

  // ── basicFrequencyAnalysis ─────────────────────────────────────────
  describe('basicFrequencyAnalysis', () => {
    it('extracts keyword-based arguments from round reports', () => {
      const rounds = [
        { tournament: 'TOC', round: 'R1', report: '2NR: went for the politics DA and case turns' },
        { tournament: 'TOC', round: 'R2', report: '2NR: collapsed on politics and topicality' },
        { tournament: 'State', round: 'R3', report: '2NR went for capitalism K' },
      ];

      const result = svc.basicFrequencyAnalysis(rounds, 'N');
      expect(result).toContain('2NR Frequency Analysis');
      expect(result).toContain('politics');
    });

    it('extracts aff-side arguments', () => {
      const rounds = [
        { tournament: 'TOC', round: 'R1', report: '1AC: hegemony advantage, plan to increase heg' },
        { tournament: 'TOC', round: 'R2', report: '1AC: hegemony and econ advantages' },
      ];

      const result = svc.basicFrequencyAnalysis(rounds, 'A');
      expect(result).toContain('1AC Frequency Analysis');
      expect(result).toContain('hegemony');
    });

    it('returns appropriate message for empty rounds', () => {
      const result = svc.basicFrequencyAnalysis([], 'N');
      expect(result).toContain('No round reports available');
    });

    it('returns appropriate message when reports have no text', () => {
      const result = svc.basicFrequencyAnalysis([{ report: '' }], 'A');
      expect(result).toContain('No round reports available');
    });
  });

  // ── summarizeWithFallback ──────────────────────────────────────────
  describe('summarizeWithFallback', () => {
    it('uses basic analysis when LLM is disabled', async () => {
      const rounds = [
        { tournament: 'TOC', round: 'R1', report: '2NR went for topicality' },
      ];
      const result = await svc.summarizeWithFallback(rounds, 'N');
      expect(result).toContain('topicality');
    });

    it('returns no-reports message for empty rounds', async () => {
      const result = await svc.summarizeWithFallback([], 'A');
      expect(result).toContain('No round reports available');
    });
  });

  // ── _truncateParadigm ──────────────────────────────────────────────
  describe('_truncateParadigm', () => {
    it('returns short text unchanged', () => {
      expect(svc._truncateParadigm('Short paradigm.')).toBe('Short paradigm.');
    });

    it('truncates text longer than 500 chars', () => {
      const longText = 'X'.repeat(600);
      const result = svc._truncateParadigm(longText);
      expect(result.length).toBe(500);
      expect(result).toMatch(/\.\.\.$/);
    });

    it('returns fallback for null input', () => {
      expect(svc._truncateParadigm(null)).toContain('No paradigm text');
    });

    it('returns fallback for empty string', () => {
      expect(svc._truncateParadigm('  ')).toContain('No paradigm text');
    });
  });
});
