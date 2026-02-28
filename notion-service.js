const { Client } = require('@notionhq/client');

class NotionService {
  constructor() {
    this.notion = new Client({ auth: process.env.NOTION_TOKEN });
    this.judgeDatabaseId = process.env.JUDGE_DATABASE_ID;
  }

  /**
   * Search for judges by name (case-insensitive, partial match).
   * Handles "Last, First" format by flipping to "First Last".
   * Returns an array of judge objects.
   */
  async searchJudge(name) {
    // If input is "Last, First" format, flip to "First Last"
    const normalizedName = name.includes(',')
      ? name.split(',').map(s => s.trim()).reverse().join(' ')
      : name;

    // Search with the normalized name first
    let response = await this.notion.databases.query({
      database_id: this.judgeDatabaseId,
      filter: {
        property: 'Name',
        title: {
          contains: normalizedName,
        },
      },
      page_size: 5,
    });

    // If no results and we flipped the name, also try the original input
    if (response.results.length === 0 && normalizedName !== name) {
      response = await this.notion.databases.query({
        database_id: this.judgeDatabaseId,
        filter: {
          property: 'Name',
          title: {
            contains: name,
          },
        },
        page_size: 5,
      });
    }

    const judges = [];
    for (const page of response.results) {
      const judge = await this.extractJudgeData(page);
      judges.push(judge);
    }
    return judges;
  }

  /**
   * Extract all relevant data from a judge page.
   */
  async extractJudgeData(page) {
    const props = page.properties;

    // Name
    const name = props['Name']?.title?.map(t => t.plain_text).join('') || 'Unknown';

    // Win% (rollup → number, stored as decimal e.g. 0.75 = 75%)
    const winRateRaw = props['Win%']?.rollup?.number;
    const winRate = winRateRaw != null ? `${Math.round(winRateRaw * 100)}%` : 'N/A';

    // Email
    const email = props['Email']?.email || 'N/A';

    // Tags
    const tags = props['Tags']?.multi_select?.map(t => t.name) || [];

    // Tabroom URL
    const tabroom = props['Tabroom']?.url || null;

    // Prefs
    const prefs = props['Prefs']?.number != null ? props['Prefs'].number : 'N/A';

    // Page comments (notes on the judge)
    const comments = await this.getPageComments(page.id);

    // Notion page URL
    const url = page.url;

    return { name, winRate, email, tags, tabroom, prefs, comments, url };
  }

  /**
   * Fetch all comments on a Notion page.
   */
  async getPageComments(pageId) {
    try {
      const response = await this.notion.comments.list({ block_id: pageId });
      return response.results.map(c =>
        c.rich_text.map(t => t.plain_text).join('')
      ).filter(text => text.length > 0);
    } catch (err) {
      console.error(`Failed to fetch comments for page ${pageId}:`, err.message);
      return [];
    }
  }
}

module.exports = NotionService;
