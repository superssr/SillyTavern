/**
 * 用户数据持久化扩展
 * 通过环境变量保存用户账户信息
 */

import crypto from 'node:crypto';
import { getPasswordHash } from './users.js';

class UserPersistence {
    constructor() {
        this.envPrefix = 'ST_USER_';
    }

    /**
     * 从环境变量加载用户
     * @returns {Array} 用户列表
     */
    loadUsersFromEnv() {
        const users = [];
        
        // 查找所有用户环境变量
        // 格式: ST_USER_USERNAME=password_hash:salt:email:admin:enabled
        for (const [key, value] of Object.entries(process.env)) {
            if (key.startsWith(this.envPrefix)) {
                const handle = key.replace(this.envPrefix, '').toLowerCase();
                const [passwordHash, salt, email, admin, enabled] = value.split(':');
                
                users.push({
                    handle,
                    name: handle,
                    created: Date.now(),
                    password: passwordHash || '',
                    salt: salt || '',
                    email: email || `${handle}@local`,
                    admin: admin === 'true',
                    enabled: enabled !== 'false'
                });
            }
        }
        
        return users;
    }

    /**
     * 生成用户环境变量字符串
     * @param {Object} user 用户对象
     * @returns {string} 环境变量值
     */
    generateEnvValue(user) {
        return `${user.password}:${user.salt}:${user.email || ''}:${user.admin}:${user.enabled}`;
    }

    /**
     * 创建预设用户mike
     * @returns {Object} 用户配置
     */
    createMikeUser() {
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = getPasswordHash('mike', salt);
        
        return {
            handle: 'mike',
            name: 'Mike',
            created: Date.now(),
            password: passwordHash,
            salt: salt,
            email: 'mike@local',
            admin: true,
            enabled: true
        };
    }

    /**
     * 获取用户环境变量映射
     * @returns {Array} 环境变量列表
     */
    getUserEnvVars() {
        const mike = this.createMikeUser();
        
        return [
            {
                key: 'ST_USER_MIKE',
                value: this.generateEnvValue(mike)
            }
        ];
    }
}

export const userPersistence = new UserPersistence();