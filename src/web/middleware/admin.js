// src/web/middleware/admin.js
import dbManager from '../../database/index.js'

// Middleware для проверки авторизации
export const isAuthenticated = (req, res, next) => {
    if (!req.isAuthenticated()) {
        // Для API запросов возвращаем JSON
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ 
                success: false, 
                error: 'Требуется авторизация' 
            })
        }
        
        // Для обычных запросов сохраняем URL и редиректим на логин
        req.session.returnTo = req.originalUrl
        return res.redirect('/auth/login')
    }
    
    // Пользователь авторизован - продолжаем
    next()
}

// Проверка, является ли пользователь администратором (владелец или админ в БД)
export const isAdmin = (req, res, next) => {
    // Сначала проверяем авторизацию
    if (!req.isAuthenticated()) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ 
                success: false, 
                error: 'Требуется авторизация' 
            })
        }
        req.session.returnTo = req.originalUrl
        return res.redirect('/auth/login')
    }

    // Получаем ID владельца из переменных окружения
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID

    // Если пользователь - владелец бота, пропускаем без проверки БД
    if (req.user.user_id === BOT_OWNER_ID) {
        console.log(`✅ Владелец бота ${req.user.username} имеет доступ`)
        return next()
    }

    // Проверяем роль в базе данных
    try {
        const userPermissions = dbManager.db.prepare(`
            SELECT role FROM user_permissions WHERE user_id = ?
        `).get(req.user.user_id)

        // Если пользователь админ в нашей системе
        if (userPermissions && (userPermissions.role === 'admin' || userPermissions.role === 'superadmin')) {
            console.log(`✅ Администратор ${req.user.username} (${userPermissions.role}) имеет доступ`)
            return next()
        }

        // Если нет прав - показываем ошибку
        console.log(`❌ Пользователь ${req.user.username} не имеет прав администратора`)
        
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ 
                success: false, 
                error: 'Требуются права администратора' 
            })
        }

        return res.status(403).render('errors/403', { 
            title: 'Доступ запрещен',
            message: 'Эта страница доступна только администраторам бота'
        })
    } catch (error) {
        console.error('❌ Ошибка при проверке прав:', error)
        
        if (req.path.startsWith('/api/')) {
            return res.status(500).json({ 
                success: false, 
                error: 'Внутренняя ошибка сервера' 
            })
        }

        return res.status(500).render('errors/500', { 
            title: 'Ошибка сервера',
            message: 'Произошла ошибка при проверке прав доступа'
        })
    }
}

// Проверка, является ли пользователь супер-администратором (только владелец)
export const isSuperAdmin = (req, res, next) => {
    // Сначала проверяем авторизацию
    if (!req.isAuthenticated()) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ 
                success: false, 
                error: 'Требуется авторизация' 
            })
        }
        req.session.returnTo = req.originalUrl
        return res.redirect('/auth/login')
    }

    const BOT_OWNER_ID = process.env.BOT_OWNER_ID

    // Только владелец имеет доступ
    if (req.user.user_id === BOT_OWNER_ID) {
        return next()
    }

    // Проверяем, может быть супер-админ в БД (если нужно)
    try {
        const userPermissions = dbManager.db.prepare(`
            SELECT role FROM user_permissions WHERE user_id = ?
        `).get(req.user.user_id)

        if (userPermissions && userPermissions.role === 'superadmin') {
            return next()
        }
    } catch (error) {
        console.error('❌ Ошибка при проверке прав суперадмина:', error)
    }

    // Если нет прав
    if (req.path.startsWith('/api/')) {
        return res.status(403).json({ 
            success: false, 
            error: 'Требуются права супер-администратора' 
        })
    }

    res.status(403).render('errors/403', { 
        title: 'Доступ запрещен',
        message: 'Эта страница доступна только владельцу бота'
    })
}

// Middleware для проверки прав на управление сервером
export const canManageGuild = (req, res, next) => {
    const guildId = req.params.guildId || req.body.guildId
    
    if (!guildId) {
        return res.status(400).json({ 
            success: false, 
            error: 'Не указан ID сервера' 
        })
    }

    if (!req.isAuthenticated()) {
        return res.status(401).json({ 
            success: false, 
            error: 'Требуется авторизация' 
        })
    }

    const BOT_OWNER_ID = process.env.BOT_OWNER_ID

    // Владелец бота имеет доступ ко всем серверам
    if (req.user.user_id === BOT_OWNER_ID) {
        return next()
    }

    try {
        // Проверяем, является ли пользователь владельцем сервера
        const guild = dbManager.db.prepare(`
            SELECT * FROM guilds WHERE guild_id = ? AND owner_id = ?
        `).get(guildId, req.user.user_id)

        if (guild) {
            req.guild = guild
            return next()
        }

        // Проверяем, является ли пользователь глобальным админом
        const userPermissions = dbManager.db.prepare(`
            SELECT role FROM user_permissions WHERE user_id = ?
        `).get(req.user.user_id)

        if (userPermissions && (userPermissions.role === 'admin' || userPermissions.role === 'superadmin')) {
            return next()
        }

        res.status(403).json({ 
            success: false, 
            error: 'У вас нет прав для управления этим сервером' 
        })
    } catch (error) {
        console.error('❌ Ошибка при проверке прав на сервер:', error)
        res.status(500).json({ 
            success: false, 
            error: 'Внутренняя ошибка сервера' 
        })
    }
}

// Middleware для добавления информации о правах в локальные переменные
export const attachUserPermissions = (req, res, next) => {
    if (req.isAuthenticated()) {
        const BOT_OWNER_ID = process.env.BOT_OWNER_ID
        
        // Проверяем, является ли пользователь владельцем
        res.locals.isOwner = req.user.user_id === BOT_OWNER_ID
        
        try {
            // Получаем права из БД
            const userPermissions = dbManager.db.prepare(`
                SELECT role, permissions FROM user_permissions WHERE user_id = ?
            `).get(req.user.user_id)
            
            if (userPermissions) {
                res.locals.userRole = userPermissions.role
                try {
                    res.locals.userPermissions = JSON.parse(userPermissions.permissions)
                } catch {
                    res.locals.userPermissions = {}
                }
                res.locals.isAdmin = userPermissions.role === 'admin' || 
                                    userPermissions.role === 'superadmin' || 
                                    res.locals.isOwner
            } else {
                res.locals.userRole = 'user'
                res.locals.userPermissions = {}
                res.locals.isAdmin = res.locals.isOwner
            }
        } catch (error) {
            console.error('❌ Ошибка при получении прав:', error)
            res.locals.userRole = 'user'
            res.locals.userPermissions = {}
            res.locals.isAdmin = res.locals.isOwner
        }
    } else {
        res.locals.isOwner = false
        res.locals.isAdmin = false
        res.locals.userRole = 'guest'
        res.locals.userPermissions = {}
    }
    
    next()
}

// Middleware для быстрой проверки в EJS шаблонах
export const checkPermission = (permission) => {
    return (req, res, next) => {
        res.locals.can = (perm) => {
            if (!req.isAuthenticated()) return false
            
            const BOT_OWNER_ID = process.env.BOT_OWNER_ID
            if (req.user.user_id === BOT_OWNER_ID) return true
            
            try {
                const userPermissions = dbManager.db.prepare(`
                    SELECT permissions FROM user_permissions WHERE user_id = ?
                `).get(req.user.user_id)
                
                if (!userPermissions) return false
                
                const perms = JSON.parse(userPermissions.permissions)
                return perms[perm] === true
            } catch {
                return false
            }
        }
        next()
    }
}

// Экспортируем также упрощенную версию для быстрого использования
export const simpleAdminCheck = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/auth/login')
    }

    const BOT_OWNER_ID = process.env.BOT_OWNER_ID

    if (req.user.user_id === BOT_OWNER_ID) {
        return next()
    }

    res.status(403).render('errors/403', { 
        title: 'Доступ запрещен',
        message: 'Доступ разрешен только владельцу бота'
    })
}