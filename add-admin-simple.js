#!/usr/bin/env node

/**
 * 简化版管理员用户创建脚本
 */

import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;

console.log('=== 添加管理员用户到数据库 ===\n');

// 密码哈希函数（简化版）
function getPasswordHash(password, salt = null) {
    if (!salt) {
        salt = crypto.randomBytes(16).toString('hex');
    }
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

async function addAdminUser() {
    const DATABASE_URL = 'postgresql://sillytavern_db_user:yDepy0PpspqhgbXYuDbeRobSPXXOEp2P@dpg-d2q9mjv5r7bs73afgkeg-a.singapore-postgres.render.com/sillytavern_db?sslmode=require';
    
    const pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        },
        max: 2,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 15000
    });

    try {
        console.log('1. 连接数据库...');
        
        // 测试连接
        const testResult = await pool.query('SELECT NOW() as current_time');
        console.log('   ✅ 数据库连接成功');
        console.log('   当前时间:', testResult.rows[0].current_time);
        
        // 生成密码哈希
        console.log('\n2. 生成密码哈希...');
        const passwordHash = getPasswordHash('password');
        console.log('   ✅ 密码哈希生成成功');
        
        // 检查用户是否存在
        console.log('\n3. 检查用户是否已存在...');
        const checkUserQuery = 'SELECT handle, name, admin FROM users WHERE handle = $1';
        const existingUser = await pool.query(checkUserQuery, ['user']);
        
        if (existingUser.rows.length > 0) {
            console.log('   ⚠️  用户 "user" 已存在，将更新信息');
            console.log('   现有用户信息:', existingUser.rows[0]);
        } else {
            console.log('   ✅ 用户 "user" 不存在，将创建新用户');
        }
        
        // 插入或更新用户
        console.log('\n4. 插入/更新管理员用户...');
        const upsertQuery = `
            INSERT INTO users (handle, name, email, admin, password, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            ON CONFLICT (handle) DO UPDATE SET
                name = EXCLUDED.name,
                email = EXCLUDED.email,
                admin = EXCLUDED.admin,
                password = EXCLUDED.password,
                updated_at = NOW()
            RETURNING handle, name, email, admin, created_at, updated_at
        `;
        
        const result = await pool.query(upsertQuery, [
            'user',
            'Administrator',
            'admin@sillytavern.local',
            true,
            passwordHash
        ]);
        
        console.log('   ✅ 管理员用户操作成功！');
        console.log('   用户信息:', result.rows[0]);
        
        // 验证用户
        console.log('\n5. 验证用户创建...');
        const verifyQuery = 'SELECT handle, name, email, admin, password IS NOT NULL as has_password FROM users WHERE handle = $1';
        const verification = await pool.query(verifyQuery, ['user']);
        
        if (verification.rows.length === 0) {
            throw new Error('用户验证失败');
        }
        
        const userInfo = verification.rows[0];
        console.log('   ✅ 用户验证成功！');
        console.log(`      - 用户句柄: ${userInfo.handle}`);
        console.log(`      - 用户名: ${userInfo.name}`);
        console.log(`      - 邮箱: ${userInfo.email}`);
        console.log(`      - 管理员权限: ${userInfo.admin ? '是' : '否'}`);
        console.log(`      - 密码设置: ${userInfo.has_password ? '是' : '否'}`);
        
        console.log('\n✅ 管理员用户添加完成！');
        console.log('\n📋 登录信息:');
        console.log('   用户名: user');
        console.log('   密码: password');
        console.log('   管理员权限: 是');
        
        return true;
        
    } catch (error) {
        console.error('\n❌ 添加管理员用户时出错:', error.message);
        console.error('完整错误:', error);
        return false;
    } finally {
        await pool.end();
        console.log('数据库连接已关闭');
    }
}

// 运行脚本
addAdminUser()
    .then((success) => {
        if (success) {
            console.log('\n🎉 管理员用户添加成功！可以使用 user/password 登录');
        } else {
            console.log('\n💥 管理员用户添加失败！');
            process.exit(1);
        }
    })
    .catch((error) => {
        console.error('❌ 脚本执行失败:', error);
        process.exit(1);
    })
    .finally(() => {
        console.log('\n=== 脚本完成 ===');
    });