// src/index.js
import { Client, GatewayIntentBits, Collection, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import dbManager from './database/index.js'
import WebServer from './web/server.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Загружаем переменные окружения
dotenv.config()

// ==================== КОНСТАНТЫ ====================
const COOLDOWN_TIME = 5 * 60 * 1000 // 5 минут
const userCooldowns = new Map()

// ID сервера и роли (из .env)
const GUILD_ID = process.env.MAIN_GUILD_ID || '1476634251532435477'
const MEMBER_ROLE_ID = process.env.MEMBER_ROLE_ID || '1476744899335557171'

// ==================== ПРОВЕРКА ПЕРЕМЕННЫХ ОКРУЖЕНИЯ ====================
function validateEnv() {
    const required = ['DISCORD_TOKEN', 'BOT_OWNER_ID']
    const missing = required.filter(key => !process.env[key])
    
    if (missing.length > 0) {
        console.error('❌ Отсутствуют обязательные переменные окружения:', missing.join(', '))
        process.exit(1)
    }
    
    console.log('✅ Переменные окружения проверены')
    console.log(`👑 ID владельца бота: ${process.env.BOT_OWNER_ID}`)
    console.log(`🆔 ID сервера: ${GUILD_ID}`)
    console.log(`🎭 ID роли участника: ${MEMBER_ROLE_ID}`)
}

validateEnv()

// ==================== СОЗДАНИЕ КЛИЕНТА ====================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.DirectMessages
    ]
})

// Коллекция для хранения команд
client.commands = new Collection()

// Статистика
client.stats = {
    commandsExecuted: 0,
    messagesProcessed: 0,
    startTime: Date.now()
}

// ==================== ГЛОБАЛЬНЫЕ ОБРАБОТЧИКИ ОШИБОК ====================
process.on('unhandledRejection', (error) => {
    console.error('❌ Необработанная ошибка:', error)
})

process.on('uncaughtException', (error) => {
    console.error('❌ Непойманная ошибка:', error)
})

// ==================== ФУНКЦИЯ ПРОВЕРКИ ВЛАДЕЛЬЦА ====================
function isOwner(userId) {
    return userId === process.env.BOT_OWNER_ID
}

// ==================== ЗАГРУЗКА КОМАНД ====================
async function loadCommands() {
    const commandsPath = path.join(__dirname, 'commands')
    if (!fs.existsSync(commandsPath)) {
        console.warn('⚠️ Папка с командами не найдена')
        return
    }
    
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'))
    let loadedCount = 0
    
    for (const file of commandFiles) {
        try {
            const filePath = path.join(commandsPath, file)
            const fileUrl = new URL(`file://${filePath.replace(/\\/g, '/')}`)
            const command = await import(fileUrl)
            
            if (command.config && command.config.name && command.default) {
                if (client.commands.has(command.config.name)) {
                    console.warn(`⚠️ Команда с именем ${command.config.name} уже существует`)
                    continue
                }
                
                client.commands.set(command.config.name, command.default)
                console.log(`✅ Загружена команда: /${command.config.name}`)
                loadedCount++
            }
        } catch (error) {
            console.error(`❌ Ошибка загрузки команды из файла ${file}:`, error)
        }
    }
    
    console.log(`📊 Загружено команд: ${loadedCount}/${commandFiles.length}`)
}

// ==================== ФУНКЦИЯ ДЛЯ ВЫДАЧИ РОЛИ И СМЕНЫ НИКА ====================
async function assignRoleAndNickname(userId, nick, staticVal) {
    console.log('\n' + '='.repeat(70))
    console.log('🔧 ФУНКЦИЯ assignRoleAndNickname ЗАПУЩЕНА')
    console.log('='.repeat(70))
    console.log(`📝 Входные данные:`)
    console.log(`   • ID пользователя: ${userId}`)
    console.log(`   • Nick: ${nick}`)
    console.log(`   • Static: ${staticVal}`)
    console.log(`   • Новый ник: ${nick} | ${staticVal}`)
    console.log(`   • ID сервера: ${GUILD_ID}`)
    console.log(`   • ID роли: ${MEMBER_ROLE_ID}`)
    
    try {
        // 1. Получаем сервер
        console.log('\n🔍 Шаг 1: Получение сервера...')
        const guild = await client.guilds.fetch(GUILD_ID)
        if (!guild) {
            console.error('❌ Сервер не найден!')
            return { success: false, error: 'Сервер не найден' }
        }
        console.log(`✅ Сервер найден: ${guild.name} (${guild.id})`)

        // 2. Получаем участника
        console.log('\n🔍 Шаг 2: Поиск участника на сервере...')
        let member
        try {
            member = await guild.members.fetch(userId)
            console.log(`✅ Участник НАЙДЕН на сервере!`)
            console.log(`   • Тег: ${member.user.tag}`)
            console.log(`   • ID: ${member.id}`)
            console.log(`   • Текущий ник: ${member.nickname || 'не установлен'}`)
            console.log(`   • Роли: ${member.roles.cache.map(r => r.name).join(', ') || 'нет'}`)
        } catch (error) {
            console.error(`❌ Участник НЕ НАЙДЕН на сервере!`)
            console.error(`   • Ошибка: ${error.message}`)
            console.error(`   • Код: ${error.code}`)
            return { 
                success: false, 
                error: 'Пользователь не найден на сервере. Возможно, он покинул сервер.' 
            }
        }

        // 3. Проверяем права бота
        console.log('\n🔍 Шаг 3: Проверка прав бота...')
        const botMember = await guild.members.fetch(client.user.id)
        const hasManageNicknames = botMember.permissions.has('ManageNicknames')
        const hasManageRoles = botMember.permissions.has('ManageRoles')
        
        console.log(`   • ManageNicknames: ${hasManageNicknames ? '✅' : '❌'}`)
        console.log(`   • ManageRoles: ${hasManageRoles ? '✅' : '❌'}`)
        
        if (!hasManageNicknames || !hasManageRoles) {
            return { 
                success: false, 
                error: 'У бота нет прав: требуется ManageNicknames и ManageRoles' 
            }
        }

        // 4. Смена ника
        console.log('\n🔍 Шаг 4: Смена ника...')
        const newNickname = `${nick} | ${staticVal}`
        try {
            await member.setNickname(newNickname)
            console.log(`✅ Ник УСПЕШНО изменен на: ${newNickname}`)
        } catch (error) {
            console.error(`❌ Ошибка при смене ника: ${error.message}`)
            console.error(`   • Код: ${error.code}`)
            
            if (error.code === 50013) {
                return { 
                    success: false, 
                    error: 'Нет прав на смену ника. Включите "Управлять никами" для роли бота.' 
                }
            }
            return { success: false, error: `Ошибка смены ника: ${error.message}` }
        }

        // 5. Выдача роли
        console.log('\n🔍 Шаг 5: Выдача роли...')
        
        // Проверяем существование роли
        const role = guild.roles.cache.get(MEMBER_ROLE_ID)
        if (!role) {
            console.error(`❌ Роль с ID ${MEMBER_ROLE_ID} НЕ НАЙДЕНА на сервере!`)
            return { 
                success: false, 
                error: 'Роль не найдена. Проверьте MEMBER_ROLE_ID в .env' 
            }
        }
        
        console.log(`   • Роль найдена: ${role.name}`)
        console.log(`   • ID роли: ${role.id}`)
        console.log(`   • Позиция роли: ${role.position}`)
        
        // Проверяем иерархию ролей
        const botRole = botMember.roles.highest
        console.log(`   • Высшая роль бота: ${botRole.name} (позиция: ${botRole.position})`)
        
        if (role.position >= botRole.position) {
            console.error(`❌ Роль бота НИЖЕ целевой роли!`)
            return { 
                success: false, 
                error: 'Роль бота ниже роли для выдачи. Поднимите роль бота выше в настройках сервера.' 
            }
        }
        
        // Выдаем роль
        try {
            await member.roles.add(MEMBER_ROLE_ID)
            console.log(`✅ Роль УСПЕШНО выдана!`)
        } catch (error) {
            console.error(`❌ Ошибка при выдаче роли: ${error.message}`)
            console.error(`   • Код: ${error.code}`)
            
            if (error.code === 50013) {
                return { 
                    success: false, 
                    error: 'Нет прав на выдачу роли. Включите "Управлять ролями" для роли бота.' 
                }
            }
            return { success: false, error: `Ошибка выдачи роли: ${error.message}` }
        }

        // 6. Проверка результата
        console.log('\n🔍 Шаг 6: Проверка результата...')
        const finalMember = await guild.members.fetch(userId)
        const hasRole = finalMember.roles.cache.has(MEMBER_ROLE_ID)
        
        console.log(`   • Итоговый ник: ${finalMember.nickname}`)
        console.log(`   • Роль выдана: ${hasRole ? '✅' : '❌'}`)
        
        if (finalMember.nickname === newNickname && hasRole) {
            console.log('\n✅✅✅ ВСЕ ОПЕРАЦИИ ВЫПОЛНЕНЫ УСПЕШНО!')
            console.log('='.repeat(70) + '\n')
            return { success: true, nickname: newNickname }
        } else {
            console.log('\n⚠️ ОПЕРАЦИИ ВЫПОЛНЕНЫ ЧАСТИЧНО')
            console.log('='.repeat(70) + '\n')
            return { 
                success: true, 
                warning: 'Роль или ник изменены не полностью',
                nickname: newNickname 
            }
        }
        
    } catch (error) {
        console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА В assignRoleAndNickname:')
        console.error(`   • ${error.message}`)
        console.error(`   • Stack: ${error.stack}`)
        console.log('='.repeat(70) + '\n')
        return { success: false, error: error.message }
    }
}

// ==================== ФУНКЦИЯ ПРИНЯТИЯ ЗАЯВКИ ====================
async function acceptApplication(req, applicationId, nick, staticVal) {
    console.log('\n' + '='.repeat(70))
    console.log('📋 ФУНКЦИЯ acceptApplication ЗАПУЩЕНА')
    console.log('='.repeat(70))
    console.log(`📝 Параметры:`)
    console.log(`   • ID заявки: ${applicationId}`)
    console.log(`   • Nick: ${nick}`)
    console.log(`   • Static: ${staticVal}`)
    
    try {
        // Получаем данные заявки
        console.log('\n🔍 Получение данных заявки из БД...')
        const application = await dbManager.getApplicationById(applicationId)
        if (!application) {
            console.error('❌ Заявка не найдена!')
            return { success: false, error: 'Заявка не найдена' }
        }
        
        console.log(`✅ Заявка найдена:`)
        console.log(`   • ID: ${application.id}`)
        console.log(`   • Пользователь: ${application.username}`)
        console.log(`   • Discord ID: ${application.user_id}`)

        // ВЫЗЫВАЕМ ФУНКЦИЮ ВЫДАЧИ РОЛИ
        console.log('\n🔍 Вызов assignRoleAndNickname...')
        const roleResult = await assignRoleAndNickname(
            application.user_id,
            nick,
            staticVal
        )
        
        console.log(`\n📊 Результат assignRoleAndNickname:`, roleResult)

        // Добавляем в family_members ТОЛЬКО если роль выдана успешно
        if (roleResult.success) {
            console.log('\n🔍 Добавление в family_members...')
            try {
                // Проверяем, нет ли уже такого участника
                const existingMember = await dbManager.getFamilyMemberByUserId(application.user_id)
                
                if (existingMember) {
                    console.log('⚠️ Участник уже есть в family_members, обновляем данные...')
                    await dbManager.updateFamilyMember(application.user_id, {
                        nick: nick,
                        static: staticVal,
                        full_name: application.full_name,
                        play_time_info: application.play_time_info,
                        servers_history: application.servers_history,
                        mp_experience: application.mp_experience,
                        gung_links: application.gung_links,
                        is_active: 1
                    })
                } else {
                    await dbManager.addFamilyMember({
                        user_id: application.user_id,
                        username: application.username,
                        discord_name: application.discord_name,
                        avatar_url: application.avatar_url,
                        nick: nick,
                        static: staticVal,
                        full_name: application.full_name,
                        play_time_info: application.play_time_info,
                        servers_history: application.servers_history,
                        mp_experience: application.mp_experience,
                        gung_links: application.gung_links
                    })
                }
                console.log('✅ Участник добавлен/обновлен в family_members')
            } catch (dbError) {
                console.error('❌ Ошибка при добавлении в family_members:', dbError.message)
                // Не возвращаем ошибку, так как роль уже выдана
            }
        }

        // Обновляем статус заявки
        console.log('\n🔍 Обновление статуса заявки...')
        const adminId = req?.user?.user_id || 'system'
        await dbManager.updateApplicationStatus(applicationId, 'accepted', adminId)
        console.log('✅ Статус заявки обновлен на "accepted"')

        // Отправляем уведомление в личку
        console.log('\n🔍 Отправка уведомления пользователю...')
        try {
            const user = await client.users.fetch(application.user_id)
            if (user) {
                const embed = new EmbedBuilder()
                    .setColor(0x10B981)
                    .setTitle('🎉 Добро пожаловать в KINGSIZE!')
                    .setDescription(`Поздравляем, **${application.username}**! Ваша заявка одобрена.`)
                    .addFields(
                        { name: '📝 Ваш ник', value: `${nick} | ${staticVal}`, inline: true },
                        { name: '🎭 Роль', value: 'Участник семьи', inline: true }
                    )
                    .setTimestamp()
                
                await user.send({ embeds: [embed] })
                console.log('✅ Уведомление отправлено')
            }
        } catch (dmError) {
            console.log('⚠️ Не удалось отправить уведомление:', dmError.message)
        }

        console.log('\n' + '='.repeat(70))
        if (roleResult.success) {
            console.log('✅✅✅ ЗАЯВКА УСПЕШНО ПРИНЯТА!')
            if (roleResult.warning) {
                console.log(`⚠️ Предупреждение: ${roleResult.warning}`)
            }
            console.log('='.repeat(70) + '\n')
            return { 
                success: true, 
                message: 'Заявка принята, участник добавлен в семью',
                warning: roleResult.warning 
            }
        } else {
            console.log('❌ ЗАЯВКА ПРИНЯТА, НО РОЛЬ НЕ ВЫДАНА')
            console.log(`   • Причина: ${roleResult.error}`)
            console.log('='.repeat(70) + '\n')
            return { 
                success: true, 
                warning: `Роль не выдана: ${roleResult.error}`,
                message: 'Заявка принята, но роль не выдана'
            }
        }

    } catch (error) {
        console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА В acceptApplication:')
        console.error(`   • ${error.message}`)
        console.error(`   • Stack: ${error.stack}`)
        console.log('='.repeat(70) + '\n')
        return { success: false, error: error.message }
    }
}

// ==================== ОБРАБОТЧИКИ ВЗАИМОДЕЙСТВИЙ ====================
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isButton() && interaction.customId === 'open_modal') {
            const modal = new ModalBuilder()
                .setCustomId('application_modal')
                .setTitle('📝 Заявка в семью')
            
            const inputs = [
                new TextInputBuilder()
                    .setCustomId('name_input')
                    .setLabel('Имя, возраст, ник и статик:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Владислав, 25 лет, Skillet Kingsize, 3811')
                    .setRequired(true)
                    .setMinLength(10)
                    .setMaxLength(1000),
                
                new TextInputBuilder()
                    .setCustomId('time_input')
                    .setLabel('Время игры на Majestic RP:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMinLength(10)
                    .setMaxLength(1000),
                
                new TextInputBuilder()
                    .setCustomId('server_input')
                    .setLabel('На каких серверах и в каких семьях играли:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMinLength(10)
                    .setMaxLength(1000),
                
                new TextInputBuilder()
                    .setCustomId('exp_input')
                    .setLabel('Опыт участия в МП:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMinLength(10)
                    .setMaxLength(1000),

                new TextInputBuilder()
                    .setCustomId('gung_input')
                    .setLabel('Откаты с ГГ (ссылки на YouTube/RuTube):')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMinLength(10)
                    .setMaxLength(1000)
            ]
            
            modal.addComponents(...inputs.map(input => new ActionRowBuilder().addComponents(input)))
            await interaction.showModal(modal)
        }
        
        if (interaction.isModalSubmit() && interaction.customId === 'application_modal') {
            const cooldown = checkCooldown(interaction.user.id)
            if (cooldown.onCooldown) {
                return await interaction.reply({ 
                    content: `❌ Подождите ${cooldown.timeLeft} секунд`, 
                    flags: 64 
                })
            }
            
            const formData = {
                name: interaction.fields.getTextInputValue('name_input'),
                time: interaction.fields.getTextInputValue('time_input'),
                server: interaction.fields.getTextInputValue('server_input'),
                exp: interaction.fields.getTextInputValue('exp_input'),
                gung: interaction.fields.getTextInputValue('gung_input')
            }
            
            // Сохраняем заявку
            const user = dbManager.ensureUser({
                id: interaction.user.id,
                username: interaction.user.username,
                discriminator: interaction.user.discriminator,
                displayAvatarURL: () => interaction.user.displayAvatarURL({ format: 'png', size: 256 })
            })
            
            const application = await dbManager.createApplication({
                user_id: interaction.user.id,
                username: interaction.user.username,
                discord_name: interaction.user.tag,
                avatar_url: interaction.user.displayAvatarURL({ format: 'png', size: 256 }),
                full_name: formData.name,
                play_time_info: formData.time,
                servers_history: formData.server,
                mp_experience: formData.exp,
                gung_links: formData.gung,
                created_at: new Date().toISOString(),
                status: 'pending'
            })
            
            if (global.io) {
                global.io.to('applications-room').emit('new_application', application)
            }
            
            await interaction.reply({ 
                content: `✅ Спасибо за заявку #${application.id}! Ожидайте решения.`, 
                flags: 64 
            })
        }
        
    } catch (error) {
        console.error('❌ Ошибка в interactionCreate:', error)
    }
})

// ==================== ФУНКЦИЯ ПРОВЕРКИ КУЛДАУНА ====================
function checkCooldown(userId) {
    const now = Date.now()
    const lastUsed = userCooldowns.get(userId) || 0
    
    if (now - lastUsed < COOLDOWN_TIME) {
        const timeLeft = Math.ceil((COOLDOWN_TIME - (now - lastUsed)) / 1000)
        return { onCooldown: true, timeLeft }
    }
    
    userCooldowns.set(userId, now)
    return { onCooldown: false }
}

// ==================== СОБЫТИЕ ГОТОВНОСТИ ====================
client.once('ready', async () => {
    console.log(`\n✅ Бот ${client.user.tag} запущен!`)
    client.user.setActivity('Прием заявок', { type: 'WATCHING' })
    
    try {
        const guild = await client.guilds.fetch(GUILD_ID)
        console.log(`✅ Подключен к серверу: ${guild.name}`)
        
        const botMember = await guild.members.fetch(client.user.id)
        console.log(`\n🔍 ПРАВА БОТА НА СЕРВЕРЕ:`)
        console.log(`   • ManageNicknames: ${botMember.permissions.has('ManageNicknames') ? '✅' : '❌'}`)
        console.log(`   • ManageRoles: ${botMember.permissions.has('ManageRoles') ? '✅' : '❌'}`)
        console.log(`   • Administrator: ${botMember.permissions.has('Administrator') ? '✅' : '❌'}`)
        
        // Проверяем роль
        if (MEMBER_ROLE_ID) {
            const role = guild.roles.cache.get(MEMBER_ROLE_ID)
            if (role) {
                console.log(`\n🔍 РОЛЬ ДЛЯ ВЫДАЧИ:`)
                console.log(`   • Название: ${role.name}`)
                console.log(`   • ID: ${role.id}`)
                console.log(`   • Позиция: ${role.position}`)
                
                const botRole = botMember.roles.highest
                console.log(`\n🔍 ИЕРАРХИЯ РОЛЕЙ:`)
                console.log(`   • Высшая роль бота: ${botRole.name} (позиция: ${botRole.position})`)
                console.log(`   • Целевая роль: ${role.name} (позиция: ${role.position})`)
                
                if (role.position >= botRole.position) {
                    console.log(`\n⚠️ ВНИМАНИЕ: Роль бота НИЖЕ целевой роли!`)
                    console.log(`   Бот НЕ СМОЖЕТ выдавать эту роль.`)
                    console.log(`   Поднимите роль бота выше в настройках сервера.`)
                } else {
                    console.log(`\n✅ Роль бота ВЫШЕ целевой роли - можно выдавать!`)
                }
            } else {
                console.log(`\n❌ Роль с ID ${MEMBER_ROLE_ID} НЕ НАЙДЕНА на сервере!`)
            }
        }
        
    } catch (error) {
        console.error(`❌ Ошибка при проверке сервера:`, error.message)
    }
})

// ==================== Graceful Shutdown ====================
async function gracefulShutdown(signal) {
    console.log(`\n👋 Получен сигнал ${signal}, завершение...`)
    
    if (global.webServer) await global.webServer.stop()
    if (global.io) await new Promise(resolve => global.io.close(resolve))
    if (dbManager) dbManager.close()
    await client.destroy()
    
    console.log('✅ Все соединения закрыты')
    process.exit(0)
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

// ==================== ЗАПУСК ====================
async function start() {
    try {
        console.log('🚀 Запуск бота...')
        
        await loadCommands()
        await client.login(process.env.DISCORD_TOKEN)
        
        const webServer = new WebServer(process.env.WEB_PORT || 3000)
        await webServer.start()
        
        // Сохраняем глобальные ссылки
        global.webServer = webServer
        global.discordClient = client
        global.acceptApplication = acceptApplication
        
        console.log(`\n✅ Бот успешно запущен!`)
        console.log(`   • Команд загружено: ${client.commands.size}`)
        console.log(`   • Веб-сервер: порт ${process.env.WEB_PORT || 3000}\n`)
        
    } catch (error) {
        console.error('❌ Критическая ошибка:', error)
        process.exit(1)
    }
}

start()

export default client