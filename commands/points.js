const playerService = require('../services/playerService');

module.exports = {
  name: '!points',
  async execute(message, args) {
    let profile;

    if (args.length === 0) {
      // No args: show caller’s points
      const discordName = message.author.username.toLowerCase();
      profile = await playerService.getPlayerProfileByUsername(discordName);
      if (!profile) {
        return message.channel.send('❌ You no estás registrado.');
      }
    } else if (args.length === 1) {
      // One arg: treat as userId
      const userId = args[0].trim().toLowerCase();
      profile = await playerService.getPlayerProfileById(userId);
      if (!profile) {
        return message.channel.send(`❌ No existe ningun jugador con ID \`${userId}\`.`);
      }
    } else {
      return message.channel.send('❌ Uso: `!points [<userId>]`');
    }

    const pts = profile.points ?? 0;
    return message.channel.send(
      `💠 **${profile.id}** tiene **${pts}** puntos.`
    );
  }
};