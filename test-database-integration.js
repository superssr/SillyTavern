#!/usr/bin/env node

/**
 * 测试脚本 - 验证数据库集成功能
 */

import { initDatabaseIntegration, userStorage } from './src/database-integration.js';
import { dbManager } from './src/database-manager.js';

console.log('=== 数据库集成测试 ===\n');

try {
    // 测试数据库初始化
    console.log('1. 测试数据库初始化...');
    await initDatabaseIntegration();
    console.log(`   ✅ 数据库初始化完成，状态: ${userStorage.dbEnabled ? '已启用' : '未启用'}`);
    
    if (userStorage.dbEnabled) {
        // 测试用户创建
        console.log('\n2. 测试用户数据存储...');
        
        const testUser = {
            handle: 'test-db',
            name: 'Database Test User',
            created: Date.now(),
            password: 'test-password',
            salt: 'test-salt',
            email: 'test@db.local',
            admin: false,
            enabled: true
        };
        
        // 通过存储代理保存用户
        await userStorage.setItem('user:test-db', testUser);
        console.log('   ✅ 用户数据已保存到数据库');
        
        // 从数据库读取用户
        const retrievedUser = await userStorage.getItem('user:test-db');
        console.log('   ✅ 从数据库读取用户:', retrievedUser ? '成功' : '失败');
        
        // 获取所有用户
        console.log('\n3. 测试获取所有用户...');
        const allUsers = await userStorage.getAllUsers();
        console.log(`   ✅ 数据库中用户数量: ${allUsers.length}`);
        allUsers.forEach(user => {
            console.log(`      - ${user.handle} (${user.name})`);
        });
        
        // 测试Mike用户是否存在
        console.log('\n4. 验证Mike用户...');
        const mikeUser = await userStorage.getItem('user:mike');
        if (mikeUser) {
            console.log('   ✅ Mike用户存在于数据库中');
            console.log(`      - 用户名: ${mikeUser.name}`);
            console.log(`      - 邮箱: ${mikeUser.email}`);
            console.log(`      - 管理员: ${mikeUser.admin}`);
            console.log(`      - 启用状态: ${mikeUser.enabled}`);
        } else {
            console.log('   ❌ Mike用户不存在');
        }
        
    } else {
        console.log('\n❌ 数据库未启用，请检查DATABASE_URL环境变量');
    }
    
} catch (error) {
    console.error('\n❌ 测试失败:', error);
} finally {
    // 关闭数据库连接
    if (dbManager.initialized) {
        await dbManager.close();
        console.log('\n数据库连接已关闭');
    }
}

console.log('\n=== 测试完成 ===');