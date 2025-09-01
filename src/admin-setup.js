/**
 * 管理员账号设置脚本
 * 该脚本会在服务器启动时自动执行
 */

import { dbManager } from './database-manager.js';
import crypto from 'node:crypto';

// 简单的密码哈希函数
function getSimplePasswordHash(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

export async function setupAdminUser() {
    try {
        console.log('检查并设置管理员账号...');
        
        // 检查数据库是否已初始化
        if (!dbManager.initialized) {
            console.log('数据库未初始化，跳过管理员设置');
            return false;
        }
        
        // 检查用户是否存在
        const existingUser = await dbManager.getUser('user');
        
        if (existingUser && existingUser.admin && existingUser.password) {
            console.log('管理员用户 "user" 已存在');
            return true;
        }
        
        // 创建或更新管理员用户
        const passwordHash = getSimplePasswordHash('password');
        
        const adminUser = {
            handle: 'user',
            name: 'Administrator',
            email: 'admin@sillytavern.local',
            admin: true,
            password: passwordHash
        };
        
        const success = await dbManager.upsertUser(adminUser);
        
        if (success) {
            console.log('✅ 管理员用户 "user" 创建/更新成功');
            console.log('   用户名: user');
            console.log('   密码: password');
            return true;
        } else {
            console.log('❌ 管理员用户创建失败');
            return false;
        }
        
    } catch (error) {
        console.error('设置管理员用户时出错:', error.message);
        return false;
    }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log('直接运行管理员设置脚本...');
    
    // 初始化数据库
    dbManager.init().then(async (connected) => {
        if (connected) {
            await setupAdminUser();
            await dbManager.close();
        } else {
            console.error('无法连接到数据库');
        }
    });
}