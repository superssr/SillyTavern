#!/usr/bin/env node

/**
 * 测试脚本 - 验证数据持久化功能
 */

import { persistenceManager } from './src/persistence-manager.js';

console.log('=== 数据持久化测试 ===\n');

// 测试环境变量读取
console.log('1. 测试环境变量读取:');
const envSettings = persistenceManager.readSettingsFromEnv();
console.log('   从环境变量读取的设置:', envSettings);

// 测试设置合并
console.log('\n2. 测试设置合并:');
const fileSettings = {
    user_name: 'FileUser',
    api_key_test: 'file-key-123',
    main_api: 'kobold'
};

const mergedSettings = await persistenceManager.mergeSettings(fileSettings);
console.log('   文件设置:', fileSettings);
console.log('   合并后设置:', mergedSettings);

// 检查关键环境变量
console.log('\n3. 检查关键环境变量:');
const importantVars = [
    'DEEPSEEK_API_KEY',
    'OPENAI_API_KEY', 
    'ST_SETTING_USER_NAME',
    'ST_SETTING_MAIN_API',
    'ST_SETTING_PERSONA_DESCRIPTION',
    'AUTHELIA_AUTH',
    'ENABLE_USER_ACCOUNTS',
    'BASIC_AUTH_MODE'
];

importantVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
        console.log(`   ✅ ${varName}: ${value.substring(0, 20)}...`);
    } else {
        console.log(`   ❌ ${varName}: 未设置`);
    }
});

// 检查数据迁移需求
console.log('\n4. 检查数据迁移需求:');
const needsMigration = persistenceManager.needsMigration();
console.log(`   需要数据迁移: ${needsMigration ? '是' : '否'}`);

console.log('\n=== 测试完成 ===');