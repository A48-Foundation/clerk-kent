class EmailParser {
  /**
   * Parse a [TAB] subject line into structured fields.
   * Format: "[TAB] <teamCode> Round <N> <event>"
   * @returns {{ teamCode: string, roundNumber: number, event: string } | null}
   */
  static parseSubject(subject) {
    if (!subject || typeof subject !== 'string') return null;
    const match = subject.match(/^\[TAB\]\s+(.+?)\s+Round\s+(\d+)\s+(.+)$/i);
    if (!match) return null;
    return {
      teamCode: match[1].trim(),
      roundNumber: parseInt(match[2], 10),
      event: match[3].trim(),
    };
  }

  /**
   * Parse the body of a Tabroom pairing email.
   * @returns {{ roundTitle: string|null, startTime: string|null, room: string|null,
   *             side: string|null, competitors: { aff: object, neg: object },
   *             judges: Array<{ name: string, pronouns: string|null }> }}
   */
  static parseBody(bodyText) {
    if (!bodyText || typeof bodyText !== 'string') {
      return {
        roundTitle: null, startTime: null, room: null, side: null,
        competitors: { aff: { teamCode: null, names: [] }, neg: { teamCode: null, names: [] } },
        judges: [],
      };
    }

    const lines = bodyText.split(/\r?\n/);
    const result = {
      roundTitle: null,
      startTime: null,
      room: null,
      side: null,
      competitors: {
        aff: { teamCode: null, names: [] },
        neg: { teamCode: null, names: [] },
      },
      judges: [],
    };

    let section = 'header'; // 'header' | 'competitors' | 'judging'
    let currentSide = null;  // 'aff' | 'neg' while inside competitors
    let currentJudge = null;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();
      if (trimmed === '') continue;

      // Detect section transitions
      if (/^competitors$/i.test(trimmed)) {
        section = 'competitors';
        currentSide = null;
        continue;
      }
      if (/^judging$/i.test(trimmed)) {
        section = 'judging';
        flushJudge(result, currentJudge);
        currentJudge = null;
        continue;
      }

      if (section === 'header') {
        this._parseHeaderLine(trimmed, result, i, lines);
      } else if (section === 'competitors') {
        this._parseCompetitorLine(raw, trimmed, result, currentSide, (s) => { currentSide = s; });
      } else if (section === 'judging') {
        currentJudge = this._parseJudgingLine(raw, trimmed, result, currentJudge);
      }
    }

    // Flush final judge if present
    flushJudge(result, currentJudge);

    return result;
  }

  // --- Header helpers ---------------------------------------------------

  static _parseHeaderLine(trimmed, result, index, lines) {
    const startMatch = trimmed.match(/^Start:\s*(.+)$/i);
    if (startMatch) {
      result.startTime = startMatch[1].trim();
      return;
    }

    const roomMatch = trimmed.match(/^Room:\s*(.+)$/i);
    if (roomMatch) {
      result.room = roomMatch[1].trim();
      return;
    }

    const sideMatch = trimmed.match(/^Side:\s*(.+)$/i);
    if (sideMatch) {
      result.side = sideMatch[1].trim();
      return;
    }

    // First non-keyword line is the round title (e.g. "Round 3 of Policy - TOC")
    if (result.roundTitle === null) {
      result.roundTitle = trimmed;
    }
  }

  // --- Competitor helpers -----------------------------------------------

  static _parseCompetitorLine(raw, trimmed, result, currentSide, setSide) {
    // Lines starting with AFF/NEG begin a new side entry
    const sideMatch = trimmed.match(/^(AFF|NEG)\s+(.+)$/i);
    if (sideMatch) {
      const side = sideMatch[1].toUpperCase() === 'AFF' ? 'aff' : 'neg';
      setSide(side);
      result.competitors[side].teamCode = sideMatch[2].trim();
      return;
    }

    // Indented lines under a side contain debater names (with optional pronouns)
    if (isIndented(raw) && currentSide) {
      const names = parseNames(trimmed);
      result.competitors[currentSide].names.push(...names);
    }
  }

  // --- Judging helpers --------------------------------------------------

  static _parseJudgingLine(raw, trimmed, result, currentJudge) {
    // Indented line → pronouns for the current judge
    if (isIndented(raw) && currentJudge) {
      currentJudge.pronouns = trimmed;
      flushJudge(result, currentJudge);
      return null;
    }

    // Non-indented line → new judge name
    flushJudge(result, currentJudge);
    return { name: trimmed, pronouns: null };
  }

  // --- Top-level helpers ------------------------------------------------

  /**
   * Returns true if the email looks like a Tabroom pairing notification.
   * Checks for [TAB] prefix in subject OR tabroom.com in the from address.
   * @param {{ subject?: string, from?: string }} email
   */
  static isTabroomEmail(email) {
    if (!email || typeof email !== 'object') return false;
    if (email.subject && /^\[TAB\]/i.test(email.subject.trim())) return true;
    if (email.from && /@www\.tabroom\.com/i.test(email.from)) return true;
    return false;
  }

  /**
   * Full parse: combines subject + body into a flat result object.
   * @param {{ subject?: string, from?: string, body?: string }} email
   */
  static parse(email) {
    if (!email || typeof email !== 'object') return null;

    const subjectData = this.parseSubject(email.subject) || {
      teamCode: null, roundNumber: null, event: null,
    };
    const bodyData = this.parseBody(email.body);

    return {
      teamCode: subjectData.teamCode,
      roundNumber: subjectData.roundNumber,
      event: subjectData.event,
      roundTitle: bodyData.roundTitle,
      startTime: bodyData.startTime,
      room: bodyData.room,
      side: bodyData.side,
      aff: bodyData.competitors.aff,
      neg: bodyData.competitors.neg,
      judges: bodyData.judges,
    };
  }
}

// ── Private utility functions ──────────────────────────────────────────

function isIndented(line) {
  return /^[ \t]+\S/.test(line);
}

/**
 * Parse a line of debater names. Names may appear as:
 *   "Alex : he/him"  or  "Eva : she/her Mia : she/her"
 * We split on the pattern "<name> : <pronouns>" pairs.
 */
function parseNames(line) {
  const names = [];
  // Match sequences of "Name : pronouns" — pronouns are slash-separated words
  const pairRegex = /([A-Za-z\s'-]+?)\s*:\s*([\w/]+)/g;
  let match;
  let lastIndex = 0;

  while ((match = pairRegex.exec(line)) !== null) {
    names.push({ name: match[1].trim(), pronouns: match[2].trim() });
    lastIndex = pairRegex.lastIndex;
  }

  // If no colon-delimited pairs found, treat entire line as space-separated names
  if (names.length === 0 && line.trim()) {
    line.trim().split(/\s{2,}/).forEach((n) => {
      if (n.trim()) names.push({ name: n.trim(), pronouns: null });
    });
  }

  return names;
}

function flushJudge(result, judge) {
  if (judge) result.judges.push(judge);
}

module.exports = EmailParser;
