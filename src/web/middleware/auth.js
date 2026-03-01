// src/web/middleware/auth.js

/**
 * Middleware для проверки аутентификации
 * Перенаправляет на страницу входа, если пользователь не авторизован
 */
export function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next()
    }
    
    // Сохраняем URL, на который хотел попасть пользователь
    req.session.returnTo = req.originalUrl
    res.redirect('/auth/login')
}

/**
 * Middleware для проверки прав администратора
 * Доступ имеют: владелец бота и пользователи с ролью admin/superadmin
 */
export function isAdmin(req, res, next) {
    // Проверяем аутентификацию
    if (!req.isAuthenticated()) {
        req.session.returnTo = req.originalUrl
        return res.redirect('/auth/login')
    }
    
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID
    
    // Владелец бота имеет полный доступ
    if (req.user.user_id === BOT_OWNER_ID) {
        console.log(`✅ Владелец бота ${req.user.username} имеет доступ`)
        return next()
    }
    
    // Проверяем права пользователя из сессии (уже загружены при десериализации)
    if (req.user.permissions) {
        const role = req.user.permissions.role
        
        if (role === 'admin' || role === 'superadmin') {
            console.log(`✅ Администратор ${req.user.username} (${role}) имеет доступ`)
            return next()
        }
    }
    
    // Если ничего не подошло, пробуем проверить напрямую в БД
    try {
        const db = req.app.locals.db || global.dbManager
        
        if (db) {
            const userPerms = db.db.prepare(`
                SELECT role FROM user_permissions WHERE user_id = ?
            `).get(req.user.user_id)
            
            if (userPerms && (userPerms.role === 'admin' || userPerms.role === 'superadmin')) {
                console.log(`✅ Администратор ${req.user.username} (из БД) имеет доступ`)
                // Обновляем права в сессии
                req.user.permissions = userPerms
                return next()
            }
        }
    } catch (error) {
        console.error('❌ Ошибка при проверке прав в БД:', error)
    }
    
    console.log(`❌ Пользователь ${req.user.username} (${req.user.user_id}) не имеет прав администратора`)
    
    // Если нет прав, показываем страницу 403
    res.status(403).render('errors/403', { 
        title: 'Доступ запрещен',
        message: 'Для доступа к этой странице требуются права администратора',
        user: req.user 
    })
}

/**
 * Middleware для проверки прав суперадминистратора
 * Доступ имеют: владелец бота и пользователи с ролью superadmin
 */
export function isSuperAdmin(req, res, next) {
    // Проверяем аутентификацию
    if (!req.isAuthenticated()) {
        req.session.returnTo = req.originalUrl
        return res.redirect('/auth/login')
    }
    
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID
    
    // Владелец бота имеет полный доступ
    if (req.user.user_id === BOT_OWNER_ID) {
        console.log(`✅ Владелец бота ${req.user.username} имеет доступ`)
        return next()
    }
    
    // Проверяем права пользователя из сессии
    if (req.user.permissions && req.user.permissions.role === 'superadmin') {
        console.log(`✅ Суперадминистратор ${req.user.username} имеет доступ`)
        return next()
    }
    
    // Проверяем напрямую в БД
    try {
        const db = req.app.locals.db || global.dbManager
        
        if (db) {
            const userPerms = db.db.prepare(`
                SELECT role FROM user_permissions WHERE user_id = ?
            `).get(req.user.user_id)
            
            if (userPerms && userPerms.role === 'superadmin') {
                console.log(`✅ Суперадминистратор ${req.user.username} (из БД) имеет доступ`)
                req.user.permissions = userPerms
                return next()
            }
        }
    } catch (error) {
        console.error('❌ Ошибка при проверке прав в БД:', error)
    }
    
    console.log(`❌ Пользователь ${req.user.username} не имеет прав суперадминистратора`)
    
    // Если нет прав, показываем страницу 403
    res.status(403).render('errors/403', { 
        title: 'Доступ запрещен',
        message: 'Для доступа к этой странице требуются права суперадминистратора',
        user: req.user 
    })
}

/**
 * Middleware для добавления информации о пользователе в locals
 * Делает переменную user доступной во всех шаблонах
 */
export function attachUserInfo(req, res, next) {
    res.locals.user = req.user || null
    res.locals.isAuthenticated = req.isAuthenticated()
    
    // Добавляем информацию о правах для шаблонов
    if (req.user) {
        const BOT_OWNER_ID = process.env.BOT_OWNER_ID
        res.locals.isOwner = req.user.user_id === BOT_OWNER_ID
        res.locals.userRole = req.user.permissions?.role || 'user'
    } else {
        res.locals.isOwner = false
        res.locals.userRole = 'guest'
    }
    
    next()
}

/**
 * Middleware для API - проверка аутентификации
 * Возвращает JSON ошибку, если пользователь не авторизован
 */
export function isAuthenticatedAPI(req, res, next) {
    if (req.isAuthenticated()) {
        return next()
    }
    
    res.status(401).json({ 
        success: false, 
        error: 'Не авторизован' 
    })
}

/**
 * Middleware для API - проверка прав администратора
 * Возвращает JSON ошибку, если нет прав
 */
export function isAdminAPI(req, res, next) {
    // Проверяем аутентификацию
    if (!req.isAuthenticated()) {
        return res.status(401).json({ 
            success: false, 
            error: 'Не авторизован' 
        })
    }
    
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID
    
    // Владелец бота имеет полный доступ
    if (req.user.user_id === BOT_OWNER_ID) {
        return next()
    }
    
    // Проверяем права из сессии
    if (req.user.permissions) {
        const role = req.user.permissions.role
        if (role === 'admin' || role === 'superadmin') {
            return next()
        }
    }
    
    // Проверяем в БД
    try {
        const db = req.app.locals.db || global.dbManager
        
        if (db) {
            const userPerms = db.db.prepare(`
                SELECT role FROM user_permissions WHERE user_id = ?
            `).get(req.user.user_id)
            
            if (userPerms && (userPerms.role === 'admin' || userPerms.role === 'superadmin')) {
                req.user.permissions = userPerms
                return next()
            }
        }
    } catch (error) {
        console.error('❌ Ошибка при проверке прав API:', error)
    }
    
    res.status(403).json({ 
        success: false, 
        error: 'Требуются права администратора' 
    })
}

/**
 * Middleware для API - проверка прав суперадминистратора
 * Возвращает JSON ошибку, если нет прав
 */
export function isSuperAdminAPI(req, res, next) {
    // Проверяем аутентификацию
    if (!req.isAuthenticated()) {
        return res.status(401).json({ 
            success: false, 
            error: 'Не авторизован' 
        })
    }
    
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID
    
    // Владелец бота имеет полный доступ
    if (req.user.user_id === BOT_OWNER_ID) {
        return next()
    }
    
    // Проверяем права из сессии
    if (req.user.permissions && req.user.permissions.role === 'superadmin') {
        return next()
    }
    
    // Проверяем в БД
    try {
        const db = req.app.locals.db || global.dbManager
        
        if (db) {
            const userPerms = db.db.prepare(`
                SELECT role FROM user_permissions WHERE user_id = ?
            `).get(req.user.user_id)
            
            if (userPerms && userPerms.role === 'superadmin') {
                req.user.permissions = userPerms
                return next()
            }
        }
    } catch (error) {
        console.error('❌ Ошибка при проверке прав API:', error)
    }
    
    res.status(403).json({ 
        success: false, 
        error: 'Требуются права суперадминистратора' 
    })
}

/**
 * Middleware для логирования действий администраторов
 */
export function logAdminAction(req, res, next) {
    // Запоминаем время начала запроса
    const start = Date.now()
    
    // Запоминаем оригинальный метод json
    const originalJson = res.json
    
    // Переопределяем метод json
    res.json = function(data) {
        // Вычисляем время выполнения
        const duration = Date.now() - start
        
        // Логируем действие, если оно успешное и пользователь админ
        if (data && data.success && req.user) {
            const db = req.app.locals.db || global.dbManager
            if (db) {
                const action = `${req.method} ${req.originalUrl}`
                const details = JSON.stringify({
                    params: req.params,
                    query: req.query,
                    body: req.body,
                    duration: `${duration}ms`
                })
                
                db.addLog(
                    req.user.user_id,
                    action,
                    details,
                    req.ip
                ).catch(err => console.error('Ошибка при логировании:', err))
                
                console.log(`📝 Лог: ${req.user.username} - ${action} - ${duration}ms`)
            }
        }
        
        // Вызываем оригинальный метод
        return originalJson.call(this, data)
    }
    
    next()
}

/**
 * Middleware для проверки прав на просмотр конкретной заявки
 */
export function canViewApplication(req, res, next) {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, error: 'Не авторизован' })
    }
    
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID
    
    // Владелец может всё
    if (req.user.user_id === BOT_OWNER_ID) {
        return next()
    }
    
    // Администраторы могут всё
    if (req.user.permissions && (req.user.permissions.role === 'admin' || req.user.permissions.role === 'superadmin')) {
        return next()
    }
    
    // Обычные пользователи могут видеть только свои заявки
    const applicationId = req.params.id
    
    if (!applicationId) {
        return res.status(400).json({ success: false, error: 'ID заявки не указан' })
    }
    
    try {
        const db = req.app.locals.db || global.dbManager
        const application = db.db.prepare(`
            SELECT user_id FROM applications WHERE id = ?
        `).get(applicationId)
        
        if (application && application.user_id === req.user.user_id) {
            return next()
        }
    } catch (error) {
        console.error('Ошибка при проверке доступа к заявке:', error)
    }
    
    res.status(403).json({ 
        success: false, 
        error: 'У вас нет доступа к этой заявке' 
    })
}

// Экспортируем все middleware как объект для удобства
export default {
    isAuthenticated,
    isAdmin,
    isSuperAdmin,
    attachUserInfo,
    isAuthenticatedAPI,
    isAdminAPI,
    isSuperAdminAPI,
    logAdminAction,
    canViewApplication
}