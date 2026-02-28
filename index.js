require('dotenv').config();
const ClerkKentBot = require('./bot');

// Validate required environment variables
const required = ['NOTION_TOKEN', 'JUDGE_DATABASE_ID', 'DISCORD_TOKEN'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const bot = new ClerkKentBot();
bot.start().catch(err => {
  console.error('❌ Failed to start Clerk Kent:', err);
  process.exit(1);
});
