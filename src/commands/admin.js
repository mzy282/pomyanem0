// commands/admin.js - пример команды для админов
export const config = {
    name: 'admin',
    description: 'Админская команда',
    requireAdmin: true,  // Требует прав администратора
    ownerOnly: false      // Не только для владельца
}

export default async function(interaction, { isOwner }) {
    await interaction.reply({
        content: `✅ Команда выполнена!\n👑 Владелец: ${isOwner ? 'Да' : 'Нет'}`,
        flags: 64
    })
}