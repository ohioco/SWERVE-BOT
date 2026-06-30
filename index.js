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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');

// ====== CONFIG ======
const TOKEN = "PASTE_NEW_TOKEN_HERE";                  // your bot token from the Dev Portal
const CLIENT_ID = "1521410737271209985";               // your bot's application/client ID
const GUILD_ID = "1512654910594875452";                // your server ID
const STAFF_ROLE_ID = "151433765198";                  // role allowed to review applications
const MEMBER_ROLE_ID = "151265901793";                 // role granted on approval
const APPLICATIONS_CATEGORY_ID = "1521416458108670042"; // category for ticket channels (optional)
// =====================

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel],
});

// ---------- Slash command registration ----------
const commands = [
  new SlashCommandBuilder()
    .setName('setup-applications')
    .setDescription('Post the SWERVE membership application panel in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log('Slash commands registered.');
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

// ---------- Interaction handling ----------
client.on('interactionCreate', async (interaction) => {
  try {
    // /setup-applications command -> posts the panel
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup-applications') {
      const embed = new EmbedBuilder()
        .setTitle('SWERVE Membership Application')
        .setDescription(
          'Want to become an official SWERVE member? Click the button below to start your application. A private channel will be created for your submission.'
        )
        .setColor(0x2b2d31);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('start_application')
          .setLabel('Apply Now')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📝')
      );

      await interaction.reply({ embeds: [embed], components: [row] });
      return;
    }

    // Button: start application -> opens modal
    if (interaction.isButton() && interaction.customId === 'start_application') {
      const modal = new ModalBuilder()
        .setCustomId('application_modal')
        .setTitle('SWERVE Membership Application');

      const nameInput = new TextInputBuilder()
        .setCustomId('app_name')
        .setLabel('In-game / Discord name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const ageInput = new TextInputBuilder()
        .setCustomId('app_age')
        .setLabel('Age')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const experienceInput = new TextInputBuilder()
        .setCustomId('app_experience')
        .setLabel('Relevant experience / playtime')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const whyInput = new TextInputBuilder()
        .setCustomId('app_why')
        .setLabel('Why do you want to join SWERVE?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(ageInput),
        new ActionRowBuilder().addComponents(experienceInput),
        new ActionRowBuilder().addComponents(whyInput)
      );

      await interaction.showModal(modal);
      return;
    }

    // Modal submit -> creates private ticket channel with the application
    if (interaction.isModalSubmit() && interaction.customId === 'application_modal') {
      await interaction.deferReply({ ephemeral: true });

      const name = interaction.fields.getTextInputValue('app_name');
      const age = interaction.fields.getTextInputValue('app_age');
      const experience = interaction.fields.getTextInputValue('app_experience');
      const why = interaction.fields.getTextInputValue('app_why');

      const guild = interaction.guild;
      const channelName = `app-${interaction.user.username}`.toLowerCase().slice(0, 90);

      const permissionOverwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: interaction.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
      ];

      if (STAFF_ROLE_ID) {
        permissionOverwrites.push({
          id: STAFF_ROLE_ID,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        });
      }

      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: APPLICATIONS_CATEGORY_ID || undefined,
        permissionOverwrites,
      });

      const appEmbed = new EmbedBuilder()
        .setTitle('New SWERVE Application')
        .setColor(0x57f287)
        .addFields(
          { name: 'Applicant', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Name', value: name, inline: true },
          { name: 'Age', value: age, inline: true },
          { name: 'Experience', value: experience },
          { name: 'Why join SWERVE', value: why }
        )
        .setTimestamp();

      const reviewRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('approve_app').setLabel('Approve').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('deny_app').setLabel('Deny').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Secondary)
      );

      await ticketChannel.send({
        content: STAFF_ROLE_ID ? `<@&${STAFF_ROLE_ID}>` : undefined,
        embeds: [appEmbed],
        components: [reviewRow],
      });

      await interaction.editReply({
        content: `Your application has been submitted! Check ${ticketChannel} for updates.`,
      });
      return;
    }

    // Staff review buttons
    if (interaction.isButton() && ['approve_app', 'deny_app', 'close_ticket'].includes(interaction.customId)) {
      const member = interaction.member;
      const isStaff = STAFF_ROLE_ID ? member.roles.cache.has(STAFF_ROLE_ID) : member.permissions.has(PermissionFlagsBits.ManageGuild);

      if (!isStaff) {
        await interaction.reply({ content: 'Only staff can use this.', ephemeral: true });
        return;
      }

      if (interaction.customId === 'approve_app') {
        // try to find the applicant from the embed mention
        const embed = interaction.message.embeds[0];
        const applicantField = embed?.fields?.find((f) => f.name === 'Applicant');
        const userId = applicantField?.value?.match(/\d+/)?.[0];

        if (userId && MEMBER_ROLE_ID) {
          const applicant = await interaction.guild.members.fetch(userId).catch(() => null);
          if (applicant) await applicant.roles.add(MEMBER_ROLE_ID).catch(() => null);
        }

        await interaction.reply('✅ Application **approved**. Member role granted.');
        return;
      }

      if (interaction.customId === 'deny_app') {
        await interaction.reply('❌ Application **denied**.');
        return;
      }

      if (interaction.customId === 'close_ticket') {
        await interaction.reply('🔒 Closing this ticket in 5 seconds...');
        setTimeout(() => interaction.channel.delete().catch(() => null), 5000);
        return;
      }
    }
  } catch (err) {
    console.error(err);
    if (interaction.isRepliable()) {
      await interaction.reply({ content: 'Something went wrong, try again.', ephemeral: true }).catch(() => null);
    }
  }
});

client.login(TOKEN);

