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
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');

// ====== CONFIG ======
const TOKEN = "PASTE_TOKEN_HERE";
const CLIENT_ID = "1521410737271209985";
const GUILD_ID = "1512654910594875452";
const STAFF_ROLE_ID = "1514337651984039956";
const TICKETS_CATEGORY_ID = "1521416458108670042";
// =====================

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel],
});

const commands = [
  new SlashCommandBuilder()
    .setName('setup-apps')
    .setDescription('Post the application panel in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log('Slash commands registered.');
}

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

client.on('interactionCreate', async (interaction) => {
  try {
    // /setup-tickets -> posts the panel as a plain bot message
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup-apps') {
      const embed = new EmbedBuilder()
        .setTitle('SWERVE Application')
        .setDescription('Click the button below to open a Application.')
        .setColor(0x2b2d31);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('open_ticket')
          .setLabel('Open Ticket')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📄')
      );

      await interaction.channel.send({ embeds: [embed], components: [row] });
      await interaction.reply({ content: 'Panel posted.', flags: 64 });
      return;
    }

    // Button: open ticket -> creates private channel
    if (interaction.isButton() && interaction.customId === 'open_ticket') {
      await interaction.deferReply({ flags: 64 });

      const guild = interaction.guild;
      const channelName = `ticket-${interaction.user.username}`.toLowerCase().slice(0, 90);

      // Check if user already has an open ticket
      const existing = guild.channels.cache.find((c) => c.name === channelName);
      if (existing) {
        await interaction.editReply({ content: `You already have an open ticket: ${existing}` });
        return;
      }

      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: TICKETS_CATEGORY_ID || undefined,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          {
            id: interaction.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          },
          {
            id: STAFF_ROLE_ID,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          },
        ],
      });

      const embed = new EmbedBuilder()
        .setTitle('Ticket Opened')
        .setDescription(`Hey <@${interaction.user.id}>, staff will be with you shortly.\n\`\`\`\nRoblox Username: \nDiscord ID:\nClips Of You Drifting:\n\`\`\``)
        .setColor(0x57f287);

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒')
      );

      await ticketChannel.send({
        content: `<@${interaction.user.id}> <@&${STAFF_ROLE_ID}>`,
        embeds: [embed],
        components: [closeRow],
      });

      await interaction.editReply({ content: `Ticket opened: ${ticketChannel}` });
      return;
    }

    // Close ticket button
    if (interaction.isButton() && interaction.customId === 'close_ticket') {
      const isStaff = interaction.member.roles.cache.has(STAFF_ROLE_ID);
      const isChannelOwner = interaction.channel.name.includes(interaction.user.username.toLowerCase());

      if (!isStaff && !isChannelOwner) {
        await interaction.reply({ content: 'Only staff or the ticket owner can close this.', flags: 64 });
        return;
      }

      await interaction.reply('🔒 Closing ticket in 5 seconds...');
      setTimeout(() => interaction.channel.delete().catch(() => null), 5000);
      return;
    }

  } catch (err) {
    console.error(err);
    if (interaction.isRepliable()) {
      await interaction.reply({ content: 'Something went wrong.', flags: 64 }).catch(() => null);
    }
  }
});

client.login(TOKEN);
        
