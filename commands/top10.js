const { EmbedBuilder } = require('discord.js');
const playerService    = require('../services/playerService');

module.exports = {
  name: '!top10',
  async execute(message) {
    // 1) Traer todos los jugadores activos
    const players = (await playerService.fetchAllPlayers())
      .filter(p => p.active !== false);

    if (players.length === 0) {
      return message.channel.send('⚠️ No hay jugadores registrados.');
    }

    // 2) Ordenar de mayor a menor por puntos y tomar los 10 primeros
    const top = players
      .sort((a, b) => (b.points || 0) - (a.points || 0))
      .slice(0, 10);

    // 3) Construir el embed
    const embed = new EmbedBuilder()
      .setTitle('🏆 Top 10 Jugadores por Puntos')
      .setColor(0xFFD700)
      .setDescription(
        top.map((p, i) => `**${i + 1}.** ${p.id} — ${p.points || 0} puntos`).join('\n')
      )
      .setFooter({ text: 'PSDL – Peruvian Streamers DotA League' })
      .setTimestamp();

    // 4) Enviar
    return message.channel.send({ embeds: [embed] });
  }
};