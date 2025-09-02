import fs from 'node:fs';
import path from 'node:path';

import express from 'express';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import { isPureDatabaseMode } from '../database-integration.js';

/**
 * Reads a World Info file and returns its contents
 * @param {import('../users.js').UserDirectoryList} directories User directories
 * @param {string} worldInfoName Name of the World Info file
 * @param {boolean} allowDummy If true, returns an empty object if the file doesn't exist
 * @returns {object} World Info file contents
 */
export function readWorldInfoFile(directories, worldInfoName, allowDummy) {
    const dummyObject = allowDummy ? { entries: {} } : null;

    // 在纯数据库模式下返回虚拟对象
    if (isPureDatabaseMode) {
        console.debug(`跳过世界信息文件读取（纯数据库模式）: ${worldInfoName}`);
        return dummyObject;
    }

    if (!worldInfoName) {
        return dummyObject;
    }

    const filename = sanitize(`${worldInfoName}.json`);
    const pathToWorldInfo = path.join(directories.worlds, filename);

    if (!fs.existsSync(pathToWorldInfo)) {
        console.error(`World info file ${filename} doesn't exist.`);
        return dummyObject;
    }

    try {
        const worldInfoText = fs.readFileSync(pathToWorldInfo, 'utf8');
        const worldInfo = JSON.parse(worldInfoText);
        return worldInfo;
    } catch (error) {
        console.error(`读取世界信息文件时发生错误: ${filename}`, error);
        return dummyObject;
    }
}

export const router = express.Router();

router.post('/get', (request, response) => {
    if (!request.body?.name) {
        return response.sendStatus(400);
    }

    const file = readWorldInfoFile(request.user.directories, request.body.name, true);

    return response.send(file);
});

router.post('/delete', (request, response) => {
    if (!request.body?.name) {
        return response.sendStatus(400);
    }

    // 在纯数据库模式下不支持文件删除
    if (isPureDatabaseMode) {
        console.debug('跳过世界信息文件删除（纯数据库模式）');
        return response.sendStatus(200);
    }

    const worldInfoName = request.body.name;
    const filename = sanitize(`${worldInfoName}.json`);
    const pathToWorldInfo = path.join(request.user.directories.worlds, filename);

    if (!fs.existsSync(pathToWorldInfo)) {
        throw new Error(`World info file ${filename} doesn't exist.`);
    }

    try {
        fs.unlinkSync(pathToWorldInfo);
        return response.sendStatus(200);
    } catch (error) {
        console.error(`删除世界信息文件时发生错误:`, error);
        return response.sendStatus(500);
    }
});

router.post('/import', (request, response) => {
    if (!request.file) return response.sendStatus(400);

    // 在纯数据库模式下不支持文件导入
    if (isPureDatabaseMode) {
        console.debug('跳过世界信息文件导入（纯数据库模式）');
        return response.status(400).send('纯数据库模式不支持文件导入');
    }

    const filename = `${path.parse(sanitize(request.file.originalname)).name}.json`;

    let fileContents = null;

    if (request.body.convertedData) {
        fileContents = request.body.convertedData;
    } else {
        try {
            const pathToUpload = path.join(request.file.destination, request.file.filename);
            fileContents = fs.readFileSync(pathToUpload, 'utf8');
            fs.unlinkSync(pathToUpload);
        } catch (error) {
            console.error('读取上传文件时发生错误:', error);
            return response.status(500).send('读取上传文件失败');
        }
    }

    try {
        const worldContent = JSON.parse(fileContents);
        if (!('entries' in worldContent)) {
            throw new Error('File must contain a world info entries list');
        }
    } catch (err) {
        return response.status(400).send('Is not a valid world info file');
    }

    try {
        const pathToNewFile = path.join(request.user.directories.worlds, filename);
        const worldName = path.parse(pathToNewFile).name;

        if (!worldName) {
            return response.status(400).send('World file must have a name');
        }

        writeFileAtomicSync(pathToNewFile, fileContents);
        return response.send({ name: worldName });
    } catch (error) {
        console.error('写入世界信息文件时发生错误:', error);
        return response.status(500).send('保存世界信息文件失败');
    }
});

router.post('/edit', (request, response) => {
    if (!request.body) {
        return response.sendStatus(400);
    }

    if (!request.body.name) {
        return response.status(400).send('World file must have a name');
    }

    // 在纯数据库模式下不支持文件编辑
    if (isPureDatabaseMode) {
        console.debug('跳过世界信息文件编辑（纯数据库模式）');
        return response.send({ ok: true });
    }

    try {
        if (!('entries' in request.body.data)) {
            throw new Error('World info must contain an entries list');
        }
    } catch (err) {
        return response.status(400).send('Is not a valid world info file');
    }

    try {
        const filename = sanitize(`${request.body.name}.json`);
        const pathToFile = path.join(request.user.directories.worlds, filename);

        writeFileAtomicSync(pathToFile, JSON.stringify(request.body.data, null, 4));
        return response.send({ ok: true });
    } catch (error) {
        console.error('保存世界信息文件时发生错误:', error);
        return response.status(500).send('保存世界信息文件失败');
    }
});
