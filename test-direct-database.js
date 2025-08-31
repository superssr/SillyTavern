#!/usr/bin/env node

/**
 * 直接数据库连接测试
 */

import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;

console.log('=== 直接数据库连接测试 ===\n');

const DATABASE_URL = 'postgresql://sillytavern_db_user:yDepy0PpspqhgbXYuDbeRobSPXXOEp2P@dpg-d2q9mjv5r7bs73afgkeg-a/sillytavern_db';

let pool;

// 密码哈希函数（从users.js复制）
function getPasswordHash(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

try {
    console.log('1. 连接数据库...');
    pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    // 测试连接
    await pool.query('SELECT NOW()');
    console.log('   ✅ 数据库连接成功！');
    
    console.log('\n2. 创建用户表...');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
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
        )
    `);
    console.log('   ✅ 用户表创建成功！');
    
    console.log('\n3. 创建Mike用户...');
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
    
    await pool.query(`
        INSERT INTO users (handle, name, password, salt, email, admin, enabled, created)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (handle) 
        DO UPDATE SET 
            name = EXCLUDED.name,
            password = EXCLUDED.password,
            salt = EXCLUDED.salt,
            email = EXCLUDED.email,
            admin = EXCLUDED.admin,
            enabled = EXCLUDED.enabled
    `, [mikeUser.handle, mikeUser.name, mikeUser.password, mikeUser.salt, 
        mikeUser.email, mikeUser.admin, mikeUser.enabled, mikeUser.created]);
    
    console.log('   ✅ Mike用户创建成功！密码: mike');
    
    console.log('\n4. 验证用户登录...');
    const result = await pool.query('SELECT * FROM users WHERE handle = $1', ['mike']);
    if (result.rows.length > 0) {
        const user = result.rows[0];
        const testPasswordHash = getPasswordHash('mike', user.salt);
        const passwordMatch = testPasswordHash === user.password;
        
        console.log(`   用户查询: ✅ 找到用户`);
        console.log(`   密码验证: ${passwordMatch ? '✅' : '❌'} ${passwordMatch ? '密码正确' : '密码错误'}`);
        console.log(`   用户信息:`);
        console.log(`      - 用户名: ${user.name}`);
        console.log(`      - 邮箱: ${user.email}`);
        console.log(`      - 管理员: ${user.admin}`);
        console.log(`      - 状态: ${user.enabled ? '启用' : '禁用'}`);
    } else {
        console.log('   ❌ 用户未找到');
    }
    
    console.log('\n5. 获取所有用户...');
    const allUsersResult = await pool.query('SELECT handle, name, email, admin, enabled FROM users ORDER BY created ASC');
    console.log(`   数据库中用户数量: ${allUsersResult.rows.length}`);
    allUsersResult.rows.forEach(user => {
        console.log(`   - ${user.handle} (${user.name}) - ${user.admin ? '管理员' : '普通用户'} - ${user.enabled ? '启用' : '禁用'}`);
    });
    
} catch (error) {
    console.error('❌ 测试失败:', error);
} finally {
    if (pool) {
        await pool.end();
        console.log('\n数据库连接已关闭');
    }
}

console.log('\n=== 测试完成 ===');