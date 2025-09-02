/**
 * 数据持久化管理器
 * 处理云部署环境中的数据持久化问题
 */

import fs from 'node:fs';
import path from 'node:path';
import { getConfigValue } from './util.js';

class PersistenceManager {
    constructor() {
        this.useDatabase = process.env.DATABASE_URL ? true : false;
        this.dataRoot = globalThis.COMMAND_LINE_ARGS?.dataRoot || './data';
    }

    /**
     * 从环境变量读取设置数据
     */
    readSettingsFromEnv() {
        const envSettings = {};
        
        // 读取所有以ST_SETTING_开头的环境变量
        for (const [key, value] of Object.entries(process.env)) {
            if (key.startsWith('ST_SETTING_')) {
                const settingKey = key.replace('ST_SETTING_', '').toLowerCase();
                try {
                    // 尝试解析JSON值
                    envSettings[settingKey] = JSON.parse(value);
                } catch {
                    // 如果不是JSON，直接使用字符串值
                    envSettings[settingKey] = value;
                }
            }
        }

        return envSettings;
    }

    /**
     * 合并文件设置和环境变量设置
     */
    async mergeSettings(fileSettings = {}) {
        const envSettings = this.readSettingsFromEnv();
        
        // 环境变量优先级更高
        return {
            ...fileSettings,
            ...envSettings
        };
    }

    /**
     * 保存关键设置到环境变量格式
     */
    getEnvVariablesMappingForSettings(settings) {
        const mapping = [];
        
        // API相关设置
        if (settings.api_key_openai) {
            mapping.push({ key: 'OPENAI_API_KEY', value: settings.api_key_openai });
        }
        if (settings.api_key_deepseek) {
            mapping.push({ key: 'DEEPSEEK_API_KEY', value: settings.api_key_deepseek });
        }
        
        // 通用设置
        if (settings.persona_description) {
            mapping.push({ key: 'ST_SETTING_PERSONA_DESCRIPTION', value: JSON.stringify(settings.persona_description) });
        }
        if (settings.user_name) {
            mapping.push({ key: 'ST_SETTING_USER_NAME', value: settings.user_name });
        }
        if (settings.main_api) {
            mapping.push({ key: 'ST_SETTING_MAIN_API', value: settings.main_api });
        }

        return mapping;
    }

    /**
     * 保存设置到数据库
     */
    async saveSettings(userHandle, settings) {
        try {
            const { dbManager } = await import('./database-manager.js');
            return await dbManager.saveSettings(userHandle, settings);
        } catch (error) {
            console.error('保存设置到数据库失败:', error);
            return false;
        }
    }

    /**
     * 从数据库获取设置
     */
    async getSettings(userHandle) {
        try {
            const { dbManager } = await import('./database-manager.js');
            return await dbManager.getSettings(userHandle);
        } catch (error) {
            console.error('从数据库获取设置失败:', error);
            return null;
        }
    }

    /**
     * 检查是否需要数据迁移
     */
    needsMigration() {
        // 如果数据目录不存在或为空，且有环境变量配置，则需要迁移
        const dataExists = fs.existsSync(this.dataRoot) && fs.readdirSync(this.dataRoot).length > 0;
        const hasEnvSettings = Object.keys(process.env).some(key => key.startsWith('ST_SETTING_') || key.includes('API_KEY'));
        
        return !dataExists && hasEnvSettings;
    }
}

export const persistenceManager = new PersistenceManager();