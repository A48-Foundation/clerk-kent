const { Client, GatewayIntentBits, EmbedBuilder, Events } = require('discord.js');
const NotionService = require('./notion-service');
const PairingsPoller = require('./pairings-poller');
const TabroomScraper = require('./tabroom-scraper');

class ClerkKentBot {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
    this.notion = new NotionService();
    this.poller = new PairingsPoller(this.client);
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.client.once(Events.ClientReady, (readyClient) => {
      console.log(`✅ Clerk Kent is online as ${readyClient.user.tag}`);
      readyClient.user.setActivity('for @Clerk Kent [judge]', { type: 2 }); // "Listening to"
      this.poller.start();
    });

    this.client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot) return;
      await this.handleMessage(message);
    });
  }

  /**
   * Handle incoming messages. Responds when the bot is mentioned.
   */
  async handleMessage(message) {
    // Check if the bot is mentioned
    if (!message.mentions.has(this.client.user)) return;

    // Strip the mention to extract the command
    const content = message.content
      .replace(/<@!?\d+>/g, '')  // remove mentions
      .trim();

    if (!content) {
      await message.reply({ embeds: [this.buildHelpEmbed()] });
      return;
    }

    // Check for tournament management commands
    const lowerContent = content.toLowerCase();

    if (lowerContent.startsWith('track ')) {
      await this.handleTrack(message, content.slice(6).trim());
      return;
    }

    if (lowerContent.startsWith('untrack ')) {
      await this.handleUntrack(message, content.slice(8).trim());
      return;
    }

    if (lowerContent === 'tournaments' || lowerContent === 'status') {
      await this.handleStatus(message);
      return;
    }

    if (lowerContent.startsWith('check ')) {
      await this.handleCheck(message, content.slice(6).trim());
      return;
    }

    // Default: judge lookup
    await this.handleJudgeLookup(message, content);
  }

  // ─── TOURNAMENT TRACKING COMMANDS ──────────────────────────────

  /**
   * Handle: @Clerk Kent track <tabroom_url> <team_code>
   * Registers a team to track at a tournament, sending updates to the current channel.
   */
  async handleTrack(message, args) {
    // Parse: URL then team code
    const parts = args.split(/\s+/);
    const url = parts[0];
    const teamCode = parts.slice(1).join(' ');

    if (!url || !teamCode) {
      await message.reply(
        '**Usage:** `@Clerk Kent track <tabroom_pairings_url> <team_code>`\n\n' +
        '**Example:**\n' +
        '`@Clerk Kent track https://www.tabroom.com/index/tourn/postings/round.mhtml?tourn_id=36452&round_id=1503711 Okemos AT`'
      );
      return;
    }

    try {
      let tournId;

      // Try parsing as a round URL first
      if (url.includes('round_id')) {
        const parsed = TabroomScraper.parseRoundUrl(url);
        tournId = parsed.tournId;
      } else {
        // Try extracting tourn_id from any Tabroom URL
        const parsed = new URL(url);
        tournId = parsed.searchParams.get('tourn_id');
      }

      if (!tournId) {
        await message.reply('⚠️ Could not extract tournament ID from that URL. Make sure it\'s a valid Tabroom URL.');
        return;
      }

      const store = this.poller.getStore();
      store.addTeam(tournId, teamCode, message.channel.id);

      await message.reply(
        `✅ Now tracking **${teamCode}** at tournament **${tournId}**.\n` +
        `Pairings will be sent to this channel (<#${message.channel.id}>) when new rounds are posted.`
      );
    } catch (err) {
      console.error('Error in track command:', err);
      await message.reply('⚠️ Invalid URL. Please provide a valid Tabroom pairings URL.');
    }
  }

  /**
   * Handle: @Clerk Kent untrack <team_code>
   * Or: @Clerk Kent untrack <tourn_id> <team_code>
   */
  async handleUntrack(message, args) {
    const parts = args.split(/\s+/);
    const store = this.poller.getStore();

    if (parts.length === 1) {
      // Try to untrack from all tournaments
      const teamCode = parts[0];
      const tournaments = store.getAllTournaments();
      let removed = false;
      for (const tourn of tournaments) {
        if (store.removeTeam(tourn.tournId, teamCode)) {
          removed = true;
        }
      }
      if (removed) {
        await message.reply(`✅ Removed **${teamCode}** from tracking.`);
      } else {
        await message.reply(`⚠️ **${teamCode}** is not being tracked.`);
      }
    } else {
      const tournId = parts[0];
      const teamCode = parts.slice(1).join(' ');
      if (store.removeTeam(tournId, teamCode)) {
        await message.reply(`✅ Removed **${teamCode}** from tournament **${tournId}**.`);
      } else {
        await message.reply(`⚠️ **${teamCode}** is not being tracked for tournament **${tournId}**.`);
      }
    }
  }

  /**
   * Handle: @Clerk Kent tournaments / @Clerk Kent status
   * Show all currently tracked tournaments and teams.
   */
  async handleStatus(message) {
    const store = this.poller.getStore();
    const tournaments = store.getAllTournaments();

    if (tournaments.length === 0) {
      await message.reply('📭 No tournaments are currently being tracked.\n\nUse `@Clerk Kent track <tabroom_url> <team_code>` to start tracking.');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('📊 Tracked Tournaments')
      .setColor(0xF5A623)
      .setTimestamp();

    for (const tourn of tournaments) {
      const teamList = tourn.teams
        .map(t => `• **${t.code}** → <#${t.channelId}>`)
        .join('\n');
      const roundCount = tourn.seenRounds.length;
      embed.addFields({
        name: `Tournament ${tourn.tournId}`,
        value: `${teamList}\n_Rounds processed: ${roundCount}_`,
        inline: false,
      });
    }

    await message.reply({ embeds: [embed] });
  }

  /**
   * Handle: @Clerk Kent check <tabroom_round_url>
   * Manually check pairings for a specific round NOW (no waiting for poller).
   */
  async handleCheck(message, url) {
    try {
      await message.channel.sendTyping();

      let tournId, roundId;

      if (url.includes('round_id')) {
        const parsed = TabroomScraper.parseRoundUrl(url);
        tournId = parsed.tournId;
        roundId = parsed.roundId;
      } else {
        await message.reply('⚠️ Please provide a round URL (must contain `round_id`).');
        return;
      }

      const pairings = await TabroomScraper.scrapePairings(tournId, roundId);
      const roundTitle = await TabroomScraper.getRoundTitle(tournId, roundId);

      if (pairings.length === 0) {
        await message.reply('📭 No pairings found for that round yet.');
        return;
      }

      // Check tracked teams for this tournament
      const store = this.poller.getStore();
      const tourn = store.getTournament(tournId);

      if (!tourn || tourn.teams.length === 0) {
        await message.reply(
          `Found **${pairings.length}** pairings for **${roundTitle}**, but no teams are tracked for this tournament.\n` +
          `Use \`@Clerk Kent track <url> <team_code>\` first.`
        );
        return;
      }

      let found = 0;
      for (const team of tourn.teams) {
        const pairing = TabroomScraper.findTeamPairing(pairings, team.code);
        if (pairing) {
          await this.poller.sendPairingInfo(team, pairing, roundTitle, tournId, roundId);
          found++;
        }
      }

      if (found === 0) {
        await message.reply(`⚠️ None of the tracked teams were found in **${roundTitle}** pairings.`);
      } else {
        // Mark as seen so poller doesn't re-process
        store.markRoundSeen(tournId, roundId);
      }
    } catch (err) {
      console.error('Error in check command:', err);
      await message.reply('⚠️ Failed to check pairings. Make sure the URL is valid.');
    }
  }

  // ─── JUDGE LOOKUP ──────────────────────────────────────────────

  async handleJudgeLookup(message, judgeName) {
    try {
      await message.channel.sendTyping();

      console.log(`[DEBUG] Raw message: "${message.content}"`);
      console.log(`[DEBUG] Extracted judge name: "${judgeName}"`);

      const judges = await this.notion.searchJudge(judgeName);

      if (judges.length === 0) {
        await message.reply(
          `🔍 No judges found matching **"${judgeName}"**. Try a different spelling or partial name.`
        );
        return;
      }

      const embeds = judges.map(judge => this.buildJudgeEmbed(judge));
      await message.reply({ embeds });
    } catch (err) {
      console.error('Error handling judge search:', err);
      await message.reply(
        '⚠️ Something went wrong while searching. Please try again later.'
      );
    }
  }

  /**
   * Build a rich embed for a judge.
   */
  buildJudgeEmbed(judge) {
    const embed = new EmbedBuilder()
      .setTitle(`⚖️ ${judge.name}`)
      .setColor(0x2F80ED)
      .setTimestamp();

    // Email
    embed.addFields({ name: '📧 Email', value: judge.email, inline: true });

    // Tabroom link
    if (judge.tabroom) {
      embed.addFields({
        name: '🔗 Tabroom',
        value: `[View Profile](${judge.tabroom})`,
        inline: false,
      });
    }

    // Comments / Notes
    if (judge.comments.length > 0) {
      const commentsText = judge.comments
        .map((c, i) => `**${i + 1}.** ${c}`)
        .join('\n\n');
      // Discord embed field value max is 1024 chars
      const truncated = commentsText.length > 1000
        ? commentsText.slice(0, 997) + '...'
        : commentsText;
      embed.addFields({
        name: '📝 Notes',
        value: truncated,
        inline: false,
      });
    }

    // Link to Notion page
    if (judge.url) {
      embed.setURL(judge.url);
    }

    return embed;
  }

  /**
   * Build a help embed when the bot is mentioned without a judge name.
   */
  buildHelpEmbed() {
    return new EmbedBuilder()
      .setTitle('⚖️ Clerk Kent — Judge Lookup & Pairings Bot')
      .setColor(0x2F80ED)
      .setDescription(
        '**Judge Lookup:**\n' +
        '`@Clerk Kent [Judge Name]` — Look up a judge\n\n' +
        '**Tournament Tracking:**\n' +
        '`@Clerk Kent track <tabroom_url> <team_code>` — Track a team\'s pairings\n' +
        '`@Clerk Kent untrack <team_code>` — Stop tracking a team\n' +
        '`@Clerk Kent check <round_url>` — Manually check a round now\n' +
        '`@Clerk Kent tournaments` — Show tracked tournaments\n\n' +
        '**Examples:**\n' +
        '`@Clerk Kent Smith`\n' +
        '`@Clerk Kent track https://www.tabroom.com/...?tourn_id=36452&round_id=123 Okemos AT`\n\n' +
        'When pairings are released, I\'ll automatically send judge info to the channels you\'ve set up!'
      );
  }

  /**
   * Start the bot.
   */
  async start() {
    await this.client.login(process.env.DISCORD_TOKEN);
  }
}

module.exports = ClerkKentBot;
 