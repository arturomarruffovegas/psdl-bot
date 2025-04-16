module.exports = {
    name: '!help',
    async execute(message) {
        return message.channel.send(`
  **Unified Match System Commands**
  
  **Match Creation:**
  • \`!challenge <userId>\`
     - Create a challenge match. The challenger becomes captain1 and the challenged becomes captain2.  
       *Only one challenge match can be active at a time.*
  
  • \`!start\`
     - Create a start match. The initiator is auto-signed and the pool is capped at 10 players.  
       *Once 10 players join, teams are randomized (5 vs 5) and the match becomes ready.*
  
  **Common Commands for All Match Types:**
  • \`!sign\`
     - Sign into the currently active match.
     
  • \`!pool\`
     - Display the list of players already signed in.  
       *For challenge matches, it shows detailed info (role, tier); for start matches, it shows the count out of 10.*
  
  • \`!abort\`
     - Abort the current active match (challenge or start).
  
  **Challenge-Match Specific Commands:**
  • \`!pick <userId>\`
     - (Challenge matches only) Captains pick players from the pool in alternating turns.
  
  • \`!accept\` / \`!reject\`
     - (Challenge matches only) The challenged player responds to the challenge. Use \`!accept\` to begin or \`!reject\` to cancel.
  
  **Result Reporting:**
  • \`!result <radiant|dire>\`
     - Submit the match result.
       - In challenge matches, only captains can report the result directly.
       - In start matches, any signed player may vote. Once one side receives 6 votes, the result is finalized.
  
  **Match Information:**
  • \`!info <matchId>\`
     - Retrieve and display details from a finalized match.
      `);
    }
};