/**
 * 数据库管理器 - 完整的PostgreSQL持久化解决方案
 * 存储用户、API配置、角色卡、世界书等所有数据
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { getPasswordHash } from './users.js';
import crypto from 'node:crypto';

const { Pool } = pg;

class DatabaseManager {
    constructor() {
        this.pool = null;
        this.initialized = false;
    }

    /**
     * 初始化数据库连接（强制模式）
     */
    async init() {
        // 从环境变量获取连接字符串
        const DATABASE_URL = process.env.DATABASE_URL || process.env.DATABASE_INTERNAL_URL;
        const ALLOW_FILESYSTEM_MODE = process.env.ALLOW_FILESYSTEM_MODE === 'true';
        
        console.log('=== 数据库连接初始化 ===');
        console.log('DATABASE_URL exists:', !!DATABASE_URL);
        console.log('DATABASE_URL (masked):', DATABASE_URL ? DATABASE_URL.replace(/:[^:@]*@/, ':***@') : 'NONE');
        console.log('ALLOW_FILESYSTEM_MODE:', ALLOW_FILESYSTEM_MODE);
        
        if (!DATABASE_URL) {
            if (ALLOW_FILESYSTEM_MODE) {
                console.log('⚠️  数据库未配置，但允许文件系统模式，跳过数据库初始化');
                this.initialized = false;
                return false;
            }
            console.error('❌ 致命错误：未找到DATABASE_URL环境变量！');
            console.error('系统配置为纯数据库模式，必须提供DATABASE_URL');
            console.error('如需使用文件系统模式，请设置环境变量：ALLOW_FILESYSTEM_MODE=true');
            process.exit(1);
        }

        try {
            // 尝试多种SSL配置
            const sslConfigs = [
                // 配置1: 标准SSL配置（不验证证书）
                {
                    name: 'Standard SSL (rejectUnauthorized: false)',
                    config: {
                        connectionString: DATABASE_URL,
                        ssl: {
                            rejectUnauthorized: false
                        },
                        max: 5,
                        idleTimeoutMillis: 30000,
                        connectionTimeoutMillis: 15000,
                        acquireTimeoutMillis: 15000,
                        application_name: 'SillyTavern'
                    }
                },
                // 配置2: 要求SSL但不验证证书
                {
                    name: 'Require SSL (no cert verification)',
                    config: {
                        connectionString: DATABASE_URL,
                        ssl: true,
                        max: 5,
                        idleTimeoutMillis: 30000,
                        connectionTimeoutMillis: 15000,
                        acquireTimeoutMillis: 15000,
                        application_name: 'SillyTavern'
                    }
                },
                // 配置3: 禁用SSL（测试用）
                {
                    name: 'No SSL (testing only)',
                    config: {
                        connectionString: DATABASE_URL.replace('?sslmode=require', '').replace('sslmode=require', ''),
                        ssl: false,
                        max: 5,
                        idleTimeoutMillis: 30000,
                        connectionTimeoutMillis: 15000,
                        acquireTimeoutMillis: 15000,
                        application_name: 'SillyTavern'
                    }
                }
            ];

            let lastError;
            let connectedConfig = null;
            
            for (const { name, config } of sslConfigs) {
                console.log(`\n正在尝试配置: ${name}`);
                console.log('正在创建数据库连接池...');
                
                // 关闭之前的连接池
                if (this.pool) {
                    await this.pool.end().catch(() => {});
                }
                
                this.pool = new Pool(config);

                // 测试连接（每个配置尝试2次）
                console.log('正在测试数据库连接...');
                let configSuccess = false;
                
                for (let attempt = 1; attempt <= 2; attempt++) {
                    try {
                        console.log(`   尝试第 ${attempt} 次连接...`);
                        const result = await this.pool.query('SELECT NOW() as current_time, version() as pg_version');
                        console.log('✅ 数据库连接成功！');
                        console.log(`   使用配置: ${name}`);
                        console.log('   当前时间:', result.rows[0].current_time);
                        console.log('   PostgreSQL版本:', result.rows[0].pg_version);
                        connectedConfig = name;
                        configSuccess = true;
                        break;
                    } catch (error) {
                        lastError = error;
                        console.log(`   ❌ 第 ${attempt} 次连接失败:`, error.message);
                        if (attempt < 2) {
                            console.log('   等待 2 秒后重试...');
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        }
                    }
                }
                
                if (configSuccess) {
                    break;
                }
                
                console.log(`   配置 ${name} 全部尝试失败`);
            }
            
            if (!connectedConfig) {
                console.error(`\n❌ 所有SSL配置都失败了！最后的错误:`, lastError?.message || 'Unknown error');
                console.error('完整错误信息:', lastError);
                throw lastError || new Error('所有数据库连接配置都失败');
            }
            
            // 初始化表结构
            console.log(`\n正在使用配置 ${connectedConfig} 初始化数据库表结构...`);
            await this.initializeTables();
            console.log('✅ 数据库表结构初始化完成！');
            
            this.initialized = true;
            console.log(`✅ 数据库管理器初始化成功！使用配置: ${connectedConfig}`);
            return true;
        } catch (error) {
            console.error('❌ 数据库连接失败:', error.message);
            console.error('完整错误:', error);
            console.error('系统配置为纯数据库模式，连接失败将退出');
            process.exit(1);
        }
    }

    /**
     * 初始化数据库表
     */
    async initializeTables() {
        const queries = [
            // 用户表
            `CREATE TABLE IF NOT EXISTS users (
                handle VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                password VARCHAR(255),
                salt VARCHAR(255),
                email VARCHAR(255),
                admin BOOLEAN DEFAULT false,
                enabled BOOLEAN DEFAULT true,
                created BIGINT,
                avatar TEXT,
                settings JSONB
            )`,

            // API密钥表
            `CREATE TABLE IF NOT EXISTS api_keys (
                id SERIAL PRIMARY KEY,
                user_handle VARCHAR(255) REFERENCES users(handle) ON DELETE CASCADE,
                service VARCHAR(100) NOT NULL,
                key_value TEXT NOT NULL,
                active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_handle, service)
            )`,

            // 角色卡表
            `CREATE TABLE IF NOT EXISTS characters (
                id SERIAL PRIMARY KEY,
                user_handle VARCHAR(255) REFERENCES users(handle) ON DELETE CASCADE,
                filename VARCHAR(255) NOT NULL,
                name VARCHAR(255),
                description TEXT,
                personality TEXT,
                scenario TEXT,
                first_mes TEXT,
                mes_example TEXT,
                avatar TEXT,
                data JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_handle, filename)
            )`,

            // 世界书表
            `CREATE TABLE IF NOT EXISTS world_books (
                id SERIAL PRIMARY KEY,
                user_handle VARCHAR(255) REFERENCES users(handle) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                entries JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_handle, name)
            )`,

            // 聊天记录表
            `CREATE TABLE IF NOT EXISTS chats (
                id SERIAL PRIMARY KEY,
                user_handle VARCHAR(255) REFERENCES users(handle) ON DELETE CASCADE,
                character_name VARCHAR(255),
                chat_id VARCHAR(255),
                messages JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_handle, chat_id)
            )`,

            // 设置表
            `CREATE TABLE IF NOT EXISTS settings (
                user_handle VARCHAR(255) PRIMARY KEY REFERENCES users(handle) ON DELETE CASCADE,
                settings JSONB,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // 预设表
            `CREATE TABLE IF NOT EXISTS presets (
                id SERIAL PRIMARY KEY,
                user_handle VARCHAR(255) REFERENCES users(handle) ON DELETE CASCADE,
                type VARCHAR(50) NOT NULL,
                name VARCHAR(255) NOT NULL,
                data JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_handle, type, name)
            )`,

            // 背景图片表
            `CREATE TABLE IF NOT EXISTS backgrounds (
                id SERIAL PRIMARY KEY,
                user_handle VARCHAR(255) REFERENCES users(handle) ON DELETE CASCADE,
                filename VARCHAR(255) NOT NULL,
                data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_handle, filename)
            )`
        ];

        const tableNames = ['users', 'api_keys', 'characters', 'world_books', 'chats', 'settings', 'presets', 'backgrounds'];
        
        for (let i = 0; i < queries.length; i++) {
            const tableName = tableNames[i];
            console.log(`   创建表: ${tableName}...`);
            await this.pool.query(queries[i]);
            console.log(`   ✅ 表 ${tableName} 创建完成`);
        }
        
        // 验证所有表都已创建
        const tablesResult = await this.pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);
        
        console.log('   已创建的数据表:');
        tablesResult.rows.forEach(row => {
            console.log(`   - ${row.table_name}`);
        });
    }

    // ========== 用户管理 ==========

    /**
     * 创建或更新用户
     */
    async upsertUser(user) {
        if (!this.initialized) return false;

        const query = `
            INSERT INTO users (handle, name, password, salt, email, admin, enabled, created, avatar, settings)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (handle) 
            DO UPDATE SET 
                name = EXCLUDED.name,
                password = EXCLUDED.password,
                salt = EXCLUDED.salt,
                email = EXCLUDED.email,
                admin = EXCLUDED.admin,
                enabled = EXCLUDED.enabled,
                avatar = EXCLUDED.avatar,
                settings = EXCLUDED.settings
        `;

        const values = [
            user.handle,
            user.name || user.handle,
            user.password || '',
            user.salt || '',
            user.email || `${user.handle}@local`,
            user.admin || false,
            user.enabled !== false,
            user.created || Date.now(),
            user.avatar || null,
            JSON.stringify(user.settings || {})
        ];

        try {
            await this.pool.query(query, values);
            return true;
        } catch (error) {
            console.error('Error upserting user:', error);
            return false;
        }
    }

    /**
     * 获取用户
     */
    async getUser(handle) {
        if (!this.initialized) return null;

        const query = 'SELECT * FROM users WHERE handle = $1';
        
        try {
            const result = await this.pool.query(query, [handle]);
            if (result.rows.length > 0) {
                const user = result.rows[0];
                user.created = parseInt(user.created);
                user.settings = user.settings || {};
                return user;
            }
            return null;
        } catch (error) {
            console.error('Error getting user:', error);
            return null;
        }
    }

    /**
     * 获取所有用户
     */
    async getAllUsers() {
        if (!this.initialized) return [];

        const query = 'SELECT * FROM users ORDER BY created ASC';
        
        try {
            const result = await this.pool.query(query);
            return result.rows.map(user => {
                user.created = parseInt(user.created);
                user.settings = user.settings || {};
                return user;
            });
        } catch (error) {
            console.error('Error getting all users:', error);
            return [];
        }
    }

    // ========== API密钥管理 ==========

    /**
     * 保存API密钥
     */
    async saveApiKey(userHandle, service, keyValue) {
        if (!this.initialized) return false;

        const query = `
            INSERT INTO api_keys (user_handle, service, key_value)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_handle, service)
            DO UPDATE SET key_value = EXCLUDED.key_value, active = true
        `;

        try {
            await this.pool.query(query, [userHandle, service, keyValue]);
            return true;
        } catch (error) {
            console.error('Error saving API key:', error);
            return false;
        }
    }

    /**
     * 获取API密钥
     */
    async getApiKey(userHandle, service) {
        if (!this.initialized) return null;

        const query = 'SELECT key_value FROM api_keys WHERE user_handle = $1 AND service = $2 AND active = true';
        
        try {
            const result = await this.pool.query(query, [userHandle, service]);
            return result.rows[0]?.key_value || null;
        } catch (error) {
            console.error('Error getting API key:', error);
            return null;
        }
    }

    // ========== 角色卡管理 ==========

    /**
     * 保存角色卡
     */
    async saveCharacter(userHandle, character) {
        if (!this.initialized) return false;

        const query = `
            INSERT INTO characters (user_handle, filename, name, description, personality, scenario, first_mes, mes_example, avatar, data)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (user_handle, filename)
            DO UPDATE SET 
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                personality = EXCLUDED.personality,
                scenario = EXCLUDED.scenario,
                first_mes = EXCLUDED.first_mes,
                mes_example = EXCLUDED.mes_example,
                avatar = EXCLUDED.avatar,
                data = EXCLUDED.data,
                updated_at = CURRENT_TIMESTAMP
        `;

        // 提取角色数据字段（支持新的数据结构）
        const characterData = character.data || character;
        const name = characterData.name || characterData.data?.name || '';
        const description = characterData.description || characterData.data?.description || '';
        const personality = characterData.personality || characterData.data?.personality || '';
        const scenario = characterData.scenario || characterData.data?.scenario || '';
        const first_mes = characterData.first_mes || characterData.data?.first_mes || '';
        const mes_example = characterData.mes_example || characterData.data?.mes_example || '';

        const values = [
            userHandle,
            character.filename || `${name}.png`,
            name,
            description,
            personality,
            scenario,
            first_mes,
            mes_example,
            character.avatar || '',
            JSON.stringify(character)
        ];

        try {
            await this.pool.query(query, values);
            console.log(`角色已保存到数据库: ${name} (${character.filename})`);
            return true;
        } catch (error) {
            console.error('保存角色失败:', error);
            return false;
        }
    }

    /**
     * 获取角色卡
     */
    async getCharacter(userHandle, filename) {
        if (!this.initialized) return null;

        const query = 'SELECT data FROM characters WHERE user_handle = $1 AND filename = $2';
        
        try {
            const result = await this.pool.query(query, [userHandle, filename]);
            return result.rows[0]?.data || null;
        } catch (error) {
            console.error('Error getting character:', error);
            return null;
        }
    }

    /**
     * 获取所有角色卡
     */
    async getAllCharacters(userHandle) {
        if (!this.initialized) return [];

        const query = 'SELECT data FROM characters WHERE user_handle = $1 ORDER BY updated_at DESC';
        
        try {
            const result = await this.pool.query(query, [userHandle]);
            return result.rows.map(row => row.data).filter(Boolean);
        } catch (error) {
            console.error('获取所有角色失败:', error);
            return [];
        }
    }

    // ========== 世界书管理 ==========

    /**
     * 保存世界书
     */
    async saveWorldBook(userHandle, worldBook) {
        if (!this.initialized) return false;

        const query = `
            INSERT INTO world_books (user_handle, name, description, entries)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_handle, name)
            DO UPDATE SET 
                description = EXCLUDED.description,
                entries = EXCLUDED.entries,
                updated_at = CURRENT_TIMESTAMP
        `;

        const values = [
            userHandle,
            worldBook.name,
            worldBook.description,
            JSON.stringify(worldBook.entries || [])
        ];

        try {
            await this.pool.query(query, values);
            return true;
        } catch (error) {
            console.error('Error saving world book:', error);
            return false;
        }
    }

    /**
     * 获取世界书
     */
    async getWorldBook(userHandle, name) {
        if (!this.initialized) return null;

        const query = 'SELECT * FROM world_books WHERE user_handle = $1 AND name = $2';
        
        try {
            const result = await this.pool.query(query, [userHandle, name]);
            if (result.rows[0]) {
                const book = result.rows[0];
                book.entries = book.entries || [];
                return book;
            }
            return null;
        } catch (error) {
            console.error('Error getting world book:', error);
            return null;
        }
    }

    // ========== 聊天记录管理 ==========

    /**
     * 保存聊天记录
     */
    async saveChat(userHandle, characterName, fileName, messages) {
        if (!this.initialized) return false;

        // 生成唯一的聊天ID，结合角色名和文件名
        const chatId = `${characterName}_${fileName}`;

        const query = `
            INSERT INTO chats (user_handle, chat_id, character_name, messages)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_handle, chat_id)
            DO UPDATE SET 
                messages = EXCLUDED.messages,
                updated_at = CURRENT_TIMESTAMP
        `;

        const values = [
            userHandle,
            chatId,
            characterName,
            JSON.stringify(messages)
        ];

        try {
            await this.pool.query(query, values);
            console.log(`聊天记录已保存到数据库: ${chatId}`);
            return true;
        } catch (error) {
            console.error('保存聊天记录失败:', error);
            return false;
        }
    }

    /**
     * 获取聊天记录
     */
    async getChat(userHandle, characterName, fileName) {
        if (!this.initialized) return null;

        // 生成对应的聊天ID
        const chatId = `${characterName}_${fileName}`;

        const query = 'SELECT messages FROM chats WHERE user_handle = $1 AND chat_id = $2';
        
        try {
            const result = await this.pool.query(query, [userHandle, chatId]);
            const messages = result.rows[0]?.messages;
            return messages ? JSON.parse(messages) : null;
        } catch (error) {
            console.error('获取聊天记录失败:', error);
            return null;
        }
    }

    // ========== 设置管理 ==========

    /**
     * 保存用户设置
     */
    async saveSettings(userHandle, settings) {
        if (!this.initialized) return false;

        const query = `
            INSERT INTO settings (user_handle, settings)
            VALUES ($1, $2)
            ON CONFLICT (user_handle)
            DO UPDATE SET 
                settings = EXCLUDED.settings,
                updated_at = CURRENT_TIMESTAMP
        `;

        try {
            await this.pool.query(query, [userHandle, JSON.stringify(settings)]);
            return true;
        } catch (error) {
            console.error('Error saving settings:', error);
            return false;
        }
    }

    /**
     * 获取用户设置
     */
    async getSettings(userHandle) {
        if (!this.initialized) return null;

        const query = 'SELECT settings FROM settings WHERE user_handle = $1';
        
        try {
            const result = await this.pool.query(query, [userHandle]);
            return result.rows[0]?.settings || null;
        } catch (error) {
            console.error('Error getting settings:', error);
            return null;
        }
    }

    // ========== 初始化默认用户 ==========

    /**
     * 创建默认用户
     */
    async createDefaultUsers() {
        if (!this.initialized) return;

        // 创建mike用户
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = getPasswordHash('mike', salt);
        
        const mikeUser = {
            handle: 'mike',
            name: 'Mike',
            password: passwordHash,
            salt: salt,
            email: 'mike@chatmask.io',
            admin: true,
            enabled: true,
            created: Date.now()
        };

        await this.upsertUser(mikeUser);
        console.log('Created default user: mike (password: mike)');

        // 创建default-user
        const defaultUser = {
            handle: 'default-user',
            name: 'User',
            password: '',
            salt: '',
            email: 'user@local',
            admin: true,
            enabled: true,
            created: Date.now()
        };

        await this.upsertUser(defaultUser);
        console.log('Created default user: default-user (no password)');
    }

    /**
     * 关闭数据库连接
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.initialized = false;
        }
    }
}

// 导出单例
export const dbManager = new DatabaseManager();