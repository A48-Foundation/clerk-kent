const EmailParser = require('../email-parser');

describe('EmailParser', () => {
  // ── parseSubject ────────────────────────────────────────────────────
  describe('parseSubject', () => {
    it('parses a standard [TAB] subject line', () => {
      const result = EmailParser.parseSubject('[TAB] Interlake OC Round 3 CX-T');
      expect(result).toEqual({
        teamCode: 'Interlake OC',
        roundNumber: 3,
        event: 'CX-T',
      });
    });

    it('parses another [TAB] subject with a different event', () => {
      const result = EmailParser.parseSubject('[TAB] Cuttlefish AB Round 1 Policy');
      expect(result).toEqual({
        teamCode: 'Cuttlefish AB',
        roundNumber: 1,
        event: 'Policy',
      });
    });

    it('returns null for a non-TAB subject', () => {
      expect(EmailParser.parseSubject('Hello World')).toBeNull();
    });

    it('returns null for null input', () => {
      expect(EmailParser.parseSubject(null)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(EmailParser.parseSubject('')).toBeNull();
    });
  });

  // ── parseBody ───────────────────────────────────────────────────────
  describe('parseBody', () => {
    const sampleBody = [
      'Round 3 of Policy - TOC',
      '',
      'Start: 2:15 PST',
      'Room: NSDA Campus Section 37',
      'Side: NEG',
      '',
      'Competitors',
      'AFF Isidore Newman AW',
      '  Alex : he/him',
      'NEG Interlake OC',
      '  Eva : she/her Mia : she/her',
      '',
      'Judging',
      'Jenny Liu',
      '  she/her',
    ].join('\n');

    it('extracts the round title', () => {
      const result = EmailParser.parseBody(sampleBody);
      expect(result.roundTitle).toBe('Round 3 of Policy - TOC');
    });

    it('extracts start time', () => {
      const result = EmailParser.parseBody(sampleBody);
      expect(result.startTime).toBe('2:15 PST');
    });

    it('extracts room', () => {
      const result = EmailParser.parseBody(sampleBody);
      expect(result.room).toBe('NSDA Campus Section 37');
    });

    it('extracts side', () => {
      const result = EmailParser.parseBody(sampleBody);
      expect(result.side).toBe('NEG');
    });

    it('extracts aff team code', () => {
      const result = EmailParser.parseBody(sampleBody);
      expect(result.competitors.aff.teamCode).toBe('Isidore Newman AW');
    });

    it('extracts neg team code', () => {
      const result = EmailParser.parseBody(sampleBody);
      expect(result.competitors.neg.teamCode).toBe('Interlake OC');
    });

    it('extracts aff debater names', () => {
      const result = EmailParser.parseBody(sampleBody);
      expect(result.competitors.aff.names).toEqual([
        { name: 'Alex', pronouns: 'he/him' },
      ]);
    });

    it('extracts neg debater names', () => {
      const result = EmailParser.parseBody(sampleBody);
      expect(result.competitors.neg.names).toEqual([
        { name: 'Eva', pronouns: 'she/her' },
        { name: 'Mia', pronouns: 'she/her' },
      ]);
    });

    it('extracts judges', () => {
      const result = EmailParser.parseBody(sampleBody);
      expect(result.judges).toHaveLength(1);
      expect(result.judges[0].name).toBe('Jenny Liu');
      expect(result.judges[0].pronouns).toBe('she/her');
    });

    it('returns defaults for null body', () => {
      const result = EmailParser.parseBody(null);
      expect(result.roundTitle).toBeNull();
      expect(result.judges).toEqual([]);
    });

    it('returns defaults for empty string body', () => {
      const result = EmailParser.parseBody('');
      expect(result.roundTitle).toBeNull();
    });
  });

  // ── isTabroomEmail ──────────────────────────────────────────────────
  describe('isTabroomEmail', () => {
    it('returns true when subject starts with [TAB]', () => {
      expect(EmailParser.isTabroomEmail({ subject: '[TAB] Some Round' })).toBe(true);
    });

    it('returns true when from address is @www.tabroom.com', () => {
      expect(EmailParser.isTabroomEmail({ from: 'noreply@www.tabroom.com' })).toBe(true);
    });

    it('returns false for an unrelated email', () => {
      expect(EmailParser.isTabroomEmail({ subject: 'Hello' })).toBe(false);
    });

    it('returns false for null input', () => {
      expect(EmailParser.isTabroomEmail(null)).toBe(false);
    });

    it('returns false for non-object input', () => {
      expect(EmailParser.isTabroomEmail('string')).toBe(false);
    });
  });

  // ── parse (combined) ───────────────────────────────────────────────
  describe('parse', () => {
    it('combines subject and body data into a flat result', () => {
      const email = {
        subject: '[TAB] Interlake OC Round 3 CX-T',
        body: [
          'Round 3 of Policy - TOC',
          '',
          'Start: 2:15 PST',
          'Room: NSDA Campus Section 37',
          'Side: NEG',
          '',
          'Competitors',
          'AFF Isidore Newman AW',
          '  Alex : he/him',
          'NEG Interlake OC',
          '  Eva : she/her Mia : she/her',
          '',
          'Judging',
          'Jenny Liu',
          '  she/her',
        ].join('\n'),
      };

      const result = EmailParser.parse(email);

      expect(result.teamCode).toBe('Interlake OC');
      expect(result.roundNumber).toBe(3);
      expect(result.event).toBe('CX-T');
      expect(result.roundTitle).toBe('Round 3 of Policy - TOC');
      expect(result.startTime).toBe('2:15 PST');
      expect(result.room).toBe('NSDA Campus Section 37');
      expect(result.side).toBe('NEG');
      expect(result.aff.teamCode).toBe('Isidore Newman AW');
      expect(result.neg.teamCode).toBe('Interlake OC');
      expect(result.judges).toHaveLength(1);
      expect(result.judges[0].name).toBe('Jenny Liu');
    });

    it('returns null for null input', () => {
      expect(EmailParser.parse(null)).toBeNull();
    });

    it('handles email with missing subject gracefully', () => {
      const result = EmailParser.parse({ body: 'Round 1 of LD' });
      expect(result.teamCode).toBeNull();
      expect(result.roundTitle).toBe('Round 1 of LD');
    });
  });
});
