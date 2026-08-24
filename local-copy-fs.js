(function (root, factory) {
    const localCopyFs = factory();
    if (typeof module === 'object' && module.exports) module.exports = localCopyFs;
    root.LocalCopyFs = localCopyFs;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const DB_NAME = 'webdavImageSaver';
    const DB_VERSION = 1;
    const STORE_NAME = 'handles';
    const HANDLE_KEY = 'localCopyDirectory';

    function notFoundError(name) {
        const error = new Error(`NotFoundError: ${name}`);
        error.name = 'NotFoundError';
        return error;
    }

    function splitRelativePath(relativePath) {
        const segments = String(relativePath || '').split('/').map(part => part.trim()).filter(Boolean);
        if (!segments.length) throw new Error('A local file path is required.');
        const filename = segments.pop();
        return { directories: segments, filename };
    }

    async function fileExists(directoryHandle, filename) {
        try {
            await directoryHandle.getFileHandle(filename);
            return true;
        } catch (error) {
            if (error && (error.name === 'NotFoundError' || error.name === 'TypeMismatchError')) return false;
            throw error;
        }
    }

    async function uniquifyFilename(directoryHandle, filename) {
        if (!(await fileExists(directoryHandle, filename))) return filename;
        const match = /^(.*?)(\.[a-z0-9]{1,10})?$/i.exec(filename);
        const base = match && match[1] ? match[1] : 'image';
        const extension = match && match[2] ? match[2] : '';
        for (let index = 1; index < 1000; index += 1) {
            const candidate = `${base}_${index}${extension}`;
            if (!(await fileExists(directoryHandle, candidate))) return candidate;
        }
        throw new Error('Could not find a unique local filename.');
    }

    async function writeBlobToDirectory(rootHandle, relativePath, blob) {
        if (!rootHandle || typeof rootHandle.getDirectoryHandle !== 'function') {
            throw new Error('No local folder selected.');
        }
        const { directories, filename } = splitRelativePath(relativePath);
        let directoryHandle = rootHandle;
        for (const segment of directories) {
            directoryHandle = await directoryHandle.getDirectoryHandle(segment, { create: true });
        }
        const uniqueName = await uniquifyFilename(directoryHandle, filename);
        const fileHandle = await directoryHandle.getFileHandle(uniqueName, { create: true });
        if (typeof fileHandle.createWritable !== 'function') {
            throw new Error('This browser cannot write files to the selected folder.');
        }
        const writable = await fileHandle.createWritable();
        try {
            await writable.write(blob);
        } finally {
            if (typeof writable.close === 'function') await writable.close();
        }
        const writtenPath = [...directories, uniqueName].join('/');
        return { filename: uniqueName, relativePath: writtenPath };
    }

    function openDatabase(indexedDBImpl = globalThis.indexedDB) {
        if (!indexedDBImpl) return Promise.reject(new Error('IndexedDB is unavailable.'));
        return new Promise((resolve, reject) => {
            const request = indexedDBImpl.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Failed to open local folder storage.'));
        });
    }

    async function saveDirectoryHandle(handle, indexedDBImpl = globalThis.indexedDB) {
        const db = await openDatabase(indexedDBImpl);
        try {
            await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error || new Error('Failed to save the local folder.'));
                tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
            });
        } finally {
            db.close();
        }
    }

    async function loadDirectoryHandle(indexedDBImpl = globalThis.indexedDB) {
        const db = await openDatabase(indexedDBImpl);
        try {
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const request = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error || new Error('Failed to load the local folder.'));
            });
        } finally {
            db.close();
        }
    }

    async function clearDirectoryHandle(indexedDBImpl = globalThis.indexedDB) {
        const db = await openDatabase(indexedDBImpl);
        try {
            await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error || new Error('Failed to clear the local folder.'));
                tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
            });
        } finally {
            db.close();
        }
    }

    async function ensureWritePermission(handle) {
        if (!handle) throw new Error('No local folder selected.');
        const options = { mode: 'readwrite' };
        if (typeof handle.queryPermission === 'function') {
            const current = await handle.queryPermission(options);
            return current === 'granted';
        }
        return true;
    }

    async function writeLocalCopy({ blob, relativePath, directoryHandle, indexedDBImpl = globalThis.indexedDB } = {}) {
        const handle = directoryHandle || await loadDirectoryHandle(indexedDBImpl);
        if (!handle) throw new Error('No local folder selected.');
        const permitted = await ensureWritePermission(handle);
        if (!permitted) {
            throw new Error('Local folder permission was revoked. Choose the folder again in Save settings.');
        }
        return writeBlobToDirectory(handle, relativePath, blob);
    }

    return {
        HANDLE_KEY,
        clearDirectoryHandle,
        ensureWritePermission,
        loadDirectoryHandle,
        saveDirectoryHandle,
        splitRelativePath,
        uniquifyFilename,
        writeBlobToDirectory,
        writeLocalCopy,
        notFoundError
    };
}));
