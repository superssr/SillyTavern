/**
 * When applied, this middleware will ensure the request contains the required header for basic authentication and only
 * allow access to the endpoint after successful authentication.
 */
import { Buffer } from 'node:buffer';
import storage from 'node-persist';
import { getAllUserHandles, toKey, getPasswordHash } from '../users.js';
import { getConfigValue, safeReadFileSync } from '../util.js';

const PER_USER_BASIC_AUTH = getConfigValue('perUserBasicAuth', false, 'boolean');
const ENABLE_ACCOUNTS = globalThis.COMMAND_LINE_ARGS?.enableUserAccounts ?? getConfigValue('enableUserAccounts', false, 'boolean');

const basicAuthMiddleware = async function (request, response, callback) {
    const unauthorizedWebpage = safeReadFileSync('./public/error/unauthorized.html') ?? '';
    const unauthorizedResponse = (res) => {
        res.set('WWW-Authenticate', 'Basic realm="SillyTavern", charset="UTF-8"');
        return res.status(401).send(unauthorizedWebpage);
    };

    const basicAuthUserName = getConfigValue('basicAuthUser.username');
    const basicAuthUserPassword = getConfigValue('basicAuthUser.password');
    const authHeader = request.headers.authorization;

    if (!authHeader) {
        return unauthorizedResponse(response);
    }

    const [scheme, credentials] = authHeader.split(' ');

    if (scheme !== 'Basic' || !credentials) {
        return unauthorizedResponse(response);
    }

    const usePerUserAuth = PER_USER_BASIC_AUTH && ENABLE_ACCOUNTS;
    const [username, password] = Buffer.from(credentials, 'base64')
        .toString('utf8')
        .split(':');

    if (!usePerUserAuth && username === basicAuthUserName && password === basicAuthUserPassword) {
        return callback();
    } else if (usePerUserAuth) {
        try {
            const { userStorage } = await import('../database-integration.js');
            const userHandles = await getAllUserHandles();
            
            for (const userHandle of userHandles) {
                if (username === userHandle) {
                    const user = await userStorage.getItem(toKey(userHandle));
                    if (user && user.enabled !== false) {
                        // 支持多种密码格式验证
                        let isPasswordValid = false;
                        
                        if (user.password) {
                            if (user.password.includes(':')) {
                                // 数据库格式：salt:hash
                                const [salt, storedHash] = user.password.split(':');
                                const inputHash = getPasswordHash(password, salt);
                                isPasswordValid = `${salt}:${inputHash}` === user.password;
                            } else if (user.salt) {
                                // 文件系统格式：password + salt
                                const inputHash = getPasswordHash(password, user.salt);
                                isPasswordValid = inputHash === user.password;
                            }
                        }
                        
                        if (isPasswordValid) {
                            return callback();
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Basic auth user verification failed:', error);
        }
    }
    return unauthorizedResponse(response);
};

export default basicAuthMiddleware;
