require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const commandMap = new Map();

// 🔄 Load all commands recursively
function loadCommandsFrom(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
            loadCommandsFrom(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            const command = require(fullPath);

            if (Array.isArray(command.name)) {
                for (const name of command.name) {
                    commandMap.set(name, command);
                }
            } else {
                commandMap.set(command.name, command);
            }
        }
    }
}

// 🌍 Load everything in /commands
loadCommandsFrom(path.join(__dirname, 'commands'));

// ✅ Ready
client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
});

// 💬 Dispatch command
client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('!')) return;

    const args = message.content.trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();

    if (commandMap.has(commandName)) {
        try {
            const command = commandMap.get(commandName);
            await command.execute(message, args, commandName);
        } catch (err) {
            console.error(`[ERROR] Executing ${commandName}:`, err);
            message.channel.send('❌ An error occurred while executing the command.');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);