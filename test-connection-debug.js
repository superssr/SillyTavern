#!/usr/bin/env node

/**
 * 数据库连接调试
 */

import pg from 'pg';

const { Pool } = pg;

console.log('=== 数据库连接调试 ===\n');

// 尝试不同的连接字符串格式
const possibleUrls = [
    'postgresql://sillytavern_db_user:yDepy0PpspqhgbXYuDbeRobSPXXOEp2P@dpg-d2q9mjv5r7bs73afgkeg-a/sillytavern_db',
    'postgresql://sillytavern_db_user:yDepy0PpspqhgbXYuDbeRobSPXXOEp2P@dpg-d2q9mjv5r7bs73afgkeg-a.oregon-postgres.render.com/sillytavern_db',
    'postgresql://sillytavern_db_user:yDepy0PpspqhgbXYuDbeRobSPXXOEp2P@dpg-d2q9mjv5r7bs73afgkeg-a.postgres.render.com/sillytavern_db'
];

for (const url of possibleUrls) {
    console.log(`\n测试连接: ${url.replace(/:[^:@]*@/, ':***@')}`);
    
    let pool;
    try {
        pool = new Pool({
            connectionString: url,
            ssl: {
                rejectUnauthorized: false
            },
            connectionTimeoutMillis: 5000
        });

        const result = await pool.query('SELECT NOW() as current_time');
        console.log('   ✅ 连接成功！当前时间:', result.rows[0].current_time);
        break;
        
    } catch (error) {
        console.log('   ❌ 连接失败:', error.message);
    } finally {
        if (pool) {
            await pool.end();
        }
    }
}

console.log('\n=== 调试完成 ===');