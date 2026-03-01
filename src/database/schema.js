// src/database/schema.js
export const schema = `
    -- =====================================================
    -- ОСНОВНЫЕ ТАБЛИЦЫ
    -- =====================================================

    -- Таблица пользователей Discord
    CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        discriminator TEXT,
        avatar_url TEXT,
        email TEXT,
        access_token TEXT,
        refresh_token TEXT,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        messages_count INTEGER DEFAULT 0,
        commands_used INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        xp INTEGER DEFAULT 0,
        xp_needed INTEGER DEFAULT 100,
        balance INTEGER DEFAULT 0,
        bank INTEGER DEFAULT 0,
        warnings INTEGER DEFAULT 0,
        muted_until TIMESTAMP,
        is_banned BOOLEAN DEFAULT 0,
        ban_reason TEXT,
        banned_at TIMESTAMP,
        banned_by TEXT
    );

    -- Индексы для таблицы users
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active);
    CREATE INDEX IF NOT EXISTS idx_users_level ON users(level DESC, xp DESC);
    CREATE INDEX IF NOT EXISTS idx_users_banned ON users(is_banned) WHERE is_banned = 1;

    -- =====================================================
    -- ТАБЛИЦА ПРАВ ПОЛЬЗОВАТЕЛЕЙ
    -- =====================================================

    CREATE TABLE IF NOT EXISTS user_permissions (
        user_id TEXT PRIMARY KEY,
        role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin', 'superadmin', 'owner')),
        permissions TEXT DEFAULT '{}',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        granted_by TEXT,
        granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (granted_by) REFERENCES users(user_id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_user_permissions_role ON user_permissions(role);

    -- =====================================================
    -- ТАБЛИЦА СЕРВЕРОВ
    -- =====================================================

    CREATE TABLE IF NOT EXISTS guilds (
        guild_id TEXT PRIMARY KEY,
        guild_name TEXT NOT NULL,
        guild_icon TEXT,
        owner_id TEXT NOT NULL,
        member_count INTEGER DEFAULT 0,
        bot_joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        prefix TEXT DEFAULT '!',
        language TEXT DEFAULT 'ru',
        welcome_channel_id TEXT,
        welcome_message TEXT DEFAULT 'Добро пожаловать {user} на сервер {guild}!',
        leave_channel_id TEXT,
        leave_message TEXT DEFAULT '{user} покинул нас',
        log_channel_id TEXT,
        mod_log_channel_id TEXT,
        applications_channel_id TEXT,
        voice_channel_id TEXT,
        auto_role_id TEXT,
        member_role_id TEXT,
        muted_role_id TEXT,
        admin_role_id TEXT,
        moderation_enabled BOOLEAN DEFAULT 1,
        leveling_enabled BOOLEAN DEFAULT 1,
        welcome_enabled BOOLEAN DEFAULT 1,
        leave_enabled BOOLEAN DEFAULT 1,
        auto_mod_enabled BOOLEAN DEFAULT 0,
        extra_settings TEXT DEFAULT '{}',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_guilds_owner ON guilds(owner_id);
    CREATE INDEX IF NOT EXISTS idx_guilds_member_count ON guilds(member_count DESC);

    -- =====================================================
    -- ТАБЛИЦА ЛОГОВ КОМАНД
    -- =====================================================

    CREATE TABLE IF NOT EXISTS command_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        command TEXT NOT NULL,
        user_id TEXT NOT NULL,
        guild_id TEXT,
        channel_id TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        success BOOLEAN DEFAULT 1,
        execution_time INTEGER,
        error_message TEXT,
        args TEXT,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_command_logs_user ON command_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_command_logs_guild ON command_logs(guild_id);
    CREATE INDEX IF NOT EXISTS idx_command_logs_timestamp ON command_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_command_logs_command ON command_logs(command);
    CREATE INDEX IF NOT EXISTS idx_command_logs_success ON command_logs(success);

    -- =====================================================
    -- ТАБЛИЦА ЗАЯВОК В СЕМЬЮ
    -- =====================================================

    CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        discord_name TEXT NOT NULL,
        avatar_url TEXT,
        
        -- Основные поля заявки
        full_name TEXT NOT NULL,
        play_time_info TEXT NOT NULL,
        servers_history TEXT NOT NULL,
        mp_experience TEXT NOT NULL,
        gung_links TEXT NOT NULL,
        
        -- Статус и метаданные
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'interview', 'accepted', 'rejected', 'blacklisted', 'excluded')),
        reviewed_by TEXT,
        reviewed_at TIMESTAMP,
        reject_reason TEXT,
        was_accepted BOOLEAN DEFAULT 0,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL
    );

    -- Индексы для applications
    CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);
    CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
    CREATE INDEX IF NOT EXISTS idx_applications_created ON applications(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_applications_reviewed ON applications(reviewed_at) WHERE reviewed_at IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_applications_was_accepted ON applications(was_accepted);
    CREATE INDEX IF NOT EXISTS idx_applications_full_name ON applications(full_name);
    CREATE INDEX IF NOT EXISTS idx_applications_gung_links ON applications(gung_links);

    -- =====================================================
    -- ТАБЛИЦА ЧЛЕНОВ СЕМЬИ
    -- =====================================================

    CREATE TABLE IF NOT EXISTS family_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL,
        discord_name TEXT NOT NULL,
        avatar_url TEXT,
        
        -- Игровые данные
        nick TEXT,
        static TEXT,
        
        -- Данные из заявки
        full_name TEXT,
        play_time_info TEXT,
        servers_history TEXT,
        mp_experience TEXT,
        gung_links TEXT,
        
        -- Метаданные
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    -- Индексы для family_members
    CREATE INDEX IF NOT EXISTS idx_family_members_user ON family_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_family_members_joined ON family_members(joined_at DESC);
    CREATE INDEX IF NOT EXISTS idx_family_members_nick ON family_members(nick) WHERE nick IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_family_members_full_name ON family_members(full_name);
    CREATE INDEX IF NOT EXISTS idx_family_members_mp_experience ON family_members(mp_experience);

    -- =====================================================
    -- ТАБЛИЦА ПРОФИЛЕЙ ЧЛЕНОВ СЕМЬИ (ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ)
    -- =====================================================

    CREATE TABLE IF NOT EXISTS member_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL UNIQUE,
        real_name TEXT,
        birth_date TEXT,
        tier INTEGER DEFAULT 3,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    -- Индексы для member_profiles
    CREATE INDEX IF NOT EXISTS idx_member_profiles_user_id ON member_profiles(user_id);
    CREATE INDEX IF NOT EXISTS idx_member_profiles_tier ON member_profiles(tier);

    -- =====================================================
    -- ТАБЛИЦА ЭКОНОМИКИ
    -- =====================================================

    CREATE TABLE IF NOT EXISTS economy (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        balance INTEGER DEFAULT 0,
        bank INTEGER DEFAULT 0,
        last_daily TIMESTAMP,
        last_work TIMESTAMP,
        last_rob TIMESTAMP,
        job TEXT,
        inventory TEXT DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, guild_id),
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_economy_user_guild ON economy(user_id, guild_id);
    CREATE INDEX IF NOT EXISTS idx_economy_balance ON economy(guild_id, balance DESC);

    -- =====================================================
    -- ТАБЛИЦА ПРЕДМЕТОВ
    -- =====================================================

    CREATE TABLE IF NOT EXISTS shop_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        price INTEGER NOT NULL,
        role_id TEXT,
        quantity INTEGER DEFAULT -1,
        icon TEXT,
        color TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_shop_items_guild ON shop_items(guild_id);

    -- =====================================================
    -- ТАБЛИЦА ВАРНОВ
    -- =====================================================

    CREATE TABLE IF NOT EXISTS warnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        moderator_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        active BOOLEAN DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE,
        FOREIGN KEY (moderator_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_warnings_user ON warnings(user_id, guild_id);
    CREATE INDEX IF NOT EXISTS idx_warnings_active ON warnings(active) WHERE active = 1;

    -- =====================================================
    -- ТАБЛИЦА МУТОВ
    -- =====================================================

    CREATE TABLE IF NOT EXISTS mutes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        moderator_id TEXT NOT NULL,
        reason TEXT,
        duration INTEGER,
        expires_at TIMESTAMP NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        active BOOLEAN DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE,
        FOREIGN KEY (moderator_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_mutes_active ON mutes(active, expires_at) WHERE active = 1;

    -- =====================================================
    -- ТАБЛИЦА БАНОВ
    -- =====================================================

    CREATE TABLE IF NOT EXISTS bans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        moderator_id TEXT NOT NULL,
        reason TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        active BOOLEAN DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE,
        FOREIGN KEY (moderator_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_bans_active ON bans(active) WHERE active = 1;

    -- =====================================================
    -- ТАБЛИЦА СЕССИЙ
    -- =====================================================

    CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expire TIMESTAMP NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);

    -- =====================================================
    -- ТАБЛИЦА НАСТРОЕК БОТА
    -- =====================================================

    CREATE TABLE IF NOT EXISTS bot_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by TEXT,
        FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL
    );

    -- =====================================================
    -- ТАБЛИЦА СОБЫТИЙ
    -- =====================================================

    CREATE TABLE IF NOT EXISTS event_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        user_id TEXT,
        guild_id TEXT,
        data TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_event_logs_timestamp ON event_logs(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_event_logs_type ON event_logs(event_type);

    -- =====================================================
    -- ТАБЛИЦА ЧЕРНОГО СПИСКА
    -- =====================================================

    CREATE TABLE IF NOT EXISTS blacklist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL UNIQUE,
        username TEXT,
        reason TEXT,
        added_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    -- =====================================================
    -- ТРИГГЕРЫ
    -- =====================================================

    CREATE TRIGGER IF NOT EXISTS update_family_members_timestamp 
    AFTER UPDATE ON family_members
    BEGIN
        UPDATE family_members SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_member_profiles_timestamp 
    AFTER UPDATE ON member_profiles
    BEGIN
        UPDATE member_profiles SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_economy_timestamp 
    AFTER UPDATE ON economy
    BEGIN
        UPDATE economy SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_shop_items_timestamp 
    AFTER UPDATE ON shop_items
    BEGIN
        UPDATE shop_items SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_guilds_timestamp 
    AFTER UPDATE ON guilds
    BEGIN
        UPDATE guilds SET updated_at = CURRENT_TIMESTAMP WHERE guild_id = NEW.guild_id;
    END;

    CREATE TRIGGER IF NOT EXISTS create_user_permissions
    AFTER INSERT ON users
    BEGIN
        INSERT INTO user_permissions (user_id, role, permissions)
        VALUES (NEW.user_id, 'user', '{"canViewDashboard": false}');
    END;

    -- =====================================================
    -- ТРИГГЕР ДЛЯ АВТОМАТИЧЕСКОГО СОЗДАНИЯ ПРОФИЛЯ
    -- =====================================================

    CREATE TRIGGER IF NOT EXISTS create_member_profile_on_accept
    AFTER UPDATE OF status ON applications
    WHEN NEW.status = 'accepted' AND OLD.status != 'accepted'
    BEGIN
        INSERT OR IGNORE INTO member_profiles (user_id, real_name, birth_date)
        VALUES (
            NEW.user_id,
            CASE 
                WHEN NEW.full_name LIKE '%,%' THEN substr(NEW.full_name, 1, instr(NEW.full_name, ',') - 1)
                ELSE NEW.full_name
            END,
            CASE 
                WHEN NEW.full_name LIKE '%,%,%' THEN 
                    substr(
                        NEW.full_name, 
                        instr(NEW.full_name, ',') + 1, 
                        instr(substr(NEW.full_name, instr(NEW.full_name, ',') + 1), ',') - 1
                    )
                WHEN NEW.full_name LIKE '%,%' THEN 
                    substr(NEW.full_name, instr(NEW.full_name, ',') + 1)
                ELSE NULL
            END
        );
    END;

    -- =====================================================
    -- ПРЕДУСТАНОВЛЕННЫЕ НАСТРОЙКИ
    -- =====================================================

    INSERT OR IGNORE INTO bot_settings (key, value, description) VALUES
        ('bot_name', 'Family Bot', 'Имя бота'),
        ('bot_version', '1.0.0', 'Версия бота'),
        ('main_guild_id', '', 'ID основного сервера'),
        ('member_role_id', '', 'ID роли участника'),
        ('applications_channel_id', '', 'ID канала для заявок'),
        ('logs_channel_id', '', 'ID канала для логов'),
        ('moderation_channel_id', '', 'ID канала для модерации'),
        ('welcome_channel_id', '', 'ID канала для приветствий'),
        ('welcome_message', 'Добро пожаловать {user} на сервер {guild}!', 'Приветственное сообщение'),
        ('leave_message', '{user} покинул нас', 'Сообщение при выходе'),
        ('prefix', '!', 'Префикс команд'),
        ('language', 'ru', 'Язык бота'),
        ('min_age', '16', 'Минимальный возраст для заявок'),
        ('auto_delete_applications', 'false', 'Автоматически удалять обработанные заявки'),
        ('applications_expiry_days', '30', 'Срок хранения заявок в днях'),
        ('max_warnings', '3', 'Максимальное количество предупреждений до бана'),
        ('enable_leveling', 'true', 'Включить систему уровней'),
        ('enable_economy', 'true', 'Включить экономику'),
        ('enable_moderation', 'true', 'Включить модерацию'),
        ('enable_logging', 'true', 'Включить логирование'),
        ('enable_welcome', 'true', 'Включить приветствия'),
        ('enable_leave', 'true', 'Включить сообщения о выходе'),
        ('auto_mod_caps', 'false', 'Автомодерация капса'),
        ('auto_mod_links', 'false', 'Автомодерация ссылок'),
        ('auto_mod_mentions', 'false', 'Автомодерация упоминаний'),
        ('auto_mod_swears', 'false', 'Автомодерация мата'),
        ('maintenance_mode', 'false', 'Режим обслуживания'),
        ('debug_mode', 'false', 'Режим отладки');
`;