// src/database/migrate.js
import dbManager from './index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 ЗАПУСК МИГРАЦИИ БАЗЫ ДАННЫХ');
    console.log('='.repeat(60));

    try {
        // 1. Проверяем подключение к базе
        console.log('\n📦 Проверка подключения к базе данных...');
        
        // 2. Создаем таблицу member_profiles
        console.log('\n📋 Создание таблицы member_profiles...');
        
        dbManager.db.exec(`
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
            )
        `);
        
        console.log('✅ Таблица member_profiles создана или уже существует');

        // 3. Создаем индексы
        console.log('\n📊 Создание индексов...');
        
        dbManager.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_member_profiles_user_id ON member_profiles(user_id);
            CREATE INDEX IF NOT EXISTS idx_member_profiles_tier ON member_profiles(tier);
        `);
        
        console.log('✅ Индексы созданы');

        // 4. Проверяем существующие данные в family_members
        console.log('\n🔍 Проверка существующих членов семьи...');
        
        const familyMembers = dbManager.db.prepare(`
            SELECT user_id, full_name FROM family_members
        `).all();
        
        console.log(`📊 Найдено членов семьи: ${familyMembers.length}`);

        // 5. Переносим данные в member_profiles
        console.log('\n📝 Перенос данных в member_profiles...');
        
        let created = 0;
        let skipped = 0;
        let errors = 0;

        for (const member of familyMembers) {
            try {
                // Проверяем, есть ли уже профиль
                const existing = dbManager.db.prepare(`
                    SELECT * FROM member_profiles WHERE user_id = ?
                `).get(member.user_id);
                
                if (existing) {
                    skipped++;
                    continue;
                }
                
                // Парсим full_name (формат: "Имя,Возраст,Ник" или "Имя,Возраст")
                let realName = '';
                let birthDate = '';
                
                if (member.full_name) {
                    const parts = member.full_name.split(',');
                    realName = parts[0]?.trim() || '';
                    if (parts.length > 1) {
                        birthDate = parts[1]?.trim() || '';
                    }
                }
                
                // Создаем профиль
                dbManager.db.prepare(`
                    INSERT INTO member_profiles (user_id, real_name, birth_date, tier)
                    VALUES (?, ?, ?, 3)
                `).run(member.user_id, realName, birthDate);
                
                created++;
                
                if (created % 10 === 0) {
                    process.stdout.write(`   • Обработано: ${created}\r`);
                }
                
            } catch (err) {
                errors++;
                console.error(`\n❌ Ошибка для пользователя ${member.user_id}:`, err.message);
            }
        }

        console.log(`\n✅ Результаты миграции:`);
        console.log(`   • Создано новых профилей: ${created}`);
        console.log(`   • Пропущено (уже были): ${skipped}`);
        console.log(`   • Ошибок: ${errors}`);

        // 6. Проверяем данные в applications (принятые заявки)
        console.log('\n🔍 Проверка принятых заявок...');
        
        const acceptedApps = dbManager.db.prepare(`
            SELECT user_id, full_name FROM applications 
            WHERE status = 'accepted' OR was_accepted = 1
        `).all();
        
        console.log(`📊 Найдено принятых заявок: ${acceptedApps.length}`);
        
        let appsCreated = 0;
        let appsSkipped = 0;

        for (const app of acceptedApps) {
            try {
                // Проверяем, есть ли уже профиль
                const existing = dbManager.db.prepare(`
                    SELECT * FROM member_profiles WHERE user_id = ?
                `).get(app.user_id);
                
                if (existing) {
                    appsSkipped++;
                    continue;
                }
                
                // Парсим full_name
                let realName = '';
                let birthDate = '';
                
                if (app.full_name) {
                    const parts = app.full_name.split(',');
                    realName = parts[0]?.trim() || '';
                    if (parts.length > 1) {
                        birthDate = parts[1]?.trim() || '';
                    }
                }
                
                // Создаем профиль
                dbManager.db.prepare(`
                    INSERT INTO member_profiles (user_id, real_name, birth_date, tier)
                    VALUES (?, ?, ?, 3)
                `).run(app.user_id, realName, birthDate);
                
                appsCreated++;
                
            } catch (err) {
                console.error(`\n❌ Ошибка для заявки ${app.user_id}:`, err.message);
            }
        }

        if (appsCreated > 0) {
            console.log(`   • Создано из заявок: ${appsCreated}`);
            console.log(`   • Пропущено из заявок: ${appsSkipped}`);
        }

        // 7. Создаем триггер для автоматического обновления timestamp
        console.log('\n⚡ Создание триггеров...');
        
        dbManager.db.exec(`
            CREATE TRIGGER IF NOT EXISTS update_member_profiles_timestamp 
            AFTER UPDATE ON member_profiles
            BEGIN
                UPDATE member_profiles SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
            END;
        `);
        
        console.log('✅ Триггеры созданы');

        // 8. Проверяем итоговое количество
        const totalProfiles = dbManager.db.prepare(`
            SELECT COUNT(*) as count FROM member_profiles
        `).get();
        
        console.log('\n📊 Итоговая статистика:');
        console.log(`   • Всего профилей в member_profiles: ${totalProfiles.count}`);

        console.log('\n' + '='.repeat(60));
        console.log('✅ МИГРАЦИЯ УСПЕШНО ЗАВЕРШЕНА');
        console.log('='.repeat(60) + '\n');

        return true;

    } catch (error) {
        console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА МИГРАЦИИ:');
        console.error(error);
        console.log('\n' + '='.repeat(60));
        return false;
    }
}

// Запускаем миграцию
runMigration()
    .then(success => {
        if (success) {
            console.log('👉 Теперь перезапустите бота командой: npm start\n');
        }
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('❌ Необработанная ошибка:', error);
        process.exit(1);
    });