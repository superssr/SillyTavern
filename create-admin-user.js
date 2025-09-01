#!/usr/bin/env node

/**
 * 创建管理员用户脚本
 * 用户名: user
 * 密码: password
 */

import { dbManager } from './src/database-manager.js';
import { getPasswordHash } from './src/users.js';
import { setConfigFilePath } from './src/util.js';

// 设置配置文件路径
setConfigFilePath('./config.yaml');

console.log('=== 创建管理员用户 ===\n');

// 设置DATABASE_URL环境变量（使用内部URL）
process.env.DATABASE_URL = 'postgresql://sillytavern_db_user:yDepy0PpspqhgbXYuDbeRobSPXXOEp2P@dpg-d2q9mjv5r7bs73afgkeg-a/sillytavern_db';

async function createAdminUser() {
    try {
        console.log('1. 初始化数据库连接...');
        const connected = await dbManager.init();
        
        if (!connected) {
            console.log('   ❌ 数据库连接失败');
            return false;
        }
        
        console.log('   ✅ 数据库连接成功');
        
        // 检查用户是否已存在
        console.log('\n2. 检查用户是否已存在...');
        const existingUser = await dbManager.getUser('user');
        
        if (existingUser) {
            console.log('   ⚠️  用户 "user" 已存在，将更新密码和管理员权限');
        } else {
            console.log('   ✅ 用户 "user" 不存在，将创建新用户');
        }
        
        // 生成密码哈希
        console.log('\n3. 生成密码哈希...');
        const passwordHash = getPasswordHash('password');
        console.log('   ✅ 密码哈希生成成功');
        
        // 创建管理员用户
        console.log('\n4. 创建/更新管理员用户...');
        const adminUser = {
            handle: 'user',
            name: 'Administrator',
            email: 'admin@sillytavern.local',
            admin: true,
            password: passwordHash
        };
        
        const success = await dbManager.upsertUser(adminUser);
        
        if (!success) {
            console.log('   ❌ 管理员用户创建失败');
            return false;
        }
        
        console.log('   ✅ 管理员用户创建/更新成功！');
        
        // 验证用户创建
        console.log('\n5. 验证用户创建...');
        const verifyUser = await dbManager.getUser('user');
        
        if (!verifyUser) {
            console.log('   ❌ 用户验证失败');
            return false;
        }
        
        console.log('   ✅ 用户验证成功！');
        console.log(`      - 用户句柄: ${verifyUser.handle}`);
        console.log(`      - 用户名: ${verifyUser.name}`);
        console.log(`      - 邮箱: ${verifyUser.email}`);
        console.log(`      - 管理员权限: ${verifyUser.admin ? '是' : '否'}`);
        console.log(`      - 密码哈希: ${verifyUser.password ? '已设置' : '未设置'}`);
        
        console.log('\n✅ 管理员用户创建完成！');
        console.log('\n📋 登录信息:');
        console.log('   用户名: user');
        console.log('   密码: password');
        console.log('   管理员权限: 是');
        
        return true;
        
    } catch (error) {
        console.error('\n❌ 创建管理员用户时出错:', error.message);
        console.error('完整错误:', error);
        return false;
    }
}

// 运行脚本
createAdminUser()
    .then((success) => {
        if (success) {
            console.log('\n🎉 管理员用户创建成功！');
        } else {
            console.log('\n💥 管理员用户创建失败！');
            process.exit(1);
        }
    })
    .catch((error) => {
        console.error('❌ 脚本执行失败:', error);
        process.exit(1);
    })
    .finally(async () => {
        if (dbManager.initialized) {
            await dbManager.close();
            console.log('数据库连接已关闭');
        }
        console.log('\n=== 脚本完成 ===');
    });