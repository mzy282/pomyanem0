// src/web/server.js
import dotenv from 'dotenv'
import express from 'express'
import session from 'express-session'
import passport from 'passport'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import csrf from 'csurf'
import SQLiteStore from 'connect-sqlite3'
import { createServer } from 'http'
import { Server } from 'socket.io'
import fs from 'fs'

// ВАЖНО: импортируем конфигурацию passport ДО ВСЕГО
import './config/passport.js'

import dbManager from '../database/index.js'
import { 
    isAuthenticated, 
    isAdmin, 
    isSuperAdmin, 
    attachUserInfo,
    isAuthenticatedAPI,
    isAdminAPI 
} from './middleware/auth.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SQLiteStoreSession = SQLiteStore(session)

class WebServer {
    constructor(port = 3000) {
        this.port = port
        this.app = express()
        this.server = createServer(this.app)
        this.io = null
        this.updateInterval = null
        this.cacheUpdateInterval = null
        this.voiceUpdateInterval = null
        this.lastStats = null
        this.lastUpdateTime = 0
        this.lastVoiceUpdateTime = 0
        this.isUpdating = false
        
        // Кэш для данных
        this.cache = {
            applications: {
                data: null,
                timestamp: 0,
                ttl: 30000 // 30 секунд
            },
            members: {
                data: null,
                timestamp: 0,
                ttl: 60000 // 1 минута
            },
            admins: {
                data: null,
                timestamp: 0,
                ttl: 300000 // 5 минут
            },
            stats: {
                data: null,
                timestamp: 0,
                ttl: 30000 // 30 секунд
            }
        }
        
        this.setupMiddleware()
        this.setupRoutes()
        this.setupWebSocket()
        this.setupVoiceUpdateInterval()
        this.setupCacheUpdateInterval()
        
        // Делаем io доступным глобально
        global.io = this.io
        
        console.log('✅ Веб-сервер инициализирован')
    }
    
    setupMiddleware() {
        // Безопасность
        this.app.use(helmet({ 
            contentSecurityPolicy: false,
            crossOriginEmbedderPolicy: false
        }))
        
        // CORS
        this.app.use(cors({
            origin: process.env.WEB_URL || 'http://localhost:3000',
            credentials: true
        }))
        
        // Парсинг тела запроса
        this.app.use(express.json({ limit: '10mb' }))
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }))
        
        // Статические файлы
        this.app.use(express.static(join(__dirname, 'public')))
        
        // Сессии
        const sessionConfig = {
            store: new SQLiteStoreSession({
                db: 'sessions.sqlite',
                dir: join(__dirname, '../../data'),
                concurrentDB: true
            }),
            secret: process.env.SESSION_SECRET || 'kingsize-secret-key',
            resave: false,
            saveUninitialized: false,
            cookie: {
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 дней
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax'
            },
            name: 'kingsize.sid',
            rolling: true
        }
        
        this.app.use(session(sessionConfig))
        
        // Passport
        this.app.use(passport.initialize())
        this.app.use(passport.session())
        
        // Добавляем информацию о пользователе во все шаблоны
        this.app.use(attachUserInfo)
        
        // Rate limiting для API
        const apiLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 минут
            max: 200,
            message: { success: false, error: 'Слишком много запросов' },
            standardHeaders: true,
            legacyHeaders: false,
            skip: (req) => req.path === '/api/health'
        })
        this.app.use('/api/', apiLimiter)
        
        // CSRF защита
        const csrfProtection = csrf({ cookie: false })
        this.app.use((req, res, next) => {
            if (req.path.startsWith('/api/') || 
                req.path.startsWith('/auth/') || 
                req.path.startsWith('/socket.io/') ||
                req.method === 'GET') {
                return next()
            }
            csrfProtection(req, res, next)
        })
        
        // Локальные переменные для шаблонов
        this.app.use((req, res, next) => {
            res.locals.csrfToken = req.csrfToken ? req.csrfToken() : null
            res.locals.currentUrl = req.originalUrl
            res.locals.env = { 
                BOT_OWNER_ID: process.env.BOT_OWNER_ID,
                NODE_ENV: process.env.NODE_ENV,
                WEB_URL: process.env.WEB_URL || 'http://localhost:3000',
                MEMBER_ROLE_ID: process.env.MEMBER_ROLE_ID
            }
            res.locals.user = req.user || null
            next()
        })
        
        // Настройка шаблонизатора
        this.app.set('view engine', 'ejs')
        this.app.set('views', join(__dirname, 'views'))
        
        // Логирование запросов
        if (process.env.NODE_ENV !== 'production') {
            this.app.use((req, res, next) => {
                console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`)
                next()
            })
        }
    }
    
    setupWebSocket() {
        this.io = new Server(this.server, {
            cors: {
                origin: process.env.WEB_URL || 'http://localhost:3000',
                credentials: true
            },
            pingTimeout: 60000,
            pingInterval: 25000
        })
        
        this.io.on('connection', (socket) => {
            console.log('🔌 Клиент подключен к WebSocket')
            
            socket.on('subscribe_applications', () => {
                socket.join('applications-room')
                console.log('📋 Клиент подписан на обновления заявок')
            })
            
            socket.on('subscribe_members', () => {
                socket.join('members-room')
                console.log('👥 Клиент подписан на обновления членов семьи')
            })
            
            socket.on('subscribe_stats', () => {
                socket.join('stats-room')
                console.log('📊 Клиент подписан на обновления статистики')
            })
            
            socket.on('subscribe_archive', () => {
                socket.join('archive-room')
                console.log('📦 Клиент подписан на обновления архива')
            })
            
            socket.on('disconnect', () => {
                console.log('🔌 Клиент отключен от WebSocket')
            })
        })
    }
    
    setupVoiceUpdateInterval() {
        this.voiceUpdateInterval = setInterval(() => {
            // Для голосовых обновлений
        }, 10000)
    }
    
    setupCacheUpdateInterval() {
        this.cacheUpdateInterval = setInterval(() => {
            const now = Date.now()
            for (const [key, cacheItem] of Object.entries(this.cache)) {
                if (cacheItem.data && (now - cacheItem.timestamp) > cacheItem.ttl) {
                    cacheItem.data = null
                }
            }
        }, 60000)
    }
    
    async getStatsWithCache() {
        const now = Date.now()
        
        if (this.cache.stats.data && (now - this.cache.stats.timestamp) < this.cache.stats.ttl) {
            return { success: true, stats: this.cache.stats.data }
        }
        
        try {
            const appStats = dbManager.db.prepare(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'pending' AND is_archived = 0 THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN status = 'accepted' AND is_archived = 0 THEN 1 ELSE 0 END) as accepted,
                    SUM(CASE WHEN status = 'interview' AND is_archived = 0 THEN 1 ELSE 0 END) as interview,
                    SUM(CASE WHEN status = 'rejected' AND is_archived = 0 THEN 1 ELSE 0 END) as rejected
                FROM applications
            `).get()
            
            const membersCount = dbManager.db.prepare(`
                SELECT COUNT(*) as count FROM family_members
            `).get()
            
            const adminsCount = dbManager.db.prepare(`
                SELECT COUNT(*) as count FROM user_permissions 
                WHERE role IN ('admin', 'superadmin')
            `).get()
            
            const stats = {
                applications: appStats || {
                    total: 0, pending: 0, accepted: 0, interview: 0, rejected: 0
                },
                members: membersCount?.count || 0,
                admins: adminsCount?.count || 0,
                uptime: global.discordClient?.stats?.startTime 
                    ? Math.floor((Date.now() - global.discordClient.stats.startTime) / 1000)
                    : 0,
                commandsExecuted: global.discordClient?.stats?.commandsExecuted || 0
            }
            
            this.cache.stats.data = stats
            this.cache.stats.timestamp = now
            
            if (this.io) {
                this.io.to('stats-room').emit('stats_update', stats)
            }
            
            return { success: true, stats }
            
        } catch (error) {
            console.error('❌ Ошибка при получении статистики:', error)
            return { success: false, error: error.message }
        }
    }
    
    setupRoutes() {
        // ==================== ПУБЛИЧНЫЕ МАРШРУТЫ ====================
        this.app.get('/', (req, res) => {
            res.render('index', { 
                title: 'Главная',
                user: req.user || null,
                activePage: 'home',
                currentUrl: '/'
            })
        })
        
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'ok', 
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            })
        })
        
        // ==================== МАРШРУТЫ АВТОРИЗАЦИИ ====================
        this.app.get('/auth/login', (req, res) => {
            res.render('auth/login-simple', { 
                error: req.query.error,
                title: 'Вход'
            })
        })
        
        this.app.get('/auth/discord', 
            passport.authenticate('discord', { 
                scope: ['identify', 'email', 'guilds'],
                prompt: 'none'
            })
        )
        
        this.app.get('/auth/discord/callback',
            passport.authenticate('discord', { 
                failureRedirect: '/auth/login?error=auth_failed',
                failureMessage: true 
            }),
            (req, res) => {
                console.log(`✅ Успешный вход: ${req.user?.username}`)
                
                const BOT_OWNER_ID = process.env.BOT_OWNER_ID
                
                if (req.user.user_id === BOT_OWNER_ID) {
                    console.log('👑 Владелец бота вошел в систему')
                    const returnTo = req.session.returnTo || '/dashboard'
                    delete req.session.returnTo
                    return res.redirect(returnTo)
                }
                
                const userPermissions = dbManager.db.prepare(`
                    SELECT role FROM user_permissions WHERE user_id = ?
                `).get(req.user.user_id)
                
                if (userPermissions && (userPermissions.role === 'admin' || userPermissions.role === 'superadmin')) {
                    console.log(`🛡️ Администратор ${req.user.username} вошел в систему`)
                    const returnTo = req.session.returnTo || '/dashboard'
                    delete req.session.returnTo
                    return res.redirect(returnTo)
                }
                
                console.log(`❌ Пользователь ${req.user.username} не имеет прав доступа`)
                req.logout((err) => {
                    if (err) console.error('Ошибка при logout:', err)
                    res.redirect('/auth/login?error=access_denied')
                })
            }
        )
        
        this.app.get('/auth/logout', (req, res) => {
            req.logout(() => {
                res.redirect('/')
            })
        })
        
        // ==================== ЗАЩИЩЕННЫЕ МАРШРУТЫ ===================
        this.app.get('/dashboard', isAuthenticated, (req, res) => {
            res.render('dashboard/dashboard', { 
                title: 'Панель управления',
                activePage: 'dashboard',
                user: req.user,
                env: process.env
            })
        })
                
        // ==================== АДМИН-ПАНЕЛЬ ====================
        this.app.get('/admin', isAdmin, (req, res) => {
            res.render('admin/index', { 
                title: 'Админ-панель',
                activePage: 'admin',
                user: req.user,
                env: process.env
            })
        })

        this.app.get('/admin/applications', isAdmin, (req, res) => {
            res.render('admin/applications', { 
                title: 'Заявки в семью',
                activePage: 'applications',
                user: req.user,
                env: process.env
            })
        })

        this.app.get('/admin/members', isAdmin, (req, res) => {
            res.render('admin/members', { 
                title: 'Члены семьи',
                activePage: 'members',
                user: req.user,
                env: process.env
            })
        })

        this.app.get('/admin/archive', isAdmin, (req, res) => {
            res.render('admin/archive', { 
                title: 'Архив заявок',
                activePage: 'archive',
                user: req.user,
                env: process.env
            })
        })

        this.app.get('/admin/excluded', isAdmin, (req, res) => {
            res.render('admin/excluded', { 
                title: 'Исключенные',
                activePage: 'excluded',
                user: req.user,
                env: process.env
            })
        })

        this.app.get('/admin/bot-settings', isSuperAdmin, (req, res) => {
            res.render('admin/bot-settings', { 
                title: 'Настройки бота',
                activePage: 'bot-settings',
                user: req.user,
                env: process.env
            })
        })
        
        // ==================== API МАРШРУТЫ ====================
        this.app.get('/api/user/info', isAuthenticatedAPI, (req, res) => {
            const BOT_OWNER_ID = process.env.BOT_OWNER_ID
            res.json({
                success: true,
                data: {
                    id: req.user.user_id,
                    username: req.user.username,
                    avatar: req.user.avatar_url,
                    isOwner: req.user.user_id === BOT_OWNER_ID,
                    role: req.user.permissions?.role || 'user'
                }
            })
        })
        
        this.app.get('/api/stats', isAuthenticatedAPI, async (req, res) => {
            const result = await this.getStatsWithCache()
            res.json(result)
        })
        
        // ==================== API ДЛЯ АДМИНОВ ====================
        this.app.get('/api/admin/admins', isAdminAPI, (req, res) => {
            try {
                const admins = dbManager.db.prepare(`
                    SELECT up.user_id, up.role, up.permissions, up.granted_at, up.updated_at,
                           u.username, u.avatar_url
                    FROM user_permissions up
                    LEFT JOIN users u ON u.user_id = up.user_id
                    WHERE up.role IN ('admin', 'superadmin')
                    ORDER BY 
                        CASE up.role 
                            WHEN 'superadmin' THEN 1 
                            WHEN 'admin' THEN 2 
                            ELSE 3 
                        END,
                        up.updated_at DESC
                `).all()
                
                res.json({ success: true, data: admins })
            } catch (error) {
                console.error('❌ Ошибка при получении администраторов:', error)
                res.status(500).json({ success: false, error: error.message })
            }
        })
        
        this.app.post('/api/admin/admins', isSuperAdmin, (req, res) => {
            try {
                const { userId, username } = req.body
                
                if (!userId) {
                    return res.status(400).json({ success: false, error: 'Не указан ID пользователя' })
                }
                
                let user = dbManager.getUserById(userId)
                
                if (!user) {
                    dbManager.createUser(userId, username || 'Unknown', '0000', null, null, null, null)
                }
                
                const existing = dbManager.db.prepare(`
                    SELECT role FROM user_permissions WHERE user_id = ?
                `).get(userId)
                
                if (existing) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'Пользователь уже является администратором' 
                    })
                }
                
                const permissions = {
                    canViewDashboard: true,
                    canManageUsers: true,
                    canManageGuilds: true,
                    canManageApplications: true,
                    canViewLogs: true
                }
                
                dbManager.db.prepare(`
                    INSERT INTO user_permissions (user_id, role, permissions, granted_by, granted_at)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                `).run(userId, 'admin', JSON.stringify(permissions), req.user.user_id)
                
                this.cache.admins.data = null
                
                res.json({ success: true, message: 'Администратор добавлен' })
            } catch (error) {
                console.error('❌ Ошибка при добавлении администратора:', error)
                res.status(500).json({ success: false, error: error.message })
            }
        })
        
        this.app.delete('/api/admin/admins', isSuperAdmin, (req, res) => {
            try {
                const { userId } = req.body
                
                if (!userId) {
                    return res.status(400).json({ success: false, error: 'Не указан ID пользователя' })
                }
                
                if (userId === req.user.user_id) {
                    return res.status(400).json({ success: false, error: 'Нельзя удалить самого себя' })
                }
                
                const result = dbManager.db.prepare(`
                    DELETE FROM user_permissions WHERE user_id = ? AND role != 'superadmin'
                `).run(userId)
                
                if (result.changes > 0) {
                    this.cache.admins.data = null
                    res.json({ success: true, message: 'Администратор удален' })
                } else {
                    res.status(404).json({ success: false, error: 'Администратор не найден' })
                }
            } catch (error) {
                console.error('❌ Ошибка при удалении администратора:', error)
                res.status(500).json({ success: false, error: error.message })
            }
        })

        // ==================== АРХИВ ЗАЯВОК ====================
        this.app.get('/api/admin/applications/archived', isAdminAPI, (req, res) => {
            console.log('📦 API: Запрос архивных заявок');
            
            try {
                const applications = dbManager.db.prepare(`
                    SELECT * FROM applications WHERE is_archived = 1 ORDER BY archived_at DESC, created_at DESC
                `).all();
                
                console.log(`📦 Найдено заявок в архиве: ${applications.length}`);
                
                res.json({ 
                    success: true, 
                    data: applications 
                });
                
            } catch (error) {
                console.error('❌ Ошибка при получении архива:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ==================== API ДЛЯ ЗАЯВОК ====================
        this.app.get('/api/admin/applications', isAdminAPI, (req, res) => {
            try {
                const { status, limit = 100, offset = 0 } = req.query
                let query = 'SELECT * FROM applications WHERE is_archived = 0'
                const params = []
                
                if (status && status !== 'all') {
                    query += ' AND status = ?'
                    params.push(status)
                }
                
                query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
                params.push(parseInt(limit), parseInt(offset))
                
                const applications = dbManager.db.prepare(query).all(...params)
                
                let countQuery = 'SELECT COUNT(*) as total FROM applications WHERE is_archived = 0'
                if (status && status !== 'all') {
                    countQuery += ' AND status = ?'
                }
                const total = dbManager.db.prepare(countQuery).all(...(status && status !== 'all' ? [status] : []))[0].total
                
                res.json({ 
                    success: true, 
                    data: applications,
                    pagination: {
                        total,
                        limit: parseInt(limit),
                        offset: parseInt(offset),
                        hasMore: total > parseInt(offset) + parseInt(limit)
                    }
                })
            } catch (error) {
                console.error('❌ Ошибка при получении заявок:', error)
                res.status(500).json({ success: false, error: error.message })
            }
        })

        this.app.get('/api/admin/applications/stats', isAdminAPI, (req, res) => {
            try {
                const stats = dbManager.db.prepare(`
                    SELECT 
                        COUNT(*) as total,
                        SUM(CASE WHEN status = 'pending' AND is_archived = 0 THEN 1 ELSE 0 END) as pending,
                        SUM(CASE WHEN status = 'accepted' AND is_archived = 0 THEN 1 ELSE 0 END) as accepted,
                        SUM(CASE WHEN status = 'interview' AND is_archived = 0 THEN 1 ELSE 0 END) as interview,
                        SUM(CASE WHEN status = 'rejected' AND is_archived = 0 THEN 1 ELSE 0 END) as rejected
                    FROM applications
                `).get()
                
                const today = new Date().toISOString().split('T')[0]
                const todayStats = dbManager.db.prepare(`
                    SELECT COUNT(*) as count FROM applications 
                    WHERE date(created_at) = date(?) AND is_archived = 0
                `).get(today)
                
                const formattedStats = {
                    total: stats.total || 0,
                    pending: stats.pending || 0,
                    accepted: stats.accepted || 0,
                    interview: stats.interview || 0,
                    rejected: stats.rejected || 0,
                    today: todayStats?.count || 0
                }
                
                res.json({ success: true, data: formattedStats })
            } catch (error) {
                console.error('❌ Ошибка при получении статистики заявок:', error)
                res.status(500).json({ success: false, error: error.message })
            }
        })

        this.app.get('/api/admin/applications/:id', isAdminAPI, (req, res) => {
            try {
                const { id } = req.params
                
                const application = dbManager.db.prepare(`
                    SELECT * FROM applications WHERE id = ?
                `).get(id)
                
                if (!application) {
                    return res.status(404).json({ success: false, error: 'Заявка не найдена' })
                }
                
                res.json({ success: true, data: application })
            } catch (error) {
                console.error('❌ Ошибка при получении заявки:', error)
                res.status(500).json({ success: false, error: error.message })
            }
        })

        this.app.post('/api/admin/applications/:id/status', isAdminAPI, (req, res) => {
            try {
                const { id } = req.params
                const { status, reason } = req.body
                
                if (!['pending', 'accepted', 'interview', 'rejected'].includes(status)) {
                    return res.status(400).json({ success: false, error: 'Неверный статус' })
                }
                
                const application = dbManager.db.prepare(`
                    SELECT * FROM applications WHERE id = ?
                `).get(id)
                
                if (!application) {
                    return res.status(404).json({ success: false, error: 'Заявка не найдена' })
                }
                
                dbManager.db.prepare(`
                    UPDATE applications 
                    SET status = ?, 
                        reviewed_by = ?, 
                        reviewed_at = CURRENT_TIMESTAMP,
                        reject_reason = ?,
                        was_accepted = CASE WHEN ? = 'accepted' THEN 1 ELSE was_accepted END
                    WHERE id = ? AND is_archived = 0
                `).run(status, req.user.user_id, reason || null, status, id)
                
                this.cache.applications.data = null
                
                if (this.io) {
                    this.io.to('applications-room').emit('application_updated', { 
                        id, 
                        status,
                        reviewed_by: req.user.user_id
                    })
                }
                
                res.json({ success: true, message: 'Статус заявки обновлен' })
            } catch (error) {
                console.error('❌ Ошибка при обновлении статуса заявки:', error)
                res.status(500).json({ success: false, error: error.message })
            }
        })

        // ==================== ЭНДПОИНТ ДЛЯ ПРИНЯТИЯ ЗАЯВКИ ====================
        this.app.post('/api/admin/applications/:id/accept', isAdminAPI, async (req, res) => {
            console.log('\n' + '='.repeat(70))
            console.log('🌐 ВЕБ-ЗАПРОС: ПРИНЯТИЕ ЗАЯВКИ')
            console.log('='.repeat(70))
            
            try {
                const { id } = req.params
                const { nick, static: staticVal } = req.body
                
                console.log(`📋 Данные запроса:`)
                console.log(`   • ID заявки: ${id}`)
                console.log(`   • Nick: ${nick}`)
                console.log(`   • Static: ${staticVal}`)
                console.log(`   • Администратор: ${req.user?.username} (${req.user?.user_id})`)

                // Валидация
                if (!nick || !nick.trim()) {
                    return res.status(400).json({ success: false, error: 'Nick обязателен' })
                }
                if (!staticVal || !staticVal.trim()) {
                    return res.status(400).json({ success: false, error: 'Static обязателен' })
                }

                // Проверяем существование заявки
                const application = dbManager.db.prepare(`
                    SELECT * FROM applications WHERE id = ?
                `).get(id)
                
                if (!application) {
                    return res.status(404).json({ success: false, error: 'Заявка не найдена' })
                }

                // Проверяем, не принята ли уже заявка
                if (application.status === 'accepted') {
                    return res.status(400).json({ success: false, error: 'Заявка уже принята' })
                }

                // Проверяем глобальную функцию
                if (typeof global.acceptApplication !== 'function') {
                    console.error('❌ global.acceptApplication не найдена!')
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Внутренняя ошибка сервера: функция acceptApplication не найдена' 
                    })
                }

                // Вызываем функцию принятия заявки из бота
                console.log('\n🔍 Вызов global.acceptApplication...')
                const result = await global.acceptApplication(req, id, nick.trim(), staticVal.trim())
                
                console.log(`\n📊 Результат:`, result)

                // Отправляем ответ
                if (result.success) {
                    // Очищаем кэш
                    this.cache.applications.data = null
                    this.cache.members.data = null
                    
                    // Получаем обновленные данные заявки
                    const updatedApplication = dbManager.db.prepare(`
                        SELECT * FROM applications WHERE id = ?
                    `).get(id)
                    
                    // WebSocket уведомление
                    if (this.io) {
                        this.io.to('applications-room').emit('application_updated', { 
                            id, 
                            status: 'accepted'
                        })
                        
                        // Получаем данные участника для отправки в members-room
                        const member = dbManager.db.prepare(`
                            SELECT * FROM family_members WHERE user_id = ?
                        `).get(application.user_id)
                        
                        if (member) {
                            this.io.to('members-room').emit('member_added', member)
                        }
                    }
                    
                    const message = result.warning 
                        ? `Заявка принята, но ${result.warning}`
                        : 'Заявка принята, участник добавлен в семью'
                    
                    console.log(`\n✅ УСПЕХ: ${message}`)
                    console.log('='.repeat(70) + '\n')
                    
                    res.json({ 
                        success: true, 
                        message, 
                        warning: result.warning,
                        data: updatedApplication
                    })
                } else {
                    console.error(`\n❌ ОШИБКА: ${result.error}`)
                    console.log('='.repeat(70) + '\n')
                    
                    res.status(500).json({ 
                        success: false, 
                        error: result.error || 'Ошибка при принятии заявки' 
                    })
                }

            } catch (error) {
                console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА В ЭНДПОИНТЕ:')
                console.error(error)
                console.log('='.repeat(70) + '\n')
                
                res.status(500).json({ 
                    success: false, 
                    error: 'Внутренняя ошибка сервера' 
                })
            }
        })

        // ==================== ТЕСТОВЫЙ ЭНДПОИНТ ====================
        this.app.get('/api/test', isAdminAPI, (req, res) => {
            console.log('🧪 ТЕСТ: Запрос получен');
            res.json({ success: true, message: 'Тест работает', user: req.user?.username });
        });

        // ==================== ЭНДПОИНТ ДЛЯ АРХИВАЦИИ ====================
        this.app.post('/api/admin/applications/:id/archive', isAdminAPI, (req, res) => {
            try {
                const { id } = req.params;
                
                console.log(`📦 Запрос на архивацию заявки #${id}`);
                
                // Получаем заявку
                const application = dbManager.db.prepare(`
                    SELECT * FROM applications WHERE id = ?
                `).get(id);
                
                if (!application) {
                    return res.status(404).json({ success: false, error: 'Заявка не найдена' });
                }
                
                // Проверяем, не в архиве ли уже
                if (application.is_archived === 1) {
                    return res.status(400).json({ success: false, error: 'Заявка уже в архиве' });
                }
                
                // Просто помечаем заявку как архивную, НЕ трогаем family_members
                dbManager.db.prepare(`
                    UPDATE applications 
                    SET is_archived = 1,
                        archived_by = ?,
                        archived_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(req.user.user_id, id);
                
                // Очищаем кэш
                this.cache.applications.data = null;
                
                // Отправляем WebSocket уведомления
                if (this.io) {
                    this.io.to('applications-room').emit('application_archived', { 
                        id, 
                        status: application.status 
                    });
                    this.io.to('archive-room').emit('archive_updated', { 
                        id, 
                        status: application.status 
                    });
                }
                
                console.log(`✅ Заявка #${id} отправлена в архив (участник остался в семье)`);
                res.json({ 
                    success: true, 
                    message: 'Заявка отправлена в архив' 
                });
                
            } catch (error) {
                console.error('❌ Ошибка при архивации заявки:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ==================== ЭНДПОИНТ ДЛЯ ВОССТАНОВЛЕНИЯ ИЗ АРХИВА ====================
        this.app.post('/api/admin/applications/:id/restore', isAdminAPI, (req, res) => {
            try {
                const { id } = req.params;
                
                const application = dbManager.db.prepare(`
                    SELECT * FROM applications WHERE id = ?
                `).get(id);
                
                if (!application) {
                    return res.status(404).json({ success: false, error: 'Заявка не найдена' });
                }
                
                // Восстанавливаем заявку
                dbManager.db.prepare(`
                    UPDATE applications 
                    SET status = 'pending',
                        reviewed_by = NULL,
                        reviewed_at = NULL,
                        reject_reason = NULL,
                        was_accepted = 0,
                        is_archived = 0
                    WHERE id = ?
                `).run(id);
                
                // Если заявка была принята, удаляем из family_members
                if (application.status === 'accepted') {
                    dbManager.db.prepare(`
                        DELETE FROM family_members WHERE user_id = ?
                    `).run(application.user_id);
                }
                
                if (this.io) {
                    this.io.to('applications-room').emit('application_restored', { id });
                    this.io.to('archive-room').emit('archive_updated', { id });
                }
                
                res.json({ success: true, message: 'Заявка восстановлена' });
                
            } catch (error) {
                console.error('❌ Ошибка при восстановлении заявки:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ==================== ЭНДПОИНТ ДЛЯ ОТПРАВКИ ПРИГЛАШЕНИЯ ====================
        this.app.post('/api/admin/applications/:id/send-interview', isAdmin, async (req, res) => {
            try {
                const { id } = req.params
                
                console.log(`📞 Отправка приглашения на обзвон для заявки #${id}`)

                const application = dbManager.db.prepare(`
                    SELECT * FROM applications WHERE id = ?
                `).get(id)
                
                if (!application) {
                    return res.status(404).json({ success: false, error: 'Заявка не найдена' })
                }

                const user = await global.discordClient.users.fetch(application.user_id)
                if (!user) {
                    return res.status(404).json({ success: false, error: 'Пользователь не найден' })
                }

                const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js')

                const embed = new EmbedBuilder()
                    .setColor(0x8B5CF6)
                    .setTitle('📞 Приглашение на обзвон в семью KINGSIZE')
                    .setDescription(`Здравствуйте, **${application.username}**!\n\nВаша заявка предварительно одобрена. Вам необходимо пройти обзвон.`)
                    .addFields(
                        { name: '📝 Номер заявки', value: `#${application.id}`, inline: true },
                        { name: '🎯 Что дальше?', value: 'С вами свяжется администратор', inline: true },
                        { name: '⏰ Требования', value: '• Будьте в Discord\n• Проверьте настройки приватности\n• Приготовьте микрофон' }
                    )
                    .setTimestamp()

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`confirm_interview_${application.id}`)
                            .setLabel('✅ Я готов')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId(`cancel_interview_${application.id}`)
                            .setLabel('❌ Отказаться')
                            .setStyle(ButtonStyle.Danger)
                    )

                await user.send({ embeds: [embed], components: [row] })
                console.log(`✅ Приглашение отправлено пользователю ${application.username}`)

                res.json({ success: true, message: 'Приглашение отправлено' })

            } catch (error) {
                console.error('❌ Ошибка при отправке приглашения:', error)
                res.status(500).json({ success: false, error: error.message })
            }
        })

        // ==================== API ДЛЯ ЧЛЕНОВ СЕМЬИ ====================
        
        // Получение списка членов семьи
        this.app.get('/api/admin/family-members', isAdminAPI, (req, res) => {
            console.log('👥 API: Запрос списка членов семьи');
            
            try {
                // Проверяем кэш
                const now = Date.now();
                if (this.cache.members.data && (now - this.cache.members.timestamp) < this.cache.members.ttl) {
                    console.log('📦 Возвращаем данные из кэша');
                    return res.json({
                        success: true,
                        data: this.cache.members.data,
                        cached: true
                    });
                }
                
                // Проверяем, существует ли таблица member_profiles
                const tableExists = dbManager.db.prepare(`
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name='member_profiles'
                `).get();
                
                let query;
                if (tableExists) {
                    query = `
                        SELECT 
                            fm.*,
                            COALESCE(mp.real_name, '') as real_name,
                            COALESCE(mp.birth_date, '') as birth_date,
                            COALESCE(mp.tier, 3) as tier,
                            COALESCE(mp.notes, '') as profile_notes,
                            a.reviewed_by,
                            a.reviewed_at,
                            u.username as reviewer_name
                        FROM family_members fm
                        LEFT JOIN member_profiles mp ON fm.user_id = mp.user_id
                        LEFT JOIN applications a ON fm.user_id = a.user_id AND a.status = 'accepted'
                        LEFT JOIN users u ON a.reviewed_by = u.user_id
                        ORDER BY fm.joined_at DESC
                    `;
                } else {
                    query = `
                        SELECT 
                            fm.*,
                            '' as real_name,
                            '' as birth_date,
                            3 as tier,
                            '' as profile_notes,
                            a.reviewed_by,
                            a.reviewed_at,
                            u.username as reviewer_name
                        FROM family_members fm
                        LEFT JOIN applications a ON fm.user_id = a.user_id AND a.status = 'accepted'
                        LEFT JOIN users u ON a.reviewed_by = u.user_id
                        ORDER BY fm.joined_at DESC
                    `;
                }
                
                const members = dbManager.db.prepare(query).all();
                
                console.log(`✅ Найдено членов семьи: ${members.length}`);
                
                // Сохраняем в кэш
                this.cache.members.data = members;
                this.cache.members.timestamp = now;
                
                res.json({
                    success: true,
                    data: members
                });
            } catch (error) {
                console.error('❌ Ошибка загрузки членов семьи:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Получение информации о конкретном члене семьи
        this.app.get('/api/admin/family-members/:userId', isAdminAPI, (req, res) => {
            console.log('👤 API: Запрос информации о члене семьи');
            
            try {
                const { userId } = req.params;
                
                // Проверяем, существует ли таблица member_profiles
                const tableExists = dbManager.db.prepare(`
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name='member_profiles'
                `).get();
                
                let query;
                if (tableExists) {
                    query = `
                        SELECT 
                            fm.*,
                            COALESCE(mp.real_name, '') as real_name,
                            COALESCE(mp.birth_date, '') as birth_date,
                            COALESCE(mp.tier, 3) as tier,
                            COALESCE(mp.notes, '') as profile_notes,
                            a.reviewed_by,
                            a.reviewed_at,
                            u.username as reviewer_name
                        FROM family_members fm
                        LEFT JOIN member_profiles mp ON fm.user_id = mp.user_id
                        LEFT JOIN applications a ON fm.user_id = a.user_id AND a.status = 'accepted'
                        LEFT JOIN users u ON a.reviewed_by = u.user_id
                        WHERE fm.user_id = ?
                    `;
                } else {
                    query = `
                        SELECT 
                            fm.*,
                            '' as real_name,
                            '' as birth_date,
                            3 as tier,
                            '' as profile_notes,
                            a.reviewed_by,
                            a.reviewed_at,
                            u.username as reviewer_name
                        FROM family_members fm
                        LEFT JOIN applications a ON fm.user_id = a.user_id AND a.status = 'accepted'
                        LEFT JOIN users u ON a.reviewed_by = u.user_id
                        WHERE fm.user_id = ?
                    `;
                }
                
                const member = dbManager.db.prepare(query).get(userId);
                
                if (!member) {
                    return res.status(404).json({
                        success: false,
                        error: 'Участник не найден'
                    });
                }
                
                res.json({
                    success: true,
                    data: member
                });
                
            } catch (error) {
                console.error('❌ Ошибка получения информации об участнике:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Получение статистики по членам семьи
        this.app.get('/api/admin/family-members/stats', isAdminAPI, (req, res) => {
            console.log('📊 API: Запрос статистики членов семьи');
            
            try {
                const total = dbManager.db.prepare(`
                    SELECT COUNT(*) as count FROM family_members
                `).get();
                
                const oneMonthAgo = new Date();
                oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
                const oneMonthAgoStr = oneMonthAgo.toISOString();
                
                const newMembers = dbManager.db.prepare(`
                    SELECT COUNT(*) as count FROM family_members 
                    WHERE joined_at > ?
                `).get(oneMonthAgoStr);
                
                const stats = {
                    total: total?.count || 0,
                    new: newMembers?.count || 0
                };
                
                res.json({
                    success: true,
                    data: stats
                });
                
            } catch (error) {
                console.error('❌ Ошибка получения статистики:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Обновление профиля члена семьи (реальное имя и дата рождения)
        this.app.post('/api/admin/family-members/:userId/profile', isAdminAPI, (req, res) => {
            console.log('✏️ API: Обновление профиля члена семьи');
            
            try {
                const { userId } = req.params;
                const { real_name, birth_date } = req.body;
                
                console.log(`   • User ID: ${userId}`);
                console.log(`   • Real Name: ${real_name}`);
                console.log(`   • Birth Date: ${birth_date}`);

                // Проверяем, существует ли таблица member_profiles
                const tableExists = dbManager.db.prepare(`
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name='member_profiles'
                `).get();
                
                if (!tableExists) {
                    return res.status(500).json({
                        success: false,
                        error: 'Таблица member_profiles не существует. Сначала выполните миграцию базы данных.'
                    });
                }

                // Проверяем, существует ли уже запись
                const existing = dbManager.db.prepare(`
                    SELECT * FROM member_profiles WHERE user_id = ?
                `).get(userId);
                
                if (existing) {
                    // Обновляем существующую запись
                    dbManager.db.prepare(`
                        UPDATE member_profiles 
                        SET real_name = ?, 
                            birth_date = ?, 
                            updated_at = CURRENT_TIMESTAMP 
                        WHERE user_id = ?
                    `).run(real_name || '', birth_date || '', userId);
                    
                    console.log('✅ Существующий профиль обновлен');
                } else {
                    // Создаем новую запись
                    dbManager.db.prepare(`
                        INSERT INTO member_profiles (user_id, real_name, birth_date) 
                        VALUES (?, ?, ?)
                    `).run(userId, real_name || '', birth_date || '');
                    
                    console.log('✅ Новый профиль создан');
                }
                
                // Очищаем кэш
                this.cache.members.data = null;
                
                // Отправляем WebSocket уведомление
                if (this.io) {
                    this.io.to('members-room').emit('member_updated', { user_id: userId });
                }
                
                res.json({
                    success: true,
                    message: 'Профиль обновлен'
                });
                
            } catch (error) {
                console.error('❌ Ошибка обновления профиля:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Обновление Nick и Static члена семьи
        this.app.post('/api/admin/family-members/:userId/nick-static', isAdminAPI, (req, res) => {
            console.log('✏️ API: Обновление Nick/Static члена семьи');
            
            try {
                const { userId } = req.params;
                const { nick, static: staticVal } = req.body;
                
                console.log(`   • User ID: ${userId}`);
                console.log(`   • Nick: ${nick}`);
                console.log(`   • Static: ${staticVal}`);

                // Проверяем, существует ли участник в family_members
                const member = dbManager.db.prepare(`
                    SELECT * FROM family_members WHERE user_id = ?
                `).get(userId);
                
                if (!member) {
                    return res.status(404).json({
                        success: false,
                        error: 'Участник не найден'
                    });
                }
                
                // Обновляем данные
                dbManager.db.prepare(`
                    UPDATE family_members 
                    SET nick = ?, 
                        static = ?,
                        updated_at = CURRENT_TIMESTAMP 
                    WHERE user_id = ?
                `).run(nick || '', staticVal || '', userId);
                
                console.log('✅ Данные обновлены');
                
                // Очищаем кэш
                this.cache.members.data = null;
                
                // Отправляем WebSocket уведомление
                if (this.io) {
                    this.io.to('members-room').emit('member_updated', { 
                        user_id: userId,
                        nick: nick,
                        static: staticVal
                    });
                }
                
                res.json({
                    success: true,
                    message: 'Nick/Static обновлены'
                });
                
            } catch (error) {
                console.error('❌ Ошибка обновления Nick/Static:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Обновление заметок члена семьи
        this.app.post('/api/admin/family-members/:userId/notes', isAdminAPI, (req, res) => {
            console.log('📝 API: Обновление заметок члена семьи');
            
            try {
                const { userId } = req.params;
                const { notes } = req.body;
                
                console.log(`   • User ID: ${userId}`);
                console.log(`   • Notes length: ${notes?.length || 0}`);

                // Проверяем, существует ли таблица member_profiles
                const tableExists = dbManager.db.prepare(`
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name='member_profiles'
                `).get();
                
                if (!tableExists) {
                    return res.status(500).json({
                        success: false,
                        error: 'Таблица member_profiles не существует'
                    });
                }

                // Проверяем, существует ли уже запись в member_profiles
                const existing = dbManager.db.prepare(`
                    SELECT * FROM member_profiles WHERE user_id = ?
                `).get(userId);
                
                if (existing) {
                    // Обновляем существующую запись
                    dbManager.db.prepare(`
                        UPDATE member_profiles 
                        SET notes = ?, 
                            updated_at = CURRENT_TIMESTAMP 
                        WHERE user_id = ?
                    `).run(notes || '', userId);
                    
                    console.log('✅ Заметки обновлены в существующем профиле');
                } else {
                    // Создаем новую запись
                    dbManager.db.prepare(`
                        INSERT INTO member_profiles (user_id, notes) 
                        VALUES (?, ?)
                    `).run(userId, notes || '');
                    
                    console.log('✅ Новый профиль создан с заметками');
                }
                
                // Очищаем кэш
                this.cache.members.data = null;
                
                // Отправляем WebSocket уведомление
                if (this.io) {
                    this.io.to('members-room').emit('member_updated', { 
                        user_id: userId,
                        has_notes: !!notes
                    });
                }
                
                res.json({
                    success: true,
                    message: 'Заметки обновлены'
                });
                
            } catch (error) {
                console.error('❌ Ошибка обновления заметок:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Обновление Tier члена семьи
        this.app.post('/api/admin/family-members/:userId/tier', isAdminAPI, (req, res) => {
            console.log('🎚️ API: Изменение Tier члена семьи');
            
            try {
                const { userId } = req.params;
                const { tier } = req.body;
                
                console.log(`   • User ID: ${userId}`);
                console.log(`   • Tier: ${tier}`);
                
                // Проверяем корректность tier
                if (![1, 2, 3].includes(tier)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Некорректное значение Tier. Допустимо: 1, 2, 3'
                    });
                }

                // Проверяем, существует ли таблица member_profiles
                const tableExists = dbManager.db.prepare(`
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name='member_profiles'
                `).get();
                
                if (!tableExists) {
                    return res.status(500).json({
                        success: false,
                        error: 'Таблица member_profiles не существует. Сначала выполните миграцию базы данных.'
                    });
                }
                
                // Проверяем, существует ли уже запись
                const existing = dbManager.db.prepare(`
                    SELECT * FROM member_profiles WHERE user_id = ?
                `).get(userId);
                
                if (existing) {
                    // Обновляем существующую запись
                    dbManager.db.prepare(`
                        UPDATE member_profiles 
                        SET tier = ?, updated_at = CURRENT_TIMESTAMP 
                        WHERE user_id = ?
                    `).run(tier, userId);
                    
                    console.log('✅ Существующий профиль обновлен');
                } else {
                    // Создаем новую запись
                    dbManager.db.prepare(`
                        INSERT INTO member_profiles (user_id, tier) 
                        VALUES (?, ?)
                    `).run(userId, tier);
                    
                    console.log('✅ Новый профиль создан');
                }
                
                // Очищаем кэш
                this.cache.members.data = null;
                
                // Отправляем WebSocket уведомление
                if (this.io) {
                    this.io.to('members-room').emit('member_updated', { user_id: userId, tier });
                }
                
                res.json({
                    success: true,
                    message: `Tier изменен на ${tier}`,
                    tier: tier
                });
                
            } catch (error) {
                console.error('❌ Ошибка изменения Tier:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Исключение члена из семьи
        this.app.post('/api/admin/family-members/:userId/exclude', isAdminAPI, (req, res) => {
            console.log('🚫 API: Исключение члена из семьи');
            
            try {
                const { userId } = req.params;
                const { reason, blacklist } = req.body;
                
                console.log(`   • User ID: ${userId}`);
                console.log(`   • Reason: ${reason}`);
                console.log(`   • Blacklist: ${blacklist}`);
                
                if (!reason) {
                    return res.status(400).json({
                        success: false,
                        error: 'Необходимо указать причину исключения'
                    });
                }
                
                // Начинаем транзакцию
                dbManager.db.exec('BEGIN TRANSACTION');
                
                try {
                    // Получаем информацию о члене семьи
                    const member = dbManager.db.prepare(`
                        SELECT * FROM family_members WHERE user_id = ?
                    `).get(userId);
                    
                    if (!member) {
                        dbManager.db.exec('ROLLBACK');
                        return res.status(404).json({
                            success: false,
                            error: 'Участник не найден'
                        });
                    }
                    
                    // Получаем заявку
                    const application = dbManager.db.prepare(`
                        SELECT id FROM applications 
                        WHERE user_id = ? AND status = 'accepted'
                    `).get(userId);
                    
                    if (application) {
                        // Обновляем статус заявки на excluded
                        dbManager.db.prepare(`
                            UPDATE applications 
                            SET status = 'excluded', 
                                reject_reason = ?,
                                reviewed_by = ?,
                                reviewed_at = CURRENT_TIMESTAMP,
                                was_accepted = 1
                            WHERE id = ?
                        `).run(reason, req.user?.user_id || req.session?.userId, application.id);
                    }
                    
                    // Удаляем из family_members
                    dbManager.db.prepare(`
                        DELETE FROM family_members WHERE user_id = ?
                    `).run(userId);
                    
                    // Если нужно добавить в черный список
                    if (blacklist) {
                        // Проверяем, существует ли таблица blacklist
                        const tableExists = dbManager.db.prepare(`
                            SELECT name FROM sqlite_master 
                            WHERE type='table' AND name='blacklist'
                        `).get();
                        
                        if (tableExists) {
                            dbManager.db.prepare(`
                                INSERT OR REPLACE INTO blacklist (user_id, reason, added_by, created_at)
                                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                            `).run(userId, reason, req.user?.user_id || req.session?.userId);
                        }
                    }
                    
                    // Коммитим транзакцию
                    dbManager.db.exec('COMMIT');
                    
                    // Удаляем роль на Discord сервере
                    (async () => {
                        try {
                            const guild = this.client.guilds.cache.get(process.env.GUILD_ID);
                            if (guild) {
                                const member = await guild.members.fetch(userId).catch(() => null);
                                if (member) {
                                    await member.roles.remove(process.env.MEMBER_ROLE_ID);
                                    console.log(`✅ Роль удалена у пользователя ${userId}`);
                                }
                            }
                        } catch (discordError) {
                            console.error('⚠️ Ошибка удаления роли в Discord:', discordError.message);
                            // Продолжаем выполнение
                        }
                    })();
                    
                    // Очищаем кэш
                    this.cache.members.data = null;
                    
                    // Отправляем уведомление через WebSocket
                    if (this.io) {
                        this.io.to('members-room').emit('member_removed', { 
                            user_id: userId, 
                            reason,
                            username: member?.username
                        });
                    }
                    
                    console.log(`✅ Участник ${member?.username || userId} исключен`);
                    
                    res.json({
                        success: true,
                        message: 'Участник исключен'
                    });
                    
                } catch (innerError) {
                    dbManager.db.exec('ROLLBACK');
                    throw innerError;
                }
                
            } catch (error) {
                console.error('❌ Ошибка исключения участника:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ==================== EMBED ЭНДПОИНТ ====================
        this.app.post('/api/discord/send-embed', isAdmin, async (req, res) => {
            try {
                const { channelId } = req.body
                
                if (!channelId) {
                    return res.status(400).json({ success: false, error: 'ID канала обязателен' })
                }

                if (!global.discordClient) {
                    return res.status(500).json({ success: false, error: 'Discord клиент не подключен' })
                }

                const channel = await global.discordClient.channels.fetch(channelId).catch(() => null)
                
                if (!channel) {
                    return res.status(404).json({ success: false, error: 'Канал не найден' })
                }

                const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js')
                
                const embed = new EmbedBuilder()
                    .setColor(0x000000)
                    .setTitle('ПОДАЧА ЗАЯВКИ В KINGSIZE')
                    .setDescription('Нажмите кнопку ниже, чтобы подать заявку.')
                    .setImage('https://cdn.discordapp.com/attachments/1477054167125196822/1477067720317997218/1111.jpg')

                const button = new ButtonBuilder()
                    .setCustomId('open_modal')
                    .setLabel('ПОДАТЬ ЗАЯВКУ')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔫')

                const row = new ActionRowBuilder().addComponents(button)

                await channel.send({ embeds: [embed], components: [row] })

                console.log(`✅ Embed отправлен в канал ${channelId}`)
                res.json({ success: true, message: 'Embed успешно отправлен' })
                
            } catch (error) {
                console.error('❌ Ошибка при отправке embed:', error)
                res.status(500).json({ success: false, error: error.message })
            }
        })

        // ==================== ОБРАБОТКА ОШИБОК ====================
        this.app.use((req, res) => {
            if (req.path.startsWith('/api/')) {
                return res.status(404).json({ success: false, error: 'Маршрут не найден' })
            }
            res.status(404).render('errors/404', { 
                title: 'Страница не найдена',
                user: req.user || null,
                env: process.env
            })
        })
        
        this.app.use((err, req, res, next) => {
            if (err.code === 'EBADCSRFTOKEN') {
                if (req.path.startsWith('/api/')) {
                    return res.status(403).json({ success: false, error: 'Недействительный CSRF токен' })
                }
                return res.status(403).render('errors/403', {
                    title: 'Ошибка безопасности',
                    message: 'Недействительный CSRF токен',
                    user: req.user || null,
                    env: process.env
                })
            }
            next(err)
        })
        
        this.app.use((err, req, res, next) => {
            console.error('❌ Серверная ошибка:', err)
            
            const statusCode = err.status || 500
            const errorMessage = process.env.NODE_ENV === 'development' 
                ? err.message 
                : 'Внутренняя ошибка сервера'
            
            if (req.path.startsWith('/api/')) {
                return res.status(statusCode).json({ success: false, error: errorMessage })
            }
            
            res.status(statusCode).render('errors/500', {
                title: 'Ошибка сервера',
                message: errorMessage,
                error: process.env.NODE_ENV === 'development' ? err : null,
                user: req.user || null,
                env: process.env
            })
        })
    }
    
    start() {
        return new Promise((resolve) => {
            this.server.listen(this.port, () => {
                console.log(`🌐 Веб-сервер запущен на http://localhost:${this.port}`)
                console.log(`   • Режим: ${process.env.NODE_ENV || 'development'}`)
                console.log(`   • WebSocket: порт ${this.port}`)
                resolve(this.server)
            })
        })
    }
    
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval)
            this.updateInterval = null
        }
        
        if (this.cacheUpdateInterval) {
            clearInterval(this.cacheUpdateInterval)
            this.cacheUpdateInterval = null
        }
        
        if (this.voiceUpdateInterval) {
            clearInterval(this.voiceUpdateInterval)
            this.voiceUpdateInterval = null
        }
        
        if (this.io) {
            this.io.close()
            this.io = null
        }
        
        if (this.server) {
            this.server.close()
        }
        
        console.log('🛑 Веб-сервер остановлен')
    }
}

export default WebServer