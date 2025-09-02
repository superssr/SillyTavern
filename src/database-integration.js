/**
 * 数据库集成模块
 * 将DatabaseManager集成到SillyTavern的各个模块中
 */

import { dbManager } from './database-manager.js';
import storage from 'node-persist';

/**
 * 用户存储代理 - 拦截node-persist调用并同步到数据库
 */
export class UserStorageProxy {
    constructor() {
        this.dbEnabled = false;
    }

    async init() {
        // 强制初始化数据库
        this.dbEnabled = await dbManager.init();
        
        if (this.dbEnabled) {
            console.log('Database storage enabled - PURE DATABASE MODE');
            // 创建默认用户
            await dbManager.createDefaultUsers();
            
            // 设置管理员账号
            try {
                const { setupAdminUser } = await import('./admin-setup.js');
                await setupAdminUser();
            } catch (error) {
                console.error('设置管理员账号失败:', error.message);
            }
        } else {
            const ALLOW_FILESYSTEM_MODE = process.env.ALLOW_FILESYSTEM_MODE === 'true';
            if (ALLOW_FILESYSTEM_MODE) {
                console.log('数据库未启用，使用文件系统模式');
            } else {
                console.error('DATABASE CONNECTION FAILED - SYSTEM REQUIRES DATABASE!');
                console.error('Please check DATABASE_URL environment variable');
                console.error('如需使用文件系统模式，请设置环境变量：ALLOW_FILESYSTEM_MODE=true');
                process.exit(1);  // 强制退出，不允许文件存储
            }
        }
    }

    /**
     * 设置项目（数据库模式或文件系统模式）
     */
    async setItem(key, value) {        
        if (this.dbEnabled) {
            // 仅保存到数据库
            if (key.startsWith('user:')) {
                const handle = key.replace('user:', '');
                const success = await dbManager.upsertUser({ ...value, handle });
                if (!success) {
                    throw new Error(`Failed to save user data to database: ${handle}`);
                }
            }
        } else {
            // 文件系统模式，使用 node-persist
            await storage.setItem(key, value);
        }
        
        return value;
    }

    /**
     * 获取项目（数据库模式或文件系统模式）
     */
    async getItem(key) {
        if (this.dbEnabled) {
            // 仅从数据库获取用户数据
            if (key.startsWith('user:')) {
                const handle = key.replace('user:', '');
                const dbUser = await dbManager.getUser(handle);
                if (!dbUser) {
                    throw new Error(`User not found in database: ${handle}`);
                }
                return dbUser;
            }
            
            throw new Error(`Non-user data access not supported in pure database mode: ${key}`);
        } else {
            // 文件系统模式，使用 node-persist
            return await storage.getItem(key);
        }
    }

    /**
     * 获取所有用户（仅从数据库）
     */
    async getAllUsers() {
        const dbUsers = await dbManager.getAllUsers();
        return dbUsers;
    }
}

/**
 * API密钥存储代理
 */
export class ApiKeyStorageProxy {
    constructor(userHandle) {
        this.userHandle = userHandle;
    }

    /**
     * 保存API密钥（仅数据库）
     */
    async save(service, key) {
        const success = await dbManager.saveApiKey(this.userHandle, service, key);
        if (!success) {
            throw new Error(`Failed to save API key to database for user: ${this.userHandle}, service: ${service}`);
        }
        return true;
    }

    /**
     * 获取API密钥（优先环境变量，然后数据库）
     */
    async get(service) {
        // 优先从环境变量（用于系统级配置）
        const envMap = {
            'openai': 'OPENAI_API_KEY',
            'deepseek': 'DEEPSEEK_API_KEY',
            'anthropic': 'ANTHROPIC_API_KEY',
            'openrouter': 'OPENROUTER_API_KEY',
            'groq': 'GROQ_API_KEY'
        };
        
        const envKey = envMap[service];
        if (envKey && process.env[envKey]) {
            return process.env[envKey];
        }
        
        // 从数据库获取
        return await dbManager.getApiKey(this.userHandle, service);
    }
}

/**
 * 角色卡存储代理
 */
export class CharacterStorageProxy {
    constructor(userHandle) {
        this.userHandle = userHandle;
    }

    /**
     * 保存角色卡（仅数据库）
     */
    async save(character) {
        const success = await dbManager.saveCharacter(this.userHandle, character);
        if (!success) {
            throw new Error(`Failed to save character to database for user: ${this.userHandle}`);
        }
        return true;
    }

    /**
     * 获取角色卡（仅数据库）
     */
    async get(filename) {
        return await dbManager.getCharacter(this.userHandle, filename);
    }

    /**
     * 获取所有角色卡（仅数据库）
     */
    async getAll() {
        return await dbManager.getAllCharacters(this.userHandle);
    }
}

/**
 * 设置存储代理
 */
export class SettingsStorageProxy {
    constructor(userHandle) {
        this.userHandle = userHandle;
    }

    /**
     * 保存设置（仅数据库）
     */
    async save(settings) {
        const success = await dbManager.saveSettings(this.userHandle, settings);
        if (!success) {
            throw new Error(`Failed to save settings to database for user: ${this.userHandle}`);
        }
        return true;
    }

    /**
     * 获取设置（数据库+环境变量）
     */
    async get() {
        // 从数据库获取基础设置
        let settings = await dbManager.getSettings(this.userHandle) || {};
        
        // 从环境变量获取系统级设置（优先级更高）
        for (const [key, value] of Object.entries(process.env)) {
            if (key.startsWith('ST_SETTING_')) {
                const settingKey = key.replace('ST_SETTING_', '').toLowerCase();
                try {
                    settings[settingKey] = JSON.parse(value);
                } catch {
                    settings[settingKey] = value;
                }
            }
        }
        
        return settings;
    }
}

// 创建全局存储代理实例
export const userStorage = new UserStorageProxy();

// 全局标志，指示是否运行在纯数据库模式下
export let isPureDatabaseMode = false;

// 初始化函数
export async function initDatabaseIntegration() {
    await userStorage.init();
    isPureDatabaseMode = userStorage.dbEnabled;
}