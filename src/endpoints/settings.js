import fs from 'node:fs';
import path from 'node:path';

import express from 'express';
import _ from 'lodash';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { SETTINGS_FILE } from '../constants.js';
import { getConfigValue, generateTimestamp, removeOldBackups } from '../util.js';
import { getAllUserHandles, getUserDirectories } from '../users.js';
import { getFileNameValidationFunction } from '../middleware/validateFileName.js';
import { persistenceManager } from '../persistence-manager.js';
import { isPureDatabaseMode } from '../database-integration.js';

const ENABLE_EXTENSIONS = !!getConfigValue('extensions.enabled', true, 'boolean');
const ENABLE_EXTENSIONS_AUTO_UPDATE = !!getConfigValue('extensions.autoUpdate', true, 'boolean');
const ENABLE_ACCOUNTS = globalThis.COMMAND_LINE_ARGS?.enableUserAccounts ?? !!getConfigValue('enableUserAccounts', false, 'boolean');

// 10 minutes
const AUTOSAVE_INTERVAL = 10 * 60 * 1000;

/**
 * Map of functions to trigger settings autosave for a user.
 * @type {Map<string, function>}
 */
const AUTOSAVE_FUNCTIONS = new Map();

/**
 * Triggers autosave for a user every 10 minutes.
 * @param {string} handle User handle
 * @returns {void}
 */
function triggerAutoSave(handle) {
    if (!AUTOSAVE_FUNCTIONS.has(handle)) {
        const throttledAutoSave = _.throttle(() => backupUserSettings(handle, true), AUTOSAVE_INTERVAL);
        AUTOSAVE_FUNCTIONS.set(handle, throttledAutoSave);
    }

    const functionToCall = AUTOSAVE_FUNCTIONS.get(handle);
    if (functionToCall && typeof functionToCall === 'function') {
        functionToCall();
    }
}

/**
 * Reads and parses files from a directory.
 * @param {string} directoryPath Path to the directory
 * @param {string} fileExtension File extension
 * @returns {Array} Parsed files
 */
function readAndParseFromDirectory(directoryPath, fileExtension = '.json') {
    // 在纯数据库模式下返回空数组
    if (isPureDatabaseMode) {
        console.debug(`跳过目录读取（纯数据库模式）: ${directoryPath}`);
        return [];
    }
    
    // 检查目录是否存在
    if (!fs.existsSync(directoryPath)) {
        console.warn(`目录不存在，返回空结果: ${directoryPath}`);
        return [];
    }

    try {
        const files = fs
            .readdirSync(directoryPath)
            .filter(x => path.parse(x).ext == fileExtension)
            .sort();

        const parsedFiles = [];

        files.forEach(item => {
            try {
                const file = fs.readFileSync(path.join(directoryPath, item), 'utf-8');
                parsedFiles.push(fileExtension == '.json' ? JSON.parse(file) : file);
            }
            catch {
                // skip
            }
        });

        return parsedFiles;
    } catch (error) {
        console.error(`读取目录 ${directoryPath} 时发生错误:`, error);
        return [];
    }
}

/**
 * Gets a sort function for sorting strings.
 * @param {*} _
 * @returns {(a: string, b: string) => number} Sort function
 */
function sortByName(_) {
    return (a, b) => a.localeCompare(b);
}

/**
 * Gets backup file prefix for user settings.
 * @param {string} handle User handle
 * @returns {string} File prefix
 */
export function getSettingsBackupFilePrefix(handle) {
    return `settings_${handle}_`;
}

function readPresetsFromDirectory(directoryPath, options = {}) {
    const {
        sortFunction,
        removeFileExtension = false,
        fileExtension = '.json',
    } = options;

    // 在纯数据库模式下返回空结果
    if (isPureDatabaseMode) {
        console.debug(`跳过预设目录读取（纯数据库模式）: ${directoryPath}`);
        return { fileContents: [], fileNames: [] };
    }

    // 检查目录是否存在，如果不存在则返回空结果
    if (!fs.existsSync(directoryPath)) {
        console.warn(`目录不存在，跳过读取: ${directoryPath}`);
        return { fileContents: [], fileNames: [] };
    }

    try {
        const files = fs.readdirSync(directoryPath).sort(sortFunction).filter(x => path.parse(x).ext == fileExtension);
        const fileContents = [];
        const fileNames = [];

        files.forEach(item => {
            try {
                const file = fs.readFileSync(path.join(directoryPath, item), 'utf8');
                JSON.parse(file);
                fileContents.push(file);
                fileNames.push(removeFileExtension ? item.replace(/\.[^/.]+$/, '') : item);
            } catch {
                // skip
                console.warn(`${item} is not a valid JSON`);
            }
        });

        return { fileContents, fileNames };
    } catch (error) {
        console.error(`读取目录 ${directoryPath} 时发生错误:`, error);
        return { fileContents: [], fileNames: [] };
    }
}

async function backupSettings() {
    try {
        const userHandles = await getAllUserHandles();

        for (const handle of userHandles) {
            backupUserSettings(handle, true);
        }
    } catch (err) {
        console.error('Could not backup settings file', err);
    }
}

/**
 * Makes a backup of the user's settings file.
 * @param {string} handle User handle
 * @param {boolean} preventDuplicates Prevent duplicate backups
 * @returns {void}
 */
function backupUserSettings(handle, preventDuplicates) {
    // 在纯数据库模式下跳过备份操作
    if (isPureDatabaseMode) {
        console.debug(`跳过用户设置备份（纯数据库模式）: ${handle}`);
        return;
    }
    
    const userDirectories = getUserDirectories(handle);

    if (!fs.existsSync(userDirectories.root)) {
        return;
    }

    const backupFile = path.join(userDirectories.backups, `${getSettingsBackupFilePrefix(handle)}${generateTimestamp()}.json`);
    const sourceFile = path.join(userDirectories.root, SETTINGS_FILE);

    if (preventDuplicates && isDuplicateBackup(handle, sourceFile)) {
        return;
    }

    if (!fs.existsSync(sourceFile)) {
        return;
    }

    fs.copyFileSync(sourceFile, backupFile);
    removeOldBackups(userDirectories.backups, `settings_${handle}`);
}

/**
 * Checks if the backup would be a duplicate.
 * @param {string} handle User handle
 * @param {string} sourceFile Source file path
 * @returns {boolean} True if the backup is a duplicate
 */
function isDuplicateBackup(handle, sourceFile) {
    const latestBackup = getLatestBackup(handle);
    if (!latestBackup) {
        return false;
    }
    return areFilesEqual(latestBackup, sourceFile);
}

/**
 * Returns true if the two files are equal.
 * @param {string} file1 File path
 * @param {string} file2 File path
 */
function areFilesEqual(file1, file2) {
    if (!fs.existsSync(file1) || !fs.existsSync(file2)) {
        return false;
    }

    const content1 = fs.readFileSync(file1);
    const content2 = fs.readFileSync(file2);
    return content1.toString() === content2.toString();
}

/**
 * Gets the latest backup file for a user.
 * @param {string} handle User handle
 * @returns {string|null} Latest backup file. Null if no backup exists.
 */
function getLatestBackup(handle) {
    // 在纯数据库模式下返回null
    if (isPureDatabaseMode) {
        return null;
    }
    
    const userDirectories = getUserDirectories(handle);
    
    if (!fs.existsSync(userDirectories.backups)) {
        return null;
    }
    
    try {
        const backupFiles = fs.readdirSync(userDirectories.backups)
            .filter(x => x.startsWith(getSettingsBackupFilePrefix(handle)))
            .map(x => ({ name: x, ctime: fs.statSync(path.join(userDirectories.backups, x)).ctimeMs }));
        const latestBackup = backupFiles.sort((a, b) => b.ctime - a.ctime)[0]?.name;
        if (!latestBackup) {
            return null;
        }
        return path.join(userDirectories.backups, latestBackup);
    } catch (error) {
        console.error(`获取最新备份时发生错误:`, error);
        return null;
    }
}

export const router = express.Router();

router.post('/save', async function (request, response) {
    try {
        // 在纯数据库模式下，使用持久化管理器保存设置
        if (isPureDatabaseMode) {
            const success = await persistenceManager.saveSettings(request.user.profile.handle, request.body);
            if (!success) {
                throw new Error('Failed to save settings to database');
            }
            console.log(`设置已保存到数据库：用户 ${request.user.profile.handle}`);
        } else {
            // 文件系统模式
            const pathToSettings = path.join(request.user.directories.root, SETTINGS_FILE);
            writeFileAtomicSync(pathToSettings, JSON.stringify(request.body, null, 4), 'utf8');
            triggerAutoSave(request.user.profile.handle);
        }
        
        response.send({ result: 'ok' });
    } catch (err) {
        console.error('保存设置失败:', err);
        response.status(500).send({ error: err.message });
    }
});

// Wintermute's code
router.post('/get', async (request, response) => {
    let settings;
    try {
        let baseSettings = {};
        
        // 根据模式获取基础设置
        if (isPureDatabaseMode) {
            // 从数据库获取设置
            baseSettings = await persistenceManager.getSettings(request.user.profile.handle) || {};
            console.log(`从数据库读取设置：用户 ${request.user.profile.handle}`);
        } else {
            // 从文件读取设置
            const pathToSettings = path.join(request.user.directories.root, SETTINGS_FILE);
            try {
                const settingsContent = fs.readFileSync(pathToSettings, 'utf8');
                baseSettings = JSON.parse(settingsContent);
            } catch (e) {
                // 文件不存在或无效，使用空对象
                console.debug('设置文件不存在或无效，使用默认设置');
            }
        }
        
        // 合并基础设置和环境变量设置
        const mergedSettings = await persistenceManager.mergeSettings(baseSettings);
        settings = JSON.stringify(mergedSettings, null, 4);
    } catch (e) {
        console.error('获取设置失败:', e);
        return response.sendStatus(500);
    }

    // NovelAI Settings
    const { fileContents: novelai_settings, fileNames: novelai_setting_names }
        = readPresetsFromDirectory(request.user.directories.novelAI_Settings, {
            sortFunction: sortByName(request.user.directories.novelAI_Settings),
            removeFileExtension: true,
        });

    // OpenAI Settings
    const { fileContents: openai_settings, fileNames: openai_setting_names }
        = readPresetsFromDirectory(request.user.directories.openAI_Settings, {
            sortFunction: sortByName(request.user.directories.openAI_Settings), removeFileExtension: true,
        });

    // TextGenerationWebUI Settings
    const { fileContents: textgenerationwebui_presets, fileNames: textgenerationwebui_preset_names }
        = readPresetsFromDirectory(request.user.directories.textGen_Settings, {
            sortFunction: sortByName(request.user.directories.textGen_Settings), removeFileExtension: true,
        });

    //Kobold
    const { fileContents: koboldai_settings, fileNames: koboldai_setting_names }
        = readPresetsFromDirectory(request.user.directories.koboldAI_Settings, {
            sortFunction: sortByName(request.user.directories.koboldAI_Settings), removeFileExtension: true,
        });

    // 处理世界文件列表（纯数据库模式下返回空数组）
    let world_names = [];
    if (!isPureDatabaseMode) {
        try {
            if (fs.existsSync(request.user.directories.worlds)) {
                const worldFiles = fs
                    .readdirSync(request.user.directories.worlds)
                    .filter(file => path.extname(file).toLowerCase() === '.json')
                    .sort((a, b) => a.localeCompare(b));
                world_names = worldFiles.map(item => path.parse(item).name);
            } else {
                console.warn(`世界文件目录不存在: ${request.user.directories.worlds}`);
            }
        } catch (error) {
            console.error(`读取世界文件时发生错误:`, error);
            world_names = [];
        }
    } else {
        console.debug('跳过世界文件读取（纯数据库模式）');
    }

    const themes = readAndParseFromDirectory(request.user.directories.themes);
    const movingUIPresets = readAndParseFromDirectory(request.user.directories.movingUI);
    const quickReplyPresets = readAndParseFromDirectory(request.user.directories.quickreplies);

    const instruct = readAndParseFromDirectory(request.user.directories.instruct);
    const context = readAndParseFromDirectory(request.user.directories.context);
    const sysprompt = readAndParseFromDirectory(request.user.directories.sysprompt);
    const reasoning = readAndParseFromDirectory(request.user.directories.reasoning);

    response.send({
        settings,
        koboldai_settings,
        koboldai_setting_names,
        world_names,
        novelai_settings,
        novelai_setting_names,
        openai_settings,
        openai_setting_names,
        textgenerationwebui_presets,
        textgenerationwebui_preset_names,
        themes,
        movingUIPresets,
        quickReplyPresets,
        instruct,
        context,
        sysprompt,
        reasoning,
        enable_extensions: ENABLE_EXTENSIONS,
        enable_extensions_auto_update: ENABLE_EXTENSIONS_AUTO_UPDATE,
        enable_accounts: ENABLE_ACCOUNTS,
    });
});

router.post('/get-snapshots', async (request, response) => {
    try {
        // 在纯数据库模式下返回空列表
        if (isPureDatabaseMode) {
            console.debug('跳过快照读取（纯数据库模式）');
            return response.json([]);
        }
        
        if (!fs.existsSync(request.user.directories.backups)) {
            console.warn(`备份目录不存在: ${request.user.directories.backups}`);
            return response.json([]);
        }
        
        const snapshots = fs.readdirSync(request.user.directories.backups);
        const userFilesPattern = getSettingsBackupFilePrefix(request.user.profile.handle);
        const userSnapshots = snapshots.filter(x => x.startsWith(userFilesPattern));

        const result = userSnapshots.map(x => {
            const stat = fs.statSync(path.join(request.user.directories.backups, x));
            return { date: stat.ctimeMs, name: x, size: stat.size };
        });

        response.json(result);
    } catch (error) {
        console.error(error);
        response.sendStatus(500);
    }
});

router.post('/load-snapshot', getFileNameValidationFunction('name'), async (request, response) => {
    try {
        const userFilesPattern = getSettingsBackupFilePrefix(request.user.profile.handle);

        if (!request.body.name || !request.body.name.startsWith(userFilesPattern)) {
            return response.status(400).send({ error: 'Invalid snapshot name' });
        }

        const snapshotName = request.body.name;
        const snapshotPath = path.join(request.user.directories.backups, snapshotName);

        if (!fs.existsSync(snapshotPath)) {
            return response.sendStatus(404);
        }

        const content = fs.readFileSync(snapshotPath, 'utf8');

        response.send(content);
    } catch (error) {
        console.error(error);
        response.sendStatus(500);
    }
});

router.post('/make-snapshot', async (request, response) => {
    try {
        backupUserSettings(request.user.profile.handle, false);
        response.sendStatus(204);
    } catch (error) {
        console.error(error);
        response.sendStatus(500);
    }
});

router.post('/restore-snapshot', getFileNameValidationFunction('name'), async (request, response) => {
    try {
        const userFilesPattern = getSettingsBackupFilePrefix(request.user.profile.handle);

        if (!request.body.name || !request.body.name.startsWith(userFilesPattern)) {
            return response.status(400).send({ error: 'Invalid snapshot name' });
        }

        const snapshotName = request.body.name;
        const snapshotPath = path.join(request.user.directories.backups, snapshotName);

        if (!fs.existsSync(snapshotPath)) {
            return response.sendStatus(404);
        }

        const pathToSettings = path.join(request.user.directories.root, SETTINGS_FILE);
        fs.rmSync(pathToSettings, { force: true });
        fs.copyFileSync(snapshotPath, pathToSettings);

        response.sendStatus(204);
    } catch (error) {
        console.error(error);
        response.sendStatus(500);
    }
});

/**
 * Initializes the settings endpoint
 */
export async function init() {
    await backupSettings();
}
