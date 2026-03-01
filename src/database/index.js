// src/database/index.js
import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

class DatabaseManager {
    constructor() {
        this.dbPath = path.join(__dirname, '../../data/bot_database.sqlite')
        this.ensureDataDirectory()
        this.db = this.initializeDatabase()
        this.createTables()
        console.log('✅ База данных инициализирована')
    }

    ensureDataDirectory() {
        const dataDir = path.join(__dirname, '../../data')
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true })
            console.log('📁 Создана папка data')
        }
    }

    initializeDatabase() {
        try {
            const db = new Database(this.dbPath, {
                verbose: process.env.NODE_ENV === 'development' ? console.log : null
            })
            
            // Включаем поддержку внешних ключей
            db.pragma('foreign_keys = ON')
            
            return db
        } catch (error) {
            console.error('❌ Ошибка при инициализации базы данных:', error)
            throw error
        }
    }

    createTables() {
        try {
            // Таблица пользователей
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS users (
                    user_id TEXT PRIMARY KEY,
                    username TEXT NOT NULL,
                    discriminator TEXT,
                    avatar_url TEXT,
                    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `)

            // Таблица заявок (с полями для архива)
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS applications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    username TEXT NOT NULL,
                    discord_name TEXT NOT NULL,
                    avatar_url TEXT,
                    full_name TEXT NOT NULL,
                    play_time_info TEXT NOT NULL,
                    servers_history TEXT NOT NULL,
                    mp_experience TEXT NOT NULL,
                    gung_links TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    is_archived INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    reviewed_by TEXT,
                    reviewed_at DATETIME,
                    reject_reason TEXT,
                    was_accepted INTEGER DEFAULT 0,
                    archived_by TEXT,
                    archived_at DATETIME,
                    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
                )
            `)

            // Таблица членов семьи
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS family_members (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL UNIQUE,
                    username TEXT NOT NULL,
                    discord_name TEXT NOT NULL,
                    avatar_url TEXT,
                    nick TEXT,
                    static TEXT,
                    full_name TEXT,
                    play_time_info TEXT,
                    servers_history TEXT,
                    mp_experience TEXT,
                    gung_links TEXT,
                    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    left_at DATETIME,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    is_active INTEGER DEFAULT 1,
                    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
                )
            `)

            // Таблица прав пользователей
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS user_permissions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL UNIQUE,
                    role TEXT DEFAULT 'user',
                    permissions TEXT,
                    granted_by TEXT,
                    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
                )
            `)

            // Таблица для логов
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT,
                    action TEXT NOT NULL,
                    details TEXT,
                    ip_address TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
                )
            `)

            // Создаем индексы для оптимизации
            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id);
                CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
                CREATE INDEX IF NOT EXISTS idx_applications_is_archived ON applications(is_archived);
                CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at);
                CREATE INDEX IF NOT EXISTS idx_family_members_user_id ON family_members(user_id);
                CREATE INDEX IF NOT EXISTS idx_family_members_is_active ON family_members(is_active);
                CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);
                CREATE INDEX IF NOT EXISTS idx_user_permissions_role ON user_permissions(role);
                CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id);
                CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);
            `)

            console.log('✅ Таблицы созданы или уже существуют')
        } catch (error) {
            console.error('❌ Ошибка при создании таблиц:', error)
            throw error
        }
    }

    // ==================== МЕТОДЫ ДЛЯ ПОЛЬЗОВАТЕЛЕЙ ====================

    getUserById(userId) {
        try {
            return this.db.prepare(`
                SELECT * FROM users WHERE user_id = ?
            `).get(userId)
        } catch (error) {
            console.error('❌ Ошибка при получении пользователя:', error)
            return null
        }
    }

    createUser(userId, username, discriminator, avatarUrl) {
        try {
            this.db.prepare(`
                INSERT OR IGNORE INTO users (user_id, username, discriminator, avatar_url, joined_at, last_seen)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).run(userId, username, discriminator || '0000', avatarUrl || null)
            
            return this.getUserById(userId)
        } catch (error) {
            console.error('❌ Ошибка при создании пользователя:', error)
            return null
        }
    }

    updateUserLastSeen(userId) {
        try {
            this.db.prepare(`
                UPDATE users SET last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
            `).run(userId)
            return true
        } catch (error) {
            console.error('❌ Ошибка при обновлении last_seen:', error)
            return false
        }
    }

    ensureUser(userData) {
        try {
            let user = this.getUserById(userData.id)
            
            if (!user) {
                user = this.createUser(
                    userData.id,
                    userData.username,
                    userData.discriminator,
                    userData.displayAvatarURL ? userData.displayAvatarURL() : userData.avatar_url
                )
            } else {
                this.updateUserLastSeen(userData.id)
            }
            
            return user
        } catch (error) {
            console.error('❌ Ошибка в ensureUser:', error)
            return null
        }
    }

    // ==================== МЕТОДЫ ДЛЯ ЗАЯВОК ====================

    getApplicationById(id) {
        try {
            return this.db.prepare(`
                SELECT * FROM applications WHERE id = ?
            `).get(id)
        } catch (error) {
            console.error('❌ Ошибка при получении заявки:', error)
            return null
        }
    }

    getApplicationsByUserId(userId) {
        try {
            return this.db.prepare(`
                SELECT * FROM applications WHERE user_id = ? ORDER BY created_at DESC
            `).all(userId)
        } catch (error) {
            console.error('❌ Ошибка при получении заявок пользователя:', error)
            return []
        }
    }

    getActiveApplications(status = null) {
        try {
            let query = `SELECT * FROM applications WHERE is_archived = 0`
            const params = []
            
            if (status) {
                query += ` AND status = ?`
                params.push(status)
            }
            
            query += ` ORDER BY created_at DESC`
            
            return this.db.prepare(query).all(...params)
        } catch (error) {
            console.error('❌ Ошибка при получении активных заявок:', error)
            return []
        }
    }

    getArchivedApplications() {
    try {
        console.log('📦 Database: getArchivedApplications()');
        
        // Проверяем, есть ли поле archived_at
        const tableInfo = this.db.prepare(`PRAGMA table_info(applications)`).all()
        console.log('📦 Database: Поля таблицы:', tableInfo.map(col => col.name).join(', '))
        
        const hasArchivedAt = tableInfo.some(col => col.name === 'archived_at')
        console.log('📦 Database: Есть archived_at:', hasArchivedAt)
        
        let applications = []
        
        if (hasArchivedAt) {
            applications = this.db.prepare(`
                SELECT * FROM applications 
                WHERE is_archived = 1 
                ORDER BY archived_at DESC, created_at DESC
            `).all()
        } else {
            applications = this.db.prepare(`
                SELECT * FROM applications 
                WHERE is_archived = 1 
                ORDER BY reviewed_at DESC, created_at DESC
            `).all()
        }
        
        console.log(`📦 Database: Найдено ${applications.length} архивных заявок`)
        return applications
    } catch (error) {
        console.error('❌ Ошибка при получении архивных заявок:', error)
        console.error('❌ Стек ошибки:', error.stack)
        return []
    }
}

    createApplication(data) {
        try {
            // Сначала убеждаемся, что пользователь существует
            this.ensureUser({
                id: data.user_id,
                username: data.username,
                discriminator: data.discord_name?.split('#')[1] || '0000',
                avatar_url: data.avatar_url
            })

            const result = this.db.prepare(`
                INSERT INTO applications (
                    user_id, username, discord_name, avatar_url, 
                    full_name, play_time_info, servers_history, 
                    mp_experience, gung_links, status, created_at, is_archived
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            `).run(
                data.user_id,
                data.username,
                data.discord_name,
                data.avatar_url || null,
                data.full_name,
                data.play_time_info,
                data.servers_history,
                data.mp_experience,
                data.gung_links,
                data.status || 'pending',
                data.created_at || new Date().toISOString()
            )
            
            return this.getApplicationById(result.lastInsertRowid)
        } catch (error) {
            console.error('❌ Ошибка при создании заявки:', error)
            return null
        }
    }

    updateApplicationStatus(id, status, reviewedBy, rejectReason = null) {
        try {
            this.db.prepare(`
                UPDATE applications 
                SET status = ?, 
                    reviewed_by = ?, 
                    reviewed_at = CURRENT_TIMESTAMP,
                    reject_reason = ?,
                    was_accepted = CASE WHEN ? = 'accepted' THEN 1 ELSE was_accepted END
                WHERE id = ? AND is_archived = 0
            `).run(status, reviewedBy, rejectReason, status, id)
            
            return true
        } catch (error) {
            console.error('❌ Ошибка при обновлении статуса заявки:', error)
            return false
        }
    }

    archiveApplication(id, userId) {
    try {
        // Получаем заявку
        const application = this.db.prepare(`
            SELECT * FROM applications WHERE id = ?
        `).get(id)
        
        if (!application) {
            throw new Error('Заявка не найдена')
        }
        
        // Просто помечаем заявку как архивную, НЕ трогаем family_members
        this.db.prepare(`
            UPDATE applications 
            SET is_archived = 1,
                archived_by = ?,
                archived_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(userId, id)
        
        console.log(`✅ Заявка #${id} отправлена в архив (участник остался в семье)`)
        return true
        
    } catch (error) {
        console.error('❌ Ошибка при архивации заявки:', error)
        return false
    }
}

    restoreApplication(id) {
        try {
            // Начинаем транзакцию
            const restoreResult = this.db.transaction(() => {
                // Получаем заявку
                const application = this.db.prepare(`
                    SELECT * FROM applications WHERE id = ?
                `).get(id)
                
                if (!application) {
                    throw new Error('Заявка не найдена')
                }
                
                // Восстанавливаем заявку
                this.db.prepare(`
                    UPDATE applications 
                    SET is_archived = 0,
                        archived_by = NULL,
                        archived_at = NULL
                    WHERE id = ?
                `).run(id)
                
                // Если заявка была принята, восстанавливаем участника
                if (application.status === 'accepted') {
                    // Проверяем, существует ли участник
                    const member = this.db.prepare(`
                        SELECT id FROM family_members WHERE user_id = ?
                    `).get(application.user_id)
                    
                    if (member) {
                        // Если есть, активируем
                        this.db.prepare(`
                            UPDATE family_members 
                            SET is_active = 1, 
                                left_at = NULL,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE user_id = ?
                        `).run(application.user_id)
                    } else {
                        // Если нет, создаем заново
                        this.db.prepare(`
                            INSERT INTO family_members (
                                user_id, username, discord_name, avatar_url,
                                full_name, play_time_info, servers_history,
                                mp_experience, gung_links, joined_at, is_active
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
                        `).run(
                            application.user_id,
                            application.username,
                            application.discord_name,
                            application.avatar_url,
                            application.full_name,
                            application.play_time_info,
                            application.servers_history,
                            application.mp_experience,
                            application.gung_links
                        )
                    }
                    
                    console.log(`🔄 Участник ${application.user_id} восстановлен`)
                }
                
                return true
            })()
            
            return restoreResult
        } catch (error) {
            console.error('❌ Ошибка при восстановлении заявки:', error)
            return false
        }
    }

    deleteApplication(id) {
    try {
        // Просто удаляем заявку, НЕ трогаем family_members
        this.db.prepare(`DELETE FROM applications WHERE id = ?`).run(id)
        return true
    } catch (error) {
        console.error('❌ Ошибка при удалении заявки:', error)
        return false
    }
}

    // ==================== МЕТОДЫ ДЛЯ ЧЛЕНОВ СЕМЬИ ====================

    getFamilyMemberByUserId(userId) {
        try {
            return this.db.prepare(`
                SELECT * FROM family_members WHERE user_id = ? AND is_active = 1
            `).get(userId)
        } catch (error) {
            console.error('❌ Ошибка при получении члена семьи:', error)
            return null
        }
    }

    getFamilyMember(id) {
        try {
            return this.db.prepare(`
                SELECT * FROM family_members WHERE id = ?
            `).get(id)
        } catch (error) {
            console.error('❌ Ошибка при получении члена семьи:', error)
            return null
        }
    }

    getAllFamilyMembers(limit = 100, offset = 0) {
        try {
            return this.db.prepare(`
                SELECT * FROM family_members 
                WHERE is_active = 1 
                ORDER BY joined_at DESC 
                LIMIT ? OFFSET ?
            `).all(limit, offset)
        } catch (error) {
            console.error('❌ Ошибка при получении членов семьи:', error)
            return []
        }
    }

    getAllFamilyMembersCount() {
        try {
            const result = this.db.prepare(`
                SELECT COUNT(*) as count FROM family_members WHERE is_active = 1
            `).get()
            return result.count
        } catch (error) {
            console.error('❌ Ошибка при подсчете членов семьи:', error)
            return 0
        }
    }

    addFamilyMember(data) {
        try {
            // Проверяем, существует ли уже запись
            const existing = this.db.prepare(`
                SELECT id FROM family_members WHERE user_id = ?
            `).get(data.user_id)
            
            if (existing) {
                // Обновляем существующую запись - обновляем ВСЕ поля!
                this.db.prepare(`
                    UPDATE family_members 
                    SET username = ?, 
                        discord_name = ?, 
                        avatar_url = ?,
                        nick = ?, 
                        static = ?, 
                        full_name = ?,
                        play_time_info = ?, 
                        servers_history = ?,
                        mp_experience = ?, 
                        gung_links = ?,
                        joined_at = CURRENT_TIMESTAMP, 
                        is_active = 1,
                        left_at = NULL,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                `).run(
                    data.username,
                    data.discord_name,
                    data.avatar_url || null,
                    data.nick || null,
                    data.static || null,
                    data.full_name || null,
                    data.play_time_info || null,
                    data.servers_history || null,
                    data.mp_experience || null,
                    data.gung_links || null,
                    data.user_id
                )
            } else {
                // Создаем новую запись
                this.db.prepare(`
                    INSERT INTO family_members (
                        user_id, username, discord_name, avatar_url,
                        nick, static, full_name, play_time_info,
                        servers_history, mp_experience, gung_links,
                        joined_at, is_active
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
                `).run(
                    data.user_id,
                    data.username,
                    data.discord_name,
                    data.avatar_url || null,
                    data.nick || null,
                    data.static || null,
                    data.full_name || null,
                    data.play_time_info || null,
                    data.servers_history || null,
                    data.mp_experience || null,
                    data.gung_links || null
                )
            }
            
            return true
        } catch (error) {
            console.error('❌ Ошибка при добавлении в family_members:', error)
            return false
        }
    }

    updateFamilyMember(userId, data) {
        try {
            return this.db.prepare(`
                UPDATE family_members 
                SET nick = ?,
                    static = ?,
                    full_name = ?,
                    play_time_info = ?,
                    servers_history = ?,
                    mp_experience = ?,
                    gung_links = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND is_active = 1
            `).run(
                data.nick || null,
                data.static || null,
                data.full_name || null,
                data.play_time_info || null,
                data.servers_history || null,
                data.mp_experience || null,
                data.gung_links || null,
                userId
            )
        } catch (error) {
            console.error('❌ Ошибка при обновлении участника:', error)
            return null
        }
    }

    removeFamilyMember(userId, reason = null) {
        try {
            // Помечаем как неактивного вместо удаления
            this.db.prepare(`
                UPDATE family_members 
                SET is_active = 0, 
                    left_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND is_active = 1
            `).run(userId)
            
            // Добавляем в лог
            this.addLog(userId, 'family_member_removed', reason)
            
            return true
        } catch (error) {
            console.error('❌ Ошибка при удалении из family_members:', error)
            return false
        }
    }

    // ==================== МЕТОДЫ ДЛЯ ПРАВ ====================

    getUserPermissions(userId) {
        try {
            return this.db.prepare(`
                SELECT * FROM user_permissions WHERE user_id = ?
            `).get(userId)
        } catch (error) {
            console.error('❌ Ошибка при получении прав пользователя:', error)
            return null
        }
    }

    setUserRole(userId, role, grantedBy, permissions = null) {
        try {
            const existing = this.getUserPermissions(userId)
            
            if (existing) {
                this.db.prepare(`
                    UPDATE user_permissions 
                    SET role = ?, 
                        permissions = ?, 
                        granted_by = ?, 
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                `).run(role, permissions ? JSON.stringify(permissions) : null, grantedBy, userId)
            } else {
                this.db.prepare(`
                    INSERT INTO user_permissions (user_id, role, permissions, granted_by, granted_at)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                `).run(userId, role, permissions ? JSON.stringify(permissions) : null, grantedBy)
            }
            
            return true
        } catch (error) {
            console.error('❌ Ошибка при установке роли:', error)
            return false
        }
    }

    getAllAdmins() {
        try {
            return this.db.prepare(`
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
        } catch (error) {
            console.error('❌ Ошибка при получении администраторов:', error)
            return []
        }
    }

    removeAdmin(userId) {
        try {
            const result = this.db.prepare(`
                DELETE FROM user_permissions 
                WHERE user_id = ? AND role != 'superadmin'
            `).run(userId)
            
            return result
        } catch (error) {
            console.error('❌ Ошибка при удалении администратора:', error)
            return null
        }
    }

    // ==================== МЕТОДЫ ДЛЯ ЛОГОВ ====================

    addLog(userId, action, details = null, ipAddress = null) {
        try {
            this.db.prepare(`
                INSERT INTO logs (user_id, action, details, ip_address, created_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(userId || null, action, details || null, ipAddress || null)
            
            return true
        } catch (error) {
            console.error('❌ Ошибка при добавлении лога:', error)
            return false
        }
    }

    getLogs(limit = 100, offset = 0) {
        try {
            return this.db.prepare(`
                SELECT l.*, u.username 
                FROM logs l
                LEFT JOIN users u ON u.user_id = l.user_id
                ORDER BY l.created_at DESC 
                LIMIT ? OFFSET ?
            `).all(limit, offset)
        } catch (error) {
            console.error('❌ Ошибка при получении логов:', error)
            return []
        }
    }

    // ==================== МЕТОДЫ ДЛЯ СТАТИСТИКИ ====================

    getApplicationsStats() {
        try {
            const stats = this.db.prepare(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'pending' AND is_archived = 0 THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN status = 'accepted' AND is_archived = 0 THEN 1 ELSE 0 END) as accepted,
                    SUM(CASE WHEN status = 'interview' AND is_archived = 0 THEN 1 ELSE 0 END) as interview,
                    SUM(CASE WHEN status = 'rejected' AND is_archived = 0 THEN 1 ELSE 0 END) as rejected
                FROM applications
            `).get()
            
            const today = new Date().toISOString().split('T')[0]
            const todayStats = this.db.prepare(`
                SELECT COUNT(*) as count FROM applications 
                WHERE date(created_at) = date(?) AND is_archived = 0
            `).get(today)
            
            return {
                total: stats.total || 0,
                pending: stats.pending || 0,
                accepted: stats.accepted || 0,
                interview: stats.interview || 0,
                rejected: stats.rejected || 0,
                today: todayStats?.count || 0
            }
        } catch (error) {
            console.error('❌ Ошибка при получении статистики заявок:', error)
            return {
                total: 0, pending: 0, accepted: 0, interview: 0, rejected: 0, today: 0
            }
        }
    }

    getFamilyMembersCount() {
        try {
            const result = this.db.prepare(`
                SELECT COUNT(*) as count FROM family_members WHERE is_active = 1
            `).get()
            return result.count
        } catch (error) {
            console.error('❌ Ошибка при получении количества членов семьи:', error)
            return 0
        }
    }

    getNewMembersCount(days = 30) {
        try {
            const result = this.db.prepare(`
                SELECT COUNT(*) as count FROM family_members 
                WHERE is_active = 1 AND joined_at >= datetime('now', ?)
            `).get(`-${days} days`)
            return result.count
        } catch (error) {
            console.error('❌ Ошибка при получении количества новых членов:', error)
            return 0
        }
    }

    getMembersWithNickCount() {
        try {
            const result = this.db.prepare(`
                SELECT COUNT(*) as count FROM family_members 
                WHERE is_active = 1 AND nick IS NOT NULL AND nick != ''
            `).get()
            return result.count
        } catch (error) {
            console.error('❌ Ошибка при подсчете участников с ником:', error)
            return 0
        }
    }

    getMembersWithStaticCount() {
        try {
            const result = this.db.prepare(`
                SELECT COUNT(*) as count FROM family_members 
                WHERE is_active = 1 AND static IS NOT NULL AND static != ''
            `).get()
            return result.count
        } catch (error) {
            console.error('❌ Ошибка при подсчете участников со статиком:', error)
            return 0
        }
    }

    // ==================== МЕТОДЫ ДЛЯ ИСКЛЮЧЕННЫХ ====================

    getExcludedMembers(limit = 100, offset = 0) {
        try {
            return this.db.prepare(`
                SELECT fm.*, a.reject_reason, a.reviewed_by, a.reviewed_at
                FROM family_members fm
                LEFT JOIN applications a ON a.user_id = fm.user_id AND a.status = 'rejected'
                WHERE fm.is_active = 0
                ORDER BY fm.left_at DESC
                LIMIT ? OFFSET ?
            `).all(limit, offset)
        } catch (error) {
            console.error('❌ Ошибка при получении исключенных:', error)
            return []
        }
    }

    getExcludedMembersCount() {
        try {
            const result = this.db.prepare(`
                SELECT COUNT(*) as count FROM family_members WHERE is_active = 0
            `).get()
            return result.count
        } catch (error) {
            console.error('❌ Ошибка при подсчете исключенных:', error)
            return 0
        }
    }

    // ==================== ОБЩИЕ МЕТОДЫ ====================

    close() {
        if (this.db) {
            this.db.close()
            console.log('✅ Соединение с БД закрыто')
        }
    }

    backup() {
        try {
            const backupPath = path.join(__dirname, `../../data/backup_${Date.now()}.sqlite`)
            const data = fs.readFileSync(this.dbPath)
            fs.writeFileSync(backupPath, data)
            console.log(`✅ Создана резервная копия: ${backupPath}`)
            return backupPath
        } catch (error) {
            console.error('❌ Ошибка при создании резервной копии:', error)
            return null
        }
    }

    // Проверка и создание суперадмина (владельца бота)
    ensureSuperAdmin() {
        try {
            const ownerId = process.env.BOT_OWNER_ID
            if (!ownerId) return

            const existing = this.getUserPermissions(ownerId)
            
            if (!existing || existing.role !== 'superadmin') {
                this.setUserRole(ownerId, 'superadmin', 'system', {
                    canViewDashboard: true,
                    canManageUsers: true,
                    canManageGuilds: true,
                    canManageApplications: true,
                    canViewLogs: true,
                    canManageBot: true
                })
                console.log('👑 Владелец бота назначен суперадмином')
            }
        } catch (error) {
            console.error('❌ Ошибка при проверке суперадмина:', error)
        }
    }
}

// Создаем и экспортируем единственный экземпляр
const dbManager = new DatabaseManager()

// Вызываем проверку суперадмина после инициализации
dbManager.ensureSuperAdmin()

export default dbManager