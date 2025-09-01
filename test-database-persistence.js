#!/usr/bin/env node

/**
 * 测试数据库持久性 - 验证数据库集成是否正常工作
 */

import { dbManager } from './src/database-manager.js';
import { setConfigFilePath } from './src/util.js';
import path from 'node:path';

// 设置配置文件路径
setConfigFilePath('./config.yaml');

console.log('=== 数据库持久性测试 ===\n');

// 设置DATABASE_URL环境变量（使用内部URL）
process.env.DATABASE_URL = 'postgresql://sillytavern_db_user:yDepy0PpspqhgbXYuDbeRobSPXXOEp2P@dpg-d2q9mjv5r7bs73afgkeg-a/sillytavern_db';

async function testDatabasePersistence() {
    try {
        console.log('1. 初始化数据库连接...');
        const connected = await dbManager.init();
        
        if (!connected) {
            console.log('   ❌ 数据库连接失败');
            return false;
        }
        
        console.log('   ✅ 数据库连接成功');
        
        // 测试用户数据持久性
        console.log('\n2. 测试用户数据持久性...');
        
        // 创建测试用户
        const testUser = {
            handle: 'test-user-' + Date.now(),
            name: 'Test User',
            email: 'test@example.com',
            admin: false
        };
        
        console.log(`   创建测试用户: ${testUser.handle}`);
        const userCreated = await dbManager.upsertUser(testUser);
        
        if (!userCreated) {
            console.log('   ❌ 用户创建失败');
            return false;
        }
        
        console.log('   ✅ 用户创建成功');
        
        // 验证用户读取
        console.log('   验证用户读取...');
        const retrievedUser = await dbManager.getUser(testUser.handle);
        
        if (!retrievedUser || retrievedUser.name !== testUser.name) {
            console.log('   ❌ 用户读取失败或数据不匹配');
            return false;
        }
        
        console.log('   ✅ 用户读取成功，数据匹配');
        
        // 测试API密钥持久性
        console.log('\n3. 测试API密钥持久性...');
        
        const testApiKey = 'sk-test-' + Date.now();
        console.log(`   保存API密钥: ${testApiKey.substring(0, 20)}...`);
        
        const apiKeySaved = await dbManager.saveApiKey(testUser.handle, 'openai', testApiKey);
        
        if (!apiKeySaved) {
            console.log('   ❌ API密钥保存失败');
            return false;
        }
        
        console.log('   ✅ API密钥保存成功');
        
        // 验证API密钥读取
        console.log('   验证API密钥读取...');
        const retrievedKey = await dbManager.getApiKey(testUser.handle, 'openai');
        
        if (retrievedKey !== testApiKey) {
            console.log('   ❌ API密钥读取失败或数据不匹配');
            console.log(`   期望: ${testApiKey}`);
            console.log(`   实际: ${retrievedKey}`);
            return false;
        }
        
        console.log('   ✅ API密钥读取成功，数据匹配');
        
        // 测试角色卡持久性
        console.log('\n4. 测试角色卡持久性...');
        
        const testCharacter = {
            filename: 'test-character-' + Date.now() + '.json',
            name: '测试角色',
            description: '这是一个测试角色',
            personality: '友好，乐于助人',
            first_message: '你好！我是测试角色。',
            data: {
                additional_data: '额外的角色数据'
            }
        };
        
        console.log(`   保存测试角色: ${testCharacter.filename}`);
        const characterSaved = await dbManager.saveCharacter(testUser.handle, testCharacter);
        
        if (!characterSaved) {
            console.log('   ❌ 角色卡保存失败');
            return false;
        }
        
        console.log('   ✅ 角色卡保存成功');
        
        // 验证角色卡读取
        console.log('   验证角色卡读取...');
        const retrievedCharacter = await dbManager.getCharacter(testUser.handle, testCharacter.filename);
        
        if (!retrievedCharacter || retrievedCharacter.name !== testCharacter.name) {
            console.log('   ❌ 角色卡读取失败或数据不匹配');
            return false;
        }
        
        console.log('   ✅ 角色卡读取成功，数据匹配');
        
        // 测试设置持久性
        console.log('\n5. 测试用户设置持久性...');
        
        const testSettings = {
            theme: 'dark',
            api_endpoint: 'https://api.openai.com',
            model: 'gpt-4',
            temperature: 0.7,
            max_tokens: 2000,
            custom_setting: '测试设置值'
        };
        
        console.log('   保存测试设置...');
        const settingsSaved = await dbManager.saveSettings(testUser.handle, testSettings);
        
        if (!settingsSaved) {
            console.log('   ❌ 设置保存失败');
            return false;
        }
        
        console.log('   ✅ 设置保存成功');
        
        // 验证设置读取
        console.log('   验证设置读取...');
        const retrievedSettings = await dbManager.getSettings(testUser.handle);
        
        if (!retrievedSettings || retrievedSettings.theme !== testSettings.theme) {
            console.log('   ❌ 设置读取失败或数据不匹配');
            return false;
        }
        
        console.log('   ✅ 设置读取成功，数据匹配');
        
        // 获取所有用户列表
        console.log('\n6. 验证用户列表...');
        const allUsers = await dbManager.getAllUsers();
        console.log(`   数据库中总用户数: ${allUsers.length}`);
        
        const testUserInList = allUsers.find(u => u.handle === testUser.handle);
        if (!testUserInList) {
            console.log('   ❌ 测试用户未在用户列表中找到');
            return false;
        }
        
        console.log('   ✅ 测试用户在用户列表中找到');
        
        // 获取所有角色卡列表
        console.log('\n7. 验证角色卡列表...');
        const allCharacters = await dbManager.getAllCharacters(testUser.handle);
        console.log(`   用户 ${testUser.handle} 的角色卡数量: ${allCharacters.length}`);
        
        const testCharacterInList = allCharacters.find(c => c.filename === testCharacter.filename);
        if (!testCharacterInList) {
            console.log('   ❌ 测试角色卡未在角色卡列表中找到');
            return false;
        }
        
        console.log('   ✅ 测试角色卡在角色卡列表中找到');
        
        console.log('\n✅ 所有数据库持久性测试通过！');
        console.log('\n📊 测试总结:');
        console.log('   - 用户数据: ✅ 创建、读取成功');
        console.log('   - API密钥: ✅ 保存、读取成功');
        console.log('   - 角色卡数据: ✅ 保存、读取成功');
        console.log('   - 用户设置: ✅ 保存、读取成功');
        console.log('   - 数据列表: ✅ 用户列表、角色卡列表正常');
        
        return true;
        
    } catch (error) {
        console.error('\n❌ 测试过程中出现错误:', error.message);
        console.error('完整错误:', error);
        return false;
    }
}

// 运行测试
testDatabasePersistence()
    .then((success) => {
        if (success) {
            console.log('\n🎉 数据库持久性测试完全成功！');
            console.log('系统已成功实现纯数据库存储模式。');
        } else {
            console.log('\n💥 数据库持久性测试失败！');
            process.exit(1);
        }
    })
    .catch((error) => {
        console.error('❌ 测试执行失败:', error);
        process.exit(1);
    })
    .finally(async () => {
        if (dbManager.initialized) {
            await dbManager.close();
            console.log('数据库连接已关闭');
        }
        console.log('\n=== 测试完成 ===');
    });