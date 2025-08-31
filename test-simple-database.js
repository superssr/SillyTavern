#!/usr/bin/env node

/**
 * 简单数据库连接测试
 */

import { dbManager } from './src/database-manager.js';

console.log('=== 简单数据库连接测试 ===\n');

// 设置DATABASE_URL环境变量
process.env.DATABASE_URL = 'postgresql://sillytavern_db_user:yDepy0PpspqhgbXYuDbeRobSPXXOEp2P@dpg-d2q9mjv5r7bs73afgkeg-a/sillytavern_db';

try {
    console.log('1. 连接数据库...');
    const connected = await dbManager.init();
    
    if (connected) {
        console.log('   ✅ 数据库连接成功！');
        
        console.log('\n2. 测试创建默认用户...');
        await dbManager.createDefaultUsers();
        
        console.log('\n3. 验证用户数据...');
        const mikeUser = await dbManager.getUser('mike');
        if (mikeUser) {
            console.log('   ✅ Mike用户创建成功！');
            console.log(`      - 用户名: ${mikeUser.name}`);
            console.log(`      - 邮箱: ${mikeUser.email}`);
            console.log(`      - 管理员: ${mikeUser.admin}`);
        } else {
            console.log('   ❌ Mike用户创建失败');
        }
        
        const defaultUser = await dbManager.getUser('default-user');
        if (defaultUser) {
            console.log('   ✅ default-user创建成功！');
            console.log(`      - 用户名: ${defaultUser.name}`);
            console.log(`      - 邮箱: ${defaultUser.email}`);
        } else {
            console.log('   ❌ default-user创建失败');
        }
        
        console.log('\n4. 测试API密钥功能...');
        await dbManager.saveApiKey('mike', 'openai', 'sk-test-123');
        const apiKey = await dbManager.getApiKey('mike', 'openai');
        console.log(`   API密钥测试: ${apiKey === 'sk-test-123' ? '✅ 成功' : '❌ 失败'}`);
        
        console.log('\n5. 获取所有用户...');
        const allUsers = await dbManager.getAllUsers();
        console.log(`   数据库中用户数量: ${allUsers.length}`);
        allUsers.forEach(user => {
            console.log(`   - ${user.handle} (${user.name})`);
        });
        
    } else {
        console.log('   ❌ 数据库连接失败');
    }
    
} catch (error) {
    console.error('❌ 测试出错:', error);
} finally {
    if (dbManager.initialized) {
        await dbManager.close();
        console.log('\n数据库连接已关闭');
    }
}

console.log('\n=== 测试完成 ===');