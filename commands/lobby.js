module.exports = {
    name: '!lobby',
    async execute(message) {
        // Helpers, duplicated from matchService
        function generateLobbyName() {
            const randomNum = Math.floor(100000 + Math.random() * 900000);
            return `PSDL-${randomNum}`;
        }
        function generatePassword() {
            return Math.random().toString(36).substring(2, 8);
        }

        const lobbyName = generateLobbyName();
        const password = generatePassword();
        const lobbySpoiler = `||\`${lobbyName}\`||`;
        const passwordSpoiler = `||\`${password}\`||`;

        return message.channel.send(
            `🧩 Lobby: ${lobbySpoiler}\n` +
            `🔐 Password: ${passwordSpoiler}`
        );
    }
};