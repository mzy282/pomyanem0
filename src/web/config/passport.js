// src/web/config/passport.js
import passport from 'passport'
import { Strategy as DiscordStrategy } from 'passport-discord'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Загружаем .env
dotenv.config({ path: path.join(__dirname, '../../../.env') })

console.log('\n🔧 НАСТРОЙКА PASSPORT:')
console.log('='.repeat(50))

// Проверяем переменные
if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
    console.error('❌ Ошибка: отсутствуют Discord credentials в .env')
    process.exit(1)
}

console.log(`✅ Client ID: ${process.env.DISCORD_CLIENT_ID}`)
console.log(`✅ Callback URL: ${process.env.WEB_URL || 'http://localhost:3000'}/auth/discord/callback`)

// Импортируем dbManager динамически, чтобы избежать циклических зависимостей
let dbManager
try {
    const dbModule = await import('../../database/index.js')
    dbManager = dbModule.default
    console.log('✅ База данных загружена в Passport')
} catch (error) {
    console.error('❌ Ошибка загрузки базы данных в Passport:', error)
    process.exit(1)
}

const BOT_OWNER_ID = process.env.BOT_OWNER_ID
console.log(`✅ ID владельца бота: ${BOT_OWNER_ID}`)

// Сериализация - сохраняем только ID пользователя
passport.serializeUser((user, done) => {
    console.log(`📝 Сериализация пользователя: ${user.id || user.user_id}`)
    done(null, user.id || user.user_id)
})

// Десериализация - получаем полные данные пользователя из БД
passport.deserializeUser(async (id, done) => {
    console.log(`📝 Десериализация пользователя: ${id}`)
    try {
        // Получаем пользователя из БД
        let user = dbManager.getUserById(id)
        
        if (!user) {
            console.log(`⚠️ Пользователь ${id} не найден в БД при десериализации`)
            return done(null, null)
        }
        
        // Получаем права пользователя
        const permissions = dbManager.db.prepare(`
            SELECT role, permissions FROM user_permissions WHERE user_id = ?
        `).get(id)
        
        user.permissions = permissions || { role: 'user', permissions: {} }
        
        // Для владельца всегда суперадмин
        if (id === BOT_OWNER_ID) {
            user.permissions.role = 'superadmin'
            console.log(`👑 Владелец бота ${user.username} десериализован`)
        }
        
        done(null, user)
    } catch (error) {
        console.error('❌ Ошибка десериализации:', error)
        done(error, null)
    }
})

// Регистрируем стратегию Discord
console.log('🔄 Регистрация Discord стратегии...')

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: `${process.env.WEB_URL || 'http://localhost:3000'}/auth/discord/callback`,
    scope: ['identify', 'email', 'guilds']
}, async (accessToken, refreshToken, profile, done) => {
    console.log(`✅ Успешная аутентификация Discord: ${profile.username} (${profile.id})`)
    
    try {
        // Создаем или обновляем пользователя в БД
        let user = dbManager.ensureUser({
            id: profile.id,
            username: profile.username,
            discriminator: profile.discriminator,
            displayAvatarURL: () => profile.avatar 
                ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
                : `https://cdn.discordapp.com/embed/avatars/${profile.discriminator % 5}.png`
        })
        
        if (!user) {
            console.error('❌ Не удалось создать пользователя в БД')
            return done(null, false, { message: 'Ошибка создания пользователя' })
        }
        
        // Получаем права пользователя
        const permissions = dbManager.db.prepare(`
            SELECT role, permissions FROM user_permissions WHERE user_id = ?
        `).get(profile.id)
        
        user.permissions = permissions || { role: 'user', permissions: {} }
        
        // Для владельца всегда суперадмин
        if (profile.id === BOT_OWNER_ID) {
            user.permissions.role = 'superadmin'
            console.log(`👑 Владелец бота ${profile.username} вошел в систему`)
        }
        
        console.log(`✅ Пользователь ${profile.username} успешно аутентифицирован, роль: ${user.permissions.role}`)
        return done(null, user)
        
    } catch (error) {
        console.error('❌ Ошибка при обработке профиля Discord:', error)
        return done(error, null)
    }
}))

console.log('✅ Passport настроен успешно')
console.log('='.repeat(50) + '\n')

export default passport