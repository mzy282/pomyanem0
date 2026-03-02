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
            // ===== ВАЖНО: Сначала проверяем и обновляем существующие таблицы =====
            
            // Проверяем, существует ли таблица applications
            const appsTableExists = this.db.prepare(`
                SELECT name FROM sqlite_master WHERE type='table' AND name='applications'
            `).get();
            
            if (appsTableExists) {
                console.log('📦 Таблица applications существует, проверяем структуру...');
                
                // Получаем список колонок в таблице applications
                const columns = this.db.prepare(`PRAGMA table_info(applications)`).all();
                const columnNames = columns.map(col => col.name);
                
                console.log('📦 Существующие колонки в applications:', columnNames.join(', '));
                
                // Добавляем новые колонки, если их нет
                if (!columnNames.includes('nick_static')) {
                    console.log('📦 Добавляем колонку nick_static...');
                    this.db.exec(`ALTER TABLE applications ADD COLUMN nick_static TEXT;`);
                }
                
                if (!columnNames.includes('user_name')) {
                    console.log('📦 Добавляем колонку user_name...');
                    this.db.exec(`ALTER TABLE applications ADD COLUMN user_name TEXT;`);
                }
                
                if (!columnNames.includes('age')) {
                    console.log('📦 Добавляем колонку age...');
                    this.db.exec(`ALTER TABLE applications ADD COLUMN age TEXT;`);
                }
                
                console.log('✅ Таблица applications обновлена');
            }
            
            // Проверяем, существует ли таблица logs
            const logsTableExists = this.db.prepare(`
                SELECT name FROM sqlite_master WHERE type='table' AND name='logs'
            `).get();
            
            if (logsTableExists) {
                console.log('📦 Таблица logs существует, проверяем структуру...');
                
                // Получаем список колонок в таблице logs
                const columns = this.db.prepare(`PRAGMA table_info(logs)`).all();
                const columnNames = columns.map(col => col.name);
                
                console.log('📦 Существующие колонки в logs:', columnNames.join(', '));
                
                // Если нет новых колонок, добавляем их
                if (!columnNames.includes('entity_type')) {
                    console.log('📦 Добавляем колонку entity_type...');
                    this.db.exec(`ALTER TABLE logs ADD COLUMN entity_type TEXT;`);
                }
                
                if (!columnNames.includes('entity_id')) {
                    console.log('📦 Добавляем колонку entity_id...');
                    this.db.exec(`ALTER TABLE logs ADD COLUMN entity_id TEXT;`);
                }
                
                if (!columnNames.includes('old_value')) {
                    console.log('📦 Добавляем колонку old_value...');
                    this.db.exec(`ALTER TABLE logs ADD COLUMN old_value TEXT;`);
                }
                
                if (!columnNames.includes('new_value')) {
                    console.log('📦 Добавляем колонку new_value...');
                    this.db.exec(`ALTER TABLE logs ADD COLUMN new_value TEXT;`);
                }
                
                if (!columnNames.includes('user_agent')) {
                    console.log('📦 Добавляем колонку user_agent...');
                    this.db.exec(`ALTER TABLE logs ADD COLUMN user_agent TEXT;`);
                }
                
                console.log('✅ Таблица logs обновлена');
            } else {
                console.log('📦 Таблица logs не существует, создаем новую...');
                // Создаем новую таблицу logs
                this.db.exec(`
                    CREATE TABLE logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id TEXT,
                        action TEXT NOT NULL,
                        entity_type TEXT,
                        entity_id TEXT,
                        details TEXT,
                        old_value TEXT,
                        new_value TEXT,
                        ip_address TEXT,
                        user_agent TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
                    )
                `);
            }

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

            // Таблица заявок (с новыми полями)
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS applications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    username TEXT NOT NULL,
                    discord_name TEXT NOT NULL,
                    avatar_url TEXT,
                    full_name TEXT NOT NULL,
                    -- Новые поля
                    nick_static TEXT,
                    user_name TEXT,
                    age TEXT,
                    -- Остальные поля
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

            // Таблица шаблонов отказов
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS reject_templates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    text TEXT NOT NULL,
                    created_by TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    sort_order INTEGER DEFAULT 0,
                    is_active INTEGER DEFAULT 1,
                    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
                )
            `)

            // Таблица для member_profiles
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS member_profiles (
                    user_id TEXT PRIMARY KEY,
                    real_name TEXT,
                    birth_date TEXT,
                    tier INTEGER DEFAULT 3,
                    notes TEXT,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES family_members(user_id) ON DELETE CASCADE
                )
            `)

            // ===== ИНДЕКСЫ =====
            this.db.exec(`
                -- Индексы для applications
                CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id);
                CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
                CREATE INDEX IF NOT EXISTS idx_applications_is_archived ON applications(is_archived);
                CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at);
                
                -- Индексы для family_members
                CREATE INDEX IF NOT EXISTS idx_family_members_user_id ON family_members(user_id);
                CREATE INDEX IF NOT EXISTS idx_family_members_is_active ON family_members(is_active);
                
                -- Индексы для user_permissions
                CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);
                CREATE INDEX IF NOT EXISTS idx_user_permissions_role ON user_permissions(role);
                
                -- Индексы для reject_templates
                CREATE INDEX IF NOT EXISTS idx_reject_templates_active ON reject_templates(is_active);
                CREATE INDEX IF NOT EXISTS idx_reject_templates_sort ON reject_templates(sort_order);
                
                -- Индексы для logs
                CREATE INDEX IF NOT EXISTS idx_logs_entity ON logs(entity_type, entity_id);
                CREATE INDEX IF NOT EXISTS idx_logs_user ON logs(user_id);
                CREATE INDEX IF NOT EXISTS idx_logs_action ON logs(action);
                CREATE INDEX IF NOT EXISTS idx_logs_date ON logs(created_at);
            `)

            console.log('✅ Таблицы созданы или обновлены')
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
                    full_name, nick_static, user_name, age,
                    play_time_info, servers_history, mp_experience, gung_links, 
                    status, created_at, is_archived
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            `).run(
                data.user_id,
                data.username,
                data.discord_name,
                data.avatar_url || null,
                data.full_name,
                data.nick_static || null,
                data.user_name || null,
                data.age || null,
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
            this.addDetailedLog({
                user_id: null,
                action: 'member_exclude',
                entity_type: 'member',
                entity_id: userId,
                details: reason
            })
            
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

    // ==================== МЕТОДЫ ДЛЯ ШАБЛОНОВ ОТКАЗОВ ====================

    getRejectTemplates() {
        try {
            return this.db.prepare(`
                SELECT id, name, text, created_at, updated_at
                FROM reject_templates 
                WHERE is_active = 1 
                ORDER BY sort_order ASC, name ASC
            `).all();
        } catch (error) {
            console.error('❌ Ошибка при получении шаблонов:', error);
            return [];
        }
    }

    getRejectTemplate(id) {
        try {
            return this.db.prepare(`
                SELECT * FROM reject_templates WHERE id = ? AND is_active = 1
            `).get(id);
        } catch (error) {
            console.error('❌ Ошибка при получении шаблона:', error);
            return null;
        }
    }

    createRejectTemplate(name, text, userId) {
        try {
            const result = this.db.prepare(`
                INSERT INTO reject_templates (name, text, created_by, created_at, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).run(name, text, userId);
            
            // Логируем создание шаблона
            this.addDetailedLog({
                user_id: userId,
                action: 'template_create',
                entity_type: 'template',
                entity_id: result.lastInsertRowid,
                details: `Создан шаблон "${name}"`,
                new_value: { name, text }
            });
            
            return result.lastInsertRowid;
        } catch (error) {
            console.error('❌ Ошибка при создании шаблона:', error);
            throw error;
        }
    }

    updateRejectTemplate(id, name, text, userId) {
        try {
            // Получаем старые данные для лога
            const oldTemplate = this.getRejectTemplate(id);
            
            this.db.prepare(`
                UPDATE reject_templates 
                SET name = ?, text = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND is_active = 1
            `).run(name, text, id);
            
            // Логируем обновление
            this.addDetailedLog({
                user_id: userId,
                action: 'template_update',
                entity_type: 'template',
                entity_id: id,
                old_value: oldTemplate,
                new_value: { name, text }
            });
            
            return true;
        } catch (error) {
            console.error('❌ Ошибка при обновлении шаблона:', error);
            return false;
        }
    }

    deleteRejectTemplate(id, userId) {
        try {
            // Получаем данные для лога
            const template = this.getRejectTemplate(id);
            
            this.db.prepare(`
                UPDATE reject_templates SET is_active = 0 WHERE id = ?
            `).run(id);
            
            // Логируем удаление
            this.addDetailedLog({
                user_id: userId,
                action: 'template_delete',
                entity_type: 'template',
                entity_id: id,
                details: `Удален шаблон "${template?.name}"`
            });
            
            return true;
        } catch (error) {
            console.error('❌ Ошибка при удалении шаблона:', error);
            return false;
        }
    }

    // ==================== МЕТОДЫ ДЛЯ ЛОГОВ ====================

    addDetailedLog(data) {
        try {
            // Проверяем, есть ли новые колонки в таблице
            const columns = this.db.prepare(`PRAGMA table_info(logs)`).all();
            const columnNames = columns.map(col => col.name);
            
            // Если нет новых колонок, используем старый метод
            if (!columnNames.includes('entity_type')) {
                return this.addLogLegacy(data);
            }
            
            this.db.prepare(`
                INSERT INTO logs (
                    user_id, action, entity_type, entity_id, 
                    details, old_value, new_value, ip_address, user_agent, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(
                data.user_id || null,
                data.action,
                data.entity_type || null,
                data.entity_id ? String(data.entity_id) : null,
                data.details || null,
                data.old_value ? JSON.stringify(data.old_value) : null,
                data.new_value ? JSON.stringify(data.new_value) : null,
                data.ip_address || null,
                data.user_agent || null
            );
            return true;
        } catch (error) {
            console.error('❌ Ошибка при добавлении лога:', error);
            // Пробуем старый метод как fallback
            return this.addLogLegacy(data);
        }
    }

    addLogLegacy(data) {
        try {
            this.db.prepare(`
                INSERT INTO logs (user_id, action, details, ip_address, created_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(
                data.user_id || null,
                data.action,
                data.details || null,
                data.ip_address || null
            );
            return true;
        } catch (error) {
            console.error('❌ Ошибка при добавлении лога (legacy):', error);
            return false;
        }
    }

    addLog(userId, action, details = null, ipAddress = null) {
        return this.addDetailedLog({
            user_id: userId,
            action,
            details,
            ip_address: ipAddress
        });
    }

    getAuditLogs(filters = {}, limit = 100, offset = 0) {
        try {
            // Проверяем, есть ли новые колонки
            const columns = this.db.prepare(`PRAGMA table_info(logs)`).all();
            const hasNewColumns = columns.some(col => col.name === 'entity_type');
            
            if (!hasNewColumns) {
                // Используем старый формат
                const logs = this.db.prepare(`
                    SELECT l.*, u.username 
                    FROM logs l
                    LEFT JOIN users u ON u.user_id = l.user_id
                    ORDER BY l.created_at DESC 
                    LIMIT ? OFFSET ?
                `).all(limit, offset);
                return logs;
            }
            
            let query = `
                SELECT l.*, u.username 
                FROM logs l
                LEFT JOIN users u ON u.user_id = l.user_id
                WHERE 1=1
            `;
            const params = [];
            
            if (filters.entity_type) {
                query += ` AND l.entity_type = ?`;
                params.push(filters.entity_type);
            }
            
            if (filters.entity_id) {
                query += ` AND l.entity_id = ?`;
                params.push(filters.entity_id);
            }
            
            if (filters.user_id) {
                query += ` AND l.user_id = ?`;
                params.push(filters.user_id);
            }
            
            if (filters.action) {
                query += ` AND l.action = ?`;
                params.push(filters.action);
            }
            
            if (filters.date_from) {
                query += ` AND date(l.created_at) >= date(?)`;
                params.push(filters.date_from);
            }
            
            if (filters.date_to) {
                query += ` AND date(l.created_at) <= date(?)`;
                params.push(filters.date_to);
            }
            
            query += ` ORDER BY l.created_at DESC LIMIT ? OFFSET ?`;
            params.push(limit, offset);
            
            return this.db.prepare(query).all(...params);
        } catch (error) {
            console.error('❌ Ошибка при получении логов:', error);
            return [];
        }
    }

    getAuditStats() {
        try {
            const total = this.db.prepare(`SELECT COUNT(*) as count FROM logs`).get();
            
            const byAction = this.db.prepare(`
                SELECT action, COUNT(*) as count 
                FROM logs 
                GROUP BY action 
                ORDER BY count DESC 
                LIMIT 10
            `).all();
            
            const byUser = this.db.prepare(`
                SELECT l.user_id, u.username, COUNT(*) as count 
                FROM logs l
                LEFT JOIN users u ON u.user_id = l.user_id
                GROUP BY l.user_id 
                ORDER BY count DESC 
                LIMIT 10
            `).all();
            
            const last7Days = this.db.prepare(`
                SELECT COUNT(*) as count FROM logs 
                WHERE created_at >= datetime('now', '-7 days')
            `).get();
            
            return {
                total: total.count,
                last7Days: last7Days.count,
                byAction,
                byUser
            };
        } catch (error) {
            console.error('❌ Ошибка при получении статистики логов:', error);
            return { total: 0, last7Days: 0, byAction: [], byUser: [] };
        }
    }

    cleanupLogs(days = 90) {
        try {
            const result = this.db.prepare(`
                DELETE FROM logs 
                WHERE created_at < datetime('now', ?)
            `).run(`-${days} days`);
            
            return result.changes;
        } catch (error) {
            console.error('❌ Ошибка при очистке логов:', error);
            return 0;
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