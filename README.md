# Clerk Kent — Discord Judge Lookup Bot

A Discord bot that searches a Notion database of debate judges and returns their info (win rate, email, prefs, tags, and notes).

## Setup

### 1. Discord Bot Setup
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application named **Clerk Kent**
3. Go to **Bot** → click **Reset Token** → copy the token into `.env`
4. Under **Privileged Gateway Intents**, enable **Message Content Intent**
5. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot`
   - Bot Permissions: `Send Messages`, `Read Message History`
6. Copy the generated URL and open it in your browser to invite the bot to your server

### 2. Notion Integration Setup
1. Go to [Notion Integrations](https://www.notion.so/my-integrations) and create an integration (or reuse an existing one)
2. Copy the integration token into `.env` as `NOTION_TOKEN`
3. In Notion, share your **Judges** database with the integration (click ••• → Connections → add your integration)

### 3. Environment Variables
Create a `.env` file (already present) with:
```
NOTION_TOKEN=your_notion_integration_token
JUDGE_DATABASE_ID=your_judge_database_id
DISCORD_TOKEN=your_discord_bot_token
```

### 4. Install & Run
```bash
npm install
npm start
```

## Usage

In any Discord channel where the bot is present, mention it with a judge name:

```
@Clerk Kent John Smith
@Clerk Kent Smith
```

The bot will reply with an embed showing:
- **Win Rate** — percentage of rounds won
- **Email** — judge's email address
- **Prefs** — preference rating
- **Tags** — category tags
- **Tabroom** — link to Tabroom profile
- **Notes** — comments from the Notion page

Mention the bot without a name to see a help message.

## Files
| File | Purpose |
|------|---------|
| `index.js` | Entry point — loads env vars and starts the bot |
| `bot.js` | Discord bot logic — handles mentions and builds embeds |
| `notion-service.js` | Notion API wrapper — searches judges and fetches data |
