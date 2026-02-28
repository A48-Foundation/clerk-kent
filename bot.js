const { Client, GatewayIntentBits, EmbedBuilder, Events } = require('discord.js');
const NotionService = require('./notion-service');
const TournamentStore = require('./tournament-store');
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
    this.store = new TournamentStore();
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.client.once(Events.ClientReady, (readyClient) => {
      console.log(`✅ Clerk Kent is online as ${readyClient.user.tag}`);
      readyClient.user.setActivity('for @Clerk Kent [judge]', { type: 2 }); // "Listening to"
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

    if (lowerContent.startsWith('report ')) {
      await this.handleReport(message, content.slice(7).trim());
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

      this.store.addTeam(tournId, teamCode, message.channel.id);

      await message.reply(
        `✅ Now tracking **${teamCode}** at tournament **${tournId}**.\n` +
        `Use \`@Clerk Kent report ${teamCode.split(' ').pop()}\` to get pairings & judge info.`
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

    if (parts.length === 1) {
      const teamCode = parts[0];
      const tournaments = this.store.getAllTournaments();
      let removed = false;
      for (const tourn of tournaments) {
        if (this.store.removeTeam(tourn.tournId, teamCode)) {
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
      if (this.store.removeTeam(tournId, teamCode)) {
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
    const tournaments = this.store.getAllTournaments();

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
   * Handle: @Clerk Kent report <short_code>
   * e.g. @Clerk Kent report SW
   * Finds the tracked team whose code contains the short code,
   * checks the latest round, and sends judge info to this channel.
   */
  async handleReport(message, shortCode) {
    if (!shortCode) {
      await message.reply('**Usage:** `@Clerk Kent report <team_code>`\n**Example:** `@Clerk Kent report SW`');
      return;
    }

    try {
      await message.channel.sendTyping();

      // Find the tracked team matching the short code
      const tournaments = this.store.getAllTournaments();
      let matchedTeam = null;
      let matchedTourn = null;

      for (const tourn of tournaments) {
        const team = tourn.teams.find(t =>
          t.code.toLowerCase().includes(shortCode.toLowerCase())
        );
        if (team) {
          matchedTeam = team;
          matchedTourn = tourn;
          break;
        }
      }

      if (!matchedTeam) {
        await message.reply(
          `⚠️ No tracked team matches **"${shortCode}"**.\n` +
          `Use \`@Clerk Kent track <tabroom_url> <team_code>\` to register a team first.`
        );
        return;
      }

      // Get all rounds and find the latest one
      const rounds = await TabroomScraper.getRounds(matchedTourn.tournId);

      if (rounds.length === 0) {
        await message.reply('📭 No rounds found for this tournament yet.');
        return;
      }

      // Use the last round in the list (most recent)
      const latestRound = rounds[rounds.length - 1];

      // Scrape pairings for the latest round
      const pairings = await TabroomScraper.scrapePairings(matchedTourn.tournId, latestRound.roundId);
      const roundTitle = await TabroomScraper.getRoundTitle(matchedTourn.tournId, latestRound.roundId);

      if (pairings.length === 0) {
        await message.reply(`📭 No pairings found for **${roundTitle}** yet.`);
        return;
      }

      // Find the team's pairing
      const pairing = TabroomScraper.findTeamPairing(pairings, matchedTeam.code);

      if (!pairing) {
        await message.reply(`⚠️ **${matchedTeam.code}** not found in **${roundTitle}** pairings.`);
        return;
      }

      // Build and send the pairing + judge embeds
      await this.sendPairingReport(message.channel, matchedTeam, pairing, roundTitle, matchedTourn.tournId, latestRound.roundId);
    } catch (err) {
      console.error('Error in report command:', err);
      await message.reply('⚠️ Something went wrong while fetching pairings. Try again later.');
    }
  }

  /**
   * Send pairing + judge info embeds to a channel.
   */
  async sendPairingReport(channel, team, pairing, roundTitle, tournId, roundId) {
    const summaryEmbed = new EmbedBuilder()
      .setTitle(`📋 ${roundTitle}`)
      .setColor(0xF5A623)
      .setDescription(`**${team.code}** has been paired!`)
      .addFields(
        { name: 'Aff', value: pairing.aff || 'TBD', inline: true },
        { name: 'Neg', value: pairing.neg || 'TBD', inline: true },
        { name: 'Room', value: pairing.room || 'TBD', inline: true },
      )
      .setURL(`https://www.tabroom.com/index/tourn/postings/round.mhtml?tourn_id=${tournId}&round_id=${roundId}`)
      .setTimestamp();

    const embeds = [summaryEmbed];

    for (const judge of pairing.judges) {
      const judgeResults = await this.notion.searchJudge(judge.name);

      if (judgeResults.length > 0) {
        const j = judgeResults[0];
        const judgeEmbed = new EmbedBuilder()
          .setTitle(`⚖️ ${j.name}`)
          .setColor(0x2F80ED);

        judgeEmbed.addFields({ name: '📧 Email', value: j.email, inline: true });

        if (j.tabroom) {
          judgeEmbed.addFields({
            name: '🔗 Tabroom',
            value: `[View Profile](${j.tabroom})`,
            inline: false,
          });
        }

        if (j.comments.length > 0) {
          const commentsText = j.comments
            .map((c, i) => `**${i + 1}.** ${c}`)
            .join('\n\n');
          const truncated = commentsText.length > 1000
            ? commentsText.slice(0, 997) + '...'
            : commentsText;
          judgeEmbed.addFields({
            name: '📝 Notes',
            value: truncated,
            inline: false,
          });
        }

        if (j.url) judgeEmbed.setURL(j.url);
        embeds.push(judgeEmbed);
      } else {
        const unknownEmbed = new EmbedBuilder()
          .setTitle(`⚖️ ${judge.name}`)
          .setColor(0x95A5A6)
          .setDescription('No notes found in the judge database.');

        if (judge.judgeId) {
          unknownEmbed.addFields({
            name: '🔗 Tabroom',
            value: `[View Profile](https://www.tabroom.com/index/tourn/postings/judge.mhtml?judge_id=${judge.judgeId}&tourn_id=${tournId})`,
            inline: false,
          });
        }
        embeds.push(unknownEmbed);
      }
    }

    await channel.send({ embeds: embeds.slice(0, 10) });
    console.log(`✅ Sent report for ${team.code} in ${roundTitle}`);
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
        '`@Clerk Kent track <tabroom_url> <team_code>` — Register a team to track\n' +
        '`@Clerk Kent report <code>` — Get latest pairings & judge info for a team\n' +
        '`@Clerk Kent untrack <team_code>` — Stop tracking a team\n' +
        '`@Clerk Kent tournaments` — Show tracked tournaments\n\n' +
        '**Examples:**\n' +
        '`@Clerk Kent Smith` — Judge lookup\n' +
        '`@Clerk Kent track https://www.tabroom.com/...?tourn_id=36452&round_id=123 Interlake SW`\n' +
        '`@Clerk Kent report SW` — Get judge info for Interlake SW\'s latest round'
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
 