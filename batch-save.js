(function (root, factory) {
    const batchSave = factory();
    if (typeof module === 'object' && module.exports) module.exports = batchSave;
    root.BatchSave = batchSave;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const ITEM_STATES = Object.freeze([
        'queued',
        'preparing',
        'uploading',
        'success',
        'warning',
        'failed',
        'cancelled'
    ]);
    const TERMINAL_ITEM_STATES = new Set(['success', 'warning', 'failed', 'cancelled']);

    function requiredString(value, name) {
        const result = String(value || '').trim();
        if (!result) throw new Error(`${name} is required.`);
        return result;
    }

    function createBatch(input = {}) {
        const images = Array.isArray(input.images) ? input.images : [];
        if (images.length === 0) throw new Error('A batch requires at least one image.');

        const ids = new Set();
        const items = images.map((image, index) => {
            const id = requiredString(image.id, 'Image id');
            if (ids.has(id)) throw new Error(`Duplicate image id: ${id}`);
            ids.add(id);
            return {
                id,
                index,
                url: requiredString(image.url, 'Image URL'),
                name: String(image.name || 'image'),
                width: Number(image.width) || 0,
                height: Number(image.height) || 0,
                alt: String(image.alt || ''),
                state: 'queued',
                filename: '',
                allocatedFolder: '',
                message: '',
                warningCodes: [],
                attempts: 0
            };
        });
        const now = Number.isFinite(input.now) ? input.now : Date.now();

        return {
            batchId: requiredString(input.batchId, 'Batch id'),
            tabId: input.tabId,
            pageUrl: requiredString(input.pageUrl, 'Page URL'),
            pageTitle: String(input.pageTitle || ''),
            serverId: requiredString(input.serverId, 'Server id'),
            serverName: String(input.serverName || ''),
            targetFormat: requiredString(input.targetFormat, 'Target format'),
            settings: input.settings && typeof input.settings === 'object' ? input.settings : {},
            state: 'queued',
            createdAt: now,
            updatedAt: now,
            items
        };
    }

    function transitionItem(batch, itemId, patch = {}, now = Date.now()) {
        if (Object.prototype.hasOwnProperty.call(patch, 'state') && !ITEM_STATES.includes(patch.state)) {
            throw new Error(`Unknown item state: ${patch.state}`);
        }
        let found = false;
        const items = batch.items.map(item => {
            if (item.id !== itemId) return item;
            found = true;
            return { ...item, ...patch };
        });
        if (!found) throw new Error(`Unknown batch item: ${itemId}`);
        return { ...batch, items, updatedAt: now };
    }

    function summarize(batch) {
        const summary = {
            total: batch.items.length,
            completed: 0,
            queued: 0,
            preparing: 0,
            uploading: 0,
            success: 0,
            warning: 0,
            failed: 0,
            cancelled: 0
        };
        for (const item of batch.items) {
            if (Object.prototype.hasOwnProperty.call(summary, item.state)) summary[item.state] += 1;
            if (TERMINAL_ITEM_STATES.has(item.state)) summary.completed += 1;
        }
        return summary;
    }

    function toPublicBatch(batch) {
        const { settings: _settings, ...publicBatch } = batch;
        return {
            ...publicBatch,
            items: batch.items.map(item => ({ ...item })),
            summary: summarize(batch)
        };
    }

    function utf8Bytes(value) {
        return new TextEncoder().encode(value).length;
    }

    function truncateUtf8(value, maxBytes) {
        let result = '';
        for (const character of value) {
            if (utf8Bytes(result + character) > maxBytes) break;
            result += character;
        }
        return result;
    }

    function suffixedFilename(filename, index) {
        const match = /^(.*?)(\.[a-z0-9]{1,10})?$/i.exec(String(filename || ''));
        const base = match && match[1] ? match[1] : 'image';
        const extension = match && match[2] ? match[2] : '';
        const suffix = `_${index}`;
        const allowedBaseBytes = Math.max(1, 255 - utf8Bytes(suffix + extension));
        return `${truncateUtf8(base, allowedBaseBytes)}${suffix}${extension}`;
    }

    function createFilenameAllocator(batch = {}) {
        const reserved = new Set();
        for (const item of Array.isArray(batch.items) ? batch.items : []) {
            if (item.allocatedFolder && item.filename) {
                reserved.add(`${item.allocatedFolder}\u0000${item.filename}`);
            }
        }

        function reserve(folderValue, filenameValue) {
            const folder = String(folderValue || '/');
            const filename = requiredString(filenameValue, 'Filename');
            const originalKey = `${folder}\u0000${filename}`;
            if (!reserved.has(originalKey)) {
                reserved.add(originalKey);
                return filename;
            }

            for (let index = 2; index < 10000; index += 1) {
                const candidate = suffixedFilename(filename, index);
                const key = `${folder}\u0000${candidate}`;
                if (!reserved.has(key)) {
                    reserved.add(key);
                    return candidate;
                }
            }
            throw new Error('Could not allocate a unique batch filename.');
        }

        return { reserve };
    }

    function normalizeInterruptedBatch(batch, now = Date.now()) {
        const items = batch.items.map(item => (
            item.state === 'preparing' || item.state === 'uploading'
                ? { ...item, state: 'queued', message: '' }
                : { ...item }
        ));
        const hasQueued = items.some(item => item.state === 'queued');
        return {
            ...batch,
            state: hasQueued ? 'queued' : batch.state,
            items,
            updatedAt: now
        };
    }

    function createTaskPool(limit) {
        if (!Number.isInteger(limit) || limit < 1) throw new Error('Task pool limit must be a positive integer.');
        const queue = [];
        let activeCount = 0;

        function drain() {
            while (activeCount < limit && queue.length > 0) {
                const entry = queue.shift();
                activeCount += 1;
                Promise.resolve()
                    .then(entry.task)
                    .then(entry.resolve, entry.reject)
                    .finally(() => {
                        activeCount -= 1;
                        drain();
                    });
            }
        }

        return {
            get activeCount() {
                return activeCount;
            },
            run(task) {
                if (typeof task !== 'function') return Promise.reject(new Error('Task must be a function.'));
                return new Promise((resolve, reject) => {
                    queue.push({ task, resolve, reject });
                    drain();
                });
            }
        };
    }

    return {
        ITEM_STATES,
        createBatch,
        transitionItem,
        summarize,
        toPublicBatch,
        createFilenameAllocator,
        normalizeInterruptedBatch,
        createTaskPool,
        suffixedFilename
    };
}));
