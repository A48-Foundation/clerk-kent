const { Client, GatewayIntentBits, EmbedBuilder, Events } = require('discord.js');
const NotionService = require('./notion-service');

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

    // Strip the mention to extract the judge name
    const content = message.content
      .replace(/<@!?\d+>/g, '')  // remove mentions
      .trim();

    if (!content) {
      await message.reply({
        embeds: [this.buildHelpEmbed()],
      });
      return;
    }

    const judgeName = content;

    try {
      // Show typing indicator while searching
      await message.channel.sendTyping();

      const judges = await this.notion.searchJudge(judgeName);

      if (judges.length === 0) {
        await message.reply(
          `🔍 No judges found matching **"${judgeName}"**. Try a different spelling or partial name.`
        );
        return;
      }

      // Send an embed for each judge found (up to 5)
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
      .setTitle('⚖️ Clerk Kent — Judge Lookup Bot')
      .setColor(0x2F80ED)
      .setDescription(
        'Mention me with a judge name to look them up!\n\n' +
        '**Usage:**\n' +
        '`@Clerk Kent [Judge Name]`\n\n' +
        '**Examples:**\n' +
        '`@Clerk Kent Smith`\n' +
        '`@Clerk Kent John Doe`\n\n' +
        'I\'ll search the judge database and show their win rate, email, prefs, tags, and any notes.'
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
