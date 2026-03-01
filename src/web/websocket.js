// src/web/websocket.js
import { Server } from 'socket.io'
import dbManager from '../database/index.js'

let io = null
let updateInterval = null

function collectRealtimeStats() {
    try {
        const totalUsers = dbManager.db.prepare('SELECT COUNT(*) as count FROM users').get().count
        const totalAdmins = dbManager.db.prepare(`
            SELECT COUNT(*) as count FROM user_permissions WHERE role = 'admin'
        `).get().count
        const onlineMembers = dbManager.db.prepare(`
            SELECT COUNT(*) as count FROM users 
            WHERE last_active > datetime('now', '-5 minutes')
        `).get().count
        const onlineAdmins = dbManager.db.prepare(`
            SELECT COUNT(DISTINCT u.user_id) as count 
            FROM users u
            JOIN user_permissions up ON u.user_id = up.user_id
            WHERE up.role = 'admin' 
            AND u.last_active > datetime('now', '-5 minutes')
        `).get().count
        const totalGuilds = dbManager.db.prepare('SELECT COUNT(*) as count FROM guilds').get().count
        const commands24h = dbManager.db.prepare(`
            SELECT COUNT(*) as count FROM command_logs 
            WHERE timestamp > datetime('now', '-24 hours')
        `).get().count
        const commands1h = dbManager.db.prepare(`
            SELECT COUNT(*) as count FROM command_logs 
            WHERE timestamp > datetime('now', '-1 hour')
        `).get().count
        const messages24h = dbManager.db.prepare(`
            SELECT SUM(messages_count) as total FROM users 
            WHERE last_active > datetime('now', '-24 hours')
        `).get().total || 0
        
        const activeUsers = dbManager.db.prepare(`
            SELECT 
                u.user_id,
                u.username,
                u.avatar_url,
                u.level,
                u.messages_count,
                u.commands_used,
                u.last_active,
                CASE 
                    WHEN u.last_active > datetime('now', '-5 minutes') THEN 'online'
                    WHEN u.last_active > datetime('now', '-30 minutes') THEN 'away'
                    ELSE 'offline'
                END as status,
                (SELECT COUNT(*) FROM command_logs cl WHERE cl.user_id = u.user_id AND cl.timestamp > datetime('now', '-1 hour')) as commands_last_hour
            FROM users u
            WHERE u.last_active > datetime('now', '-24 hours')
            ORDER BY u.last_active DESC
            LIMIT 20
        `).all()
        
        const topCommands = dbManager.db.prepare(`
            SELECT 
                command,
                COUNT(*) as count,
                AVG(execution_time) as avg_time,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes
            FROM command_logs
            WHERE timestamp > datetime('now', '-24 hours')
            GROUP BY command
            ORDER BY count DESC
            LIMIT 5
        `).all()
        
        const hourlyActivity = []
        for (let i = 0; i < 24; i++) {
            const hour = dbManager.db.prepare(`
                SELECT COUNT(*) as count FROM command_logs 
                WHERE timestamp > datetime('now', '-1 day', '+' || ? || ' hours')
                AND timestamp < datetime('now', '-1 day', '+' || (? + 1) || ' hours')
            `).get(i, i)
            hourlyActivity.push(hour.count)
        }
        
        return {
            success: true,
            timestamp: Date.now(),
            stats: {
                totalUsers,
                totalAdmins,
                onlineMembers,
                onlineAdmins,
                totalGuilds,
                commands24h,
                commands1h,
                messages24h,
                onlinePercent: totalUsers > 0 ? Math.round((onlineMembers / totalUsers) * 100) : 0
            },
            activeUsers,
            topCommands,
            hourlyActivity,
            lastUpdate: new Date().toISOString()
        }
    } catch (error) {
        return {
            success: false,
            error: error.message,
            timestamp: Date.now()
        }
    }
}

export function setupWebSocket(server) {
    io = new Server(server, {
        cors: {
            origin: process.env.WEB_URL || 'http://localhost:3000',
            credentials: true
        }
    })
    
    io.on('connection', (socket) => {
        // Отправляем начальную статистику
        const initialStats = collectRealtimeStats()
        socket.emit('initial_stats', initialStats)
        
        // Подписка на обновления
        socket.on('subscribe_stats', () => {
            socket.join('stats-room')
        })
        
        // Отписка от обновлений
        socket.on('unsubscribe_stats', () => {
            socket.leave('stats-room')
        })
        
        // Ручное обновление
        socket.on('request_update', () => {
            const stats = collectRealtimeStats()
            socket.emit('stats_update', stats)
        })
    })
    
    // Запускаем интервал обновления
    updateInterval = setInterval(() => {
        if (io) {
            const stats = collectRealtimeStats()
            io.to('stats-room').emit('stats_update', stats)
        }
    }, 10000)
    
    return io
}

export function closeWebSocket() {
    if (updateInterval) {
        clearInterval(updateInterval)
        updateInterval = null
    }
    if (io) {
        io.close()
        io = null
    }
}