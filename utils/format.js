function formatList(players) {
    return players
        .map(p => `• \`${p.id}\` — (${p.role.toUpperCase()} - T${p.tier})`)
        .join('\n');
}

function formatTeam(players, captainId, allPlayers, label = 'Team') {
    const lines = players.map(id => {
        const isCaptain = id === captainId;
        const player = allPlayers.find(p => p.id === id);

        if (!player) {
            return `• \`${id}\`${isCaptain ? ' 👑' : ''} — (Unknown)`;
        }

        return `• \`${player.id}\`${isCaptain ? ' 👑' : ''} — (${player.role.toUpperCase()} - T${player.tier})`;
    });

    return `**${label}**\n${lines.join('\n')}`;
}

function formatMatchTime(dateString) {
    const unix = Math.floor(new Date(dateString).getTime() / 1000);
    return `<t:${unix}:F>`;
}

module.exports = {
    formatList,
    formatTeam,
    formatMatchTime
};