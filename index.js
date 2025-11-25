require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');

const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const REQUEST_CHANNEL_ID = process.env.REQUEST_CHANNEL_ID;
const UPLOADER_ROLE_ID = process.env.UPLOADER_ROLE_ID;
const EMBED_COLOR = process.env.EMBED_COLOR || 'FFE9EC';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

// Register /req slash command
(async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  const command = new SlashCommandBuilder()
    .setName('req')
    .setDescription('Post a new request')
    .addStringOption(opt =>
      opt.setName('request')
        .setDescription('Your request')
        .setRequired(true)
    ).toJSON();

  try {
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [command] });
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [command] });
    }
    console.log('Slash command registered!');
  } catch (err) {
    console.error(err);
  }
})();

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'req') return;

  const requestText = interaction.options.getString('request');
  const channel = interaction.guild.channels.cache.get(REQUEST_CHANNEL_ID);
  if (!channel)
    return interaction.reply({ content: 'Request channel not found.', ephemeral: true });

  await interaction.deferReply({ ephemeral: true });

  // Embed description
  const embedDesc = `
‎‎‎‎  
_ _       ⠀  ˚‧︵‿   **new request**    𓏼

> _ _     ${interaction.user} requested  ˚̣̣̣  **${requestText}**


-# _ _ ༯ ⠀ don't claim u__nles__s uploader
-# _ _ ༯ ⠀ you will be **pinged** once your req is completed
-# _ _ ༯ ⠀ uploaders can **click** to **claim**
_ _`;

  const embed = new EmbedBuilder()
    .setDescription(embedDesc)
    .setColor(`#${EMBED_COLOR}`)
    .setTimestamp();

  // Claim button
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('claim_request')
      .setLabel('claim')
      .setStyle(ButtonStyle.Secondary)
  );

  // Send ping + embed + button
  const msg = await channel.send({
    content: `<@&${UPLOADER_ROLE_ID}>`,
    embeds: [embed],
    components: [buttonRow]
  });

  // Create thread
  let thread;
  try {
    thread = await msg.startThread({
      name: `request: ${truncate(requestText, 40)}`,
      autoArchiveDuration: 1440
    });
  } catch (err) {
    console.error('Thread creation failed:', err);
  }

  await interaction.editReply({ content: 'Your request has been posted!' });

  // Button collector (no time limit)
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button });

  collector.on('collect', async i => {
    try {
      const member = await i.guild.members.fetch(i.user.id);

      // Only uploaders can claim
      if (!member.roles.cache.has(UPLOADER_ROLE_ID)) {
        return i.reply({ content: 'only uploaders may claim.', ephemeral: true });
      }

      // Acknowledge the click
      await i.deferUpdate();

      // Disable button for everyone
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('claimed')
          .setLabel('claimed')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );
      await msg.edit({ components: [disabledRow] });

      // Claim message
      const claimMsg = `_ _     𓂃       ₊  **${i.user} has claimed the request**    𓏼
> _ _     you have __48 hours__ to complete it ೃ`;

      if (thread) await thread.send({ content: claimMsg });
      else await msg.reply({ content: claimMsg });

      // Confirmation to claimer
      await i.followUp({ content: 'You claimed this request!', ephemeral: true });

      // Stop collector after claim
      collector.stop();
    } catch (err) {
      console.error('Button collector error:', err);
    }
  });
});

function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 3) + '...' : str;
}

client.login(TOKEN);
