export const config = {
    name: 'owner',
    description: 'Команда только для владельца',
    requireAdmin: false,
    ownerOnly: true  // Только для владельца
}

export default async function(interaction) {
    await interaction.reply({
        content: '🔐 Секретная команда владельца',
        flags: 64
    })
}