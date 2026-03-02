// src/web/middleware/audit.js

/**
 * Middleware для автоматического логирования действий
 */

export function auditLog(options = {}) {
    return async (req, res, next) => {
        // Сохраняем начало запроса для замера времени
        const startTime = Date.now();
        
        // Сохраняем оригинальные методы
        const originalJson = res.json;
        const originalSend = res.send;
        
        // Перехватываем успешные ответы
        res.json = function(data) {
            // Вычисляем время выполнения
            const duration = Date.now() - startTime;
            
            if (data && data.success) {
                logAction(req, options, data, duration);
            }
            return originalJson.call(this, data);
        };
        
        res.send = function(data) {
            const duration = Date.now() - startTime;
            
            // Пытаемся распарсить JSON
            try {
                const jsonData = JSON.parse(data);
                if (jsonData && jsonData.success) {
                    logAction(req, options, jsonData, duration);
                }
            } catch (e) {
                // Не JSON, пропускаем
            }
            return originalSend.call(this, data);
        };
        
        next();
    };
}

async function logAction(req, options, responseData, duration) {
    const db = req.app.locals.db || global.dbManager;
    if (!db) return;
    
    try {
        // Определяем тип сущности
        let entityType = options.entityType;
        let entityId = options.entityId || req.params.id;
        let action = options.action;
        
        // Авто-определение типа сущности из URL
        if (!entityType) {
            if (req.path.includes('/applications/')) entityType = 'application';
            else if (req.path.includes('/family-members/')) entityType = 'member';
            else if (req.path.includes('/admins')) entityType = 'admin';
            else if (req.path.includes('/reject-templates')) entityType = 'template';
            else if (req.path.includes('/audit')) entityType = 'audit';
            else entityType = 'other';
        }
        
        // Авто-определение действия из метода
        if (!action) {
            if (req.method === 'POST') {
                if (req.path.endsWith('/accept')) action = 'accept';
                else if (req.path.endsWith('/reject')) action = 'reject';
                else if (req.path.endsWith('/archive')) action = 'archive';
                else if (req.path.endsWith('/restore')) action = 'restore';
                else if (req.path.endsWith('/exclude')) action = 'exclude';
                else action = 'create';
            } else if (req.method === 'PUT' || req.method === 'PATCH') {
                action = 'update';
            } else if (req.method === 'DELETE') {
                action = 'delete';
            } else {
                action = req.method.toLowerCase();
            }
        }
        
        // Формируем полное имя действия
        const fullAction = entityType !== 'other' ? `${entityType}_${action}` : action;
        
        // Подготавливаем данные для лога
        const logData = {
            user_id: req.user?.user_id,
            action: fullAction,
            entity_type: entityType !== 'other' ? entityType : null,
            entity_id: entityId,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        };
        
        // Добавляем детали запроса (только для важных действий)
        const importantActions = ['accept', 'reject', 'exclude', 'delete', 'create_admin'];
        if (importantActions.includes(action) || options.details) {
            logData.details = JSON.stringify({
                method: req.method,
                path: req.path,
                params: req.params,
                query: req.query,
                body: options.logBody !== false ? req.body : undefined,
                response: options.logResponse !== false ? responseData : undefined,
                duration: `${duration}ms`
            });
        }
        
        // Сохраняем в БД асинхронно, не блокируя ответ
        // Используем try/catch вместо .catch() так как addDetailedLog не возвращает Promise
        setTimeout(() => {
            try {
                db.addDetailedLog(logData);
            } catch (err) {
                console.error('Ошибка при логировании:', err);
            }
        }, 0);
        
        // Уведомляем через WebSocket о новом логе (только важные)
        if (global.io && importantActions.includes(action)) {
            global.io.to('admin-room').emit('new_log', {
                action: fullAction,
                user: req.user?.username,
                entity_id: entityId,
                time: new Date().toISOString()
            });
        }
        
    } catch (error) {
        console.error('❌ Ошибка в auditLog middleware:', error);
    }
}

/**
 * Специализированные middleware для конкретных действий
 */

export const auditApplication = (action) => auditLog({ 
    entityType: 'application', 
    action 
});

export const auditMember = (action) => auditLog({ 
    entityType: 'member', 
    action 
});

export const auditAdmin = (action) => auditLog({ 
    entityType: 'admin', 
    action 
});

export const auditTemplate = (action) => auditLog({ 
    entityType: 'template', 
    action 
});