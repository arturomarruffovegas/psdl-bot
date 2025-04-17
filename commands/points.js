const playerService = require('../../services/playerService');

module.exports = {
  name: '!points',
  async execute(message, args) {
    let profile;

    if (args.length === 0) {
      // No args: show caller’s points
      const discordName = message.author.username.toLowerCase();
      profile = await playerService.getPlayerProfileByUsername(discordName);
      if (!profile) {
        return message.channel.send('❌ You are not registered.');
      }
    } else if (args.length === 1) {
      // One arg: treat as userId
      const userId = args[0].trim().toLowerCase();
      profile = await playerService.getPlayerProfileById(userId);
      if (!profile) {
        return message.channel.send(`❌ No player found with ID \`${userId}\`.`);
      }
    } else {
      return message.channel.send('❌ Usage: `!points [<userId>]`');
    }

    const pts = profile.points ?? 0;
    return message.channel.send(
      `💠 **${profile.id}** has **${pts}** points.`
    );
  }
};