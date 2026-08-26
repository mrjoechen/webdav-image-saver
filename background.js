importScripts('image-format.js');
importScripts('filename-rule.js');
importScripts('directory-rule.js');
importScripts('local-copy.js');
importScripts('local-copy-fs.js');
importScripts('settings.js');
importScripts('batch-save.js');

// Store configurations in memory for quick access
let webdavServers = [];
let appSettings = AppSettings.createDefaultSettings();
let configReady;
let configReloadQueue = Promise.resolve();
const PENDING_UPLOAD_PREFIX = 'pendingUpload_';
const BATCH_SCAN_PREFIX = 'batchScan_';
const BATCH_PREFIX = 'batch_';
const ACTIVE_BATCH_PREFIX = 'activeBatchForTab_';
const processingUploadIds = new Set();
const contentScriptInjectionPromises = new Map();
const confirmedWebdavCollections = new Set();
const webdavDirectoryCreationPromises = new Map();
let webdavDirectoryCacheGeneration = 0;
let persistLocalCopyImpl = LocalCopyFs.writeLocalCopy;
let saveImageCoreImpl = (...args) => saveImageCore(...args);
const batchTaskPool = BatchSave.createTaskPool(3);
const batchRunPromises = new Map();
const batchUpdateQueues = new Map();
const batchAbortControllers = new Map();

// --- Initialization ---
function configureSidePanel() {
    if (!chrome.sidePanel?.setPanelBehavior) return Promise.resolve();
    return chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        .catch(error => console.error('Failed to configure Side Panel:', error));
}

configureSidePanel();

chrome.runtime.onInstalled.addListener(() => {
    console.log("WebDAV Image Saver installed/updated.");
    configureSidePanel();
});

// --- Context Menu Click Handler ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    await configReady;
    const serverConfig = webdavServers.find(s => s.id === info.menuItemId);

    if (serverConfig && info.srcUrl && tab && Number.isInteger(tab.id)) {
        console.log(`Preparing image ${info.srcUrl} for ${serverConfig.name}`);
        try {
            await beginSaveFlow({
                serverConfig,
                imageUrl: info.srcUrl,
                pageUrl: info.pageUrl || tab.url,
                pageTitle: tab.title || '',
                tabId: tab.id
            });
        } catch (error) {
            console.error(`Failed to prepare upload in tab ${tab.id}:`, error);
        }
    } else {
        console.warn("Context menu click ignored:", { hasConfig: !!serverConfig, hasSrcUrl: !!info.srcUrl, hasTabId: !!(tab && tab.id) });
    }
});

async function ensureContentScript(tabId) {
    if (contentScriptInjectionPromises.has(tabId)) {
        return contentScriptInjectionPromises.get(tabId);
    }

    const injectionPromise = (async () => {
        try {
            const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
            if (response?.pong && response?.batchDiscovery) return;
        } catch (error) {
            console.log('Content script not present, injecting for tab:', tabId);
        }

        await chrome.scripting.insertCSS({
            target: { tabId },
            files: ['assets/bubble.css']
        });
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['image-discovery.js', 'content_script.js']
        });
    })();

    contentScriptInjectionPromises.set(tabId, injectionPromise);
    try {
        await injectionPromise;
    } finally {
        contentScriptInjectionPromises.delete(tabId);
    }
}

function publicBatchSettings(settings) {
    return {
        image: { saveFormat: settings.image?.saveFormat || 'original' },
        filename: {
            rule: settings.filename?.rule || 'automatic',
            customTemplate: settings.filename?.customTemplate || ''
        },
        directory: { rule: settings.directory?.rule || 'fixed' },
        localCopy: {
            enabled: Boolean(settings.localCopy?.enabled),
            folderName: String(settings.localCopy?.folderName || ''),
            directory: { rule: settings.localCopy?.directory?.rule || 'webdav' },
            filename: {
                rule: settings.localCopy?.filename?.rule || 'webdav',
                customTemplate: settings.localCopy?.filename?.customTemplate || ''
            }
        }
    };
}

async function getBatchPanelContext(tab) {
    await configReady;
    if (!tab || !Number.isInteger(tab.id)) throw new Error('No active browser tab is available.');
    return {
        tab: {
            id: tab.id,
            url: String(tab.url || ''),
            title: String(tab.title || '')
        },
        servers: webdavServers.map(server => ({
            id: server.id,
            name: server.name,
            folder: server.folder || '/'
        })),
        settings: publicBatchSettings(appSettings),
        activeBatch: await getActiveBatchForTab(tab.id)
    };
}

function assertScannableTab(tab) {
    if (!tab || !Number.isInteger(tab.id)) throw new Error('No active browser tab is available.');
    let url;
    try {
        url = new URL(String(tab.url || ''));
    } catch (_) {
        throw new Error('This page does not allow image scanning.');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('This page does not allow image scanning.');
    }
}

async function scanBatchTab(tab) {
    assertScannableTab(tab);
    await ensureContentScript(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'batchPage:collectImages' });
    if (!response?.success || !Array.isArray(response.images)) {
        throw new Error(response?.error || 'Could not scan images on this page.');
    }
    const scan = {
        scanId: `scan_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`,
        tabId: tab.id,
        pageUrl: String(response.pageUrl || tab.url || ''),
        pageTitle: String(response.pageTitle || tab.title || ''),
        createdAt: Date.now(),
        images: response.images.map(image => ({
            id: String(image.id || ''),
            url: String(image.url || ''),
            name: String(image.name || 'image'),
            width: Number(image.width) || 0,
            height: Number(image.height) || 0,
            alt: String(image.alt || ''),
            domIndex: Number(image.domIndex) || 0
        })).filter(image => image.id && /^https?:\/\//i.test(image.url))
    };
    await chrome.storage.session.set({ [`${BATCH_SCAN_PREFIX}${tab.id}`]: scan });
    return scan;
}

async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active browser tab is available.');
    return tab;
}

function batchKey(batchId) {
    return `${BATCH_PREFIX}${batchId}`;
}

function activeBatchKey(tabId) {
    return `${ACTIVE_BATCH_PREFIX}${tabId}`;
}

function copySerializable(value) {
    return JSON.parse(JSON.stringify(value));
}

function isTerminalBatchState(state) {
    return state === 'completed' || state === 'cancelled';
}

async function getBatch(batchId) {
    const key = batchKey(batchId);
    const data = await chrome.storage.session.get(key);
    return data[key] || null;
}

async function getActiveBatchForTab(tabId) {
    const activeKey = activeBatchKey(tabId);
    const data = await chrome.storage.session.get(activeKey);
    const batchId = data[activeKey];
    if (!batchId) return null;
    const batch = await getBatch(batchId);
    return batch ? BatchSave.toPublicBatch(batch) : null;
}

async function notifyBatchState(batch) {
    const publicBatch = BatchSave.toPublicBatch(batch);
    const pageAction = isTerminalBatchState(batch.state)
        ? 'batchPage:showSummary'
        : 'batchPage:showProgress';
    await Promise.allSettled([
        chrome.runtime.sendMessage({ action: 'batchPanel:stateChanged', batch: publicBatch }),
        chrome.tabs.sendMessage(batch.tabId, { action: pageAction, batch: publicBatch })
    ]);
    return publicBatch;
}

async function persistBatch(batch, notify = true) {
    await chrome.storage.session.set({
        [batchKey(batch.batchId)]: batch,
        [activeBatchKey(batch.tabId)]: batch.batchId
    });
    return notify ? notifyBatchState(batch) : BatchSave.toPublicBatch(batch);
}

function updateBatch(batchId, updater, notify = true) {
    const previous = batchUpdateQueues.get(batchId) || Promise.resolve();
    const update = previous.then(async () => {
        const current = await getBatch(batchId);
        if (!current) throw new Error('The batch save no longer exists.');
        const next = await updater(current);
        if (!next || next.batchId !== current.batchId) throw new Error('Invalid batch state update.');
        await persistBatch(next, notify);
        return next;
    });
    batchUpdateQueues.set(batchId, update.catch(() => {}));
    return update;
}

function setSaveImageCore(saveFunction) {
    saveImageCoreImpl = typeof saveFunction === 'function'
        ? saveFunction
        : (...args) => saveImageCore(...args);
}

function validateBatchFormat(targetFormat) {
    const allowedFormats = ['original', 'png', 'jpg', 'webp'];
    if (!allowedFormats.includes(targetFormat)) throw new Error('Choose a valid image format for this batch.');
    const savedFormat = appSettings.image?.saveFormat || 'original';
    if (savedFormat !== 'ask' && targetFormat !== savedFormat) {
        throw new Error('The save format setting changed. Refresh the Side Panel and try again.');
    }
}

async function startBatch({ scanId, tabId, imageIds, serverId, targetFormat }) {
    await configReady;
    if (!Number.isInteger(tabId)) throw new Error('A valid tab is required to start a batch.');
    const scanStorageKey = `${BATCH_SCAN_PREFIX}${tabId}`;
    const scanData = await chrome.storage.session.get(scanStorageKey);
    const scan = scanData[scanStorageKey];
    if (!scan || scan.scanId !== scanId) {
        throw new Error('This image scan is no longer current. Refresh the Side Panel and try again.');
    }

    const serverConfig = webdavServers.find(server => String(server.id) === String(serverId));
    if (!serverConfig) throw new Error('Choose an available WebDAV destination.');
    validateBatchFormat(String(targetFormat || ''));

    const selectedIds = new Set((Array.isArray(imageIds) ? imageIds : []).map(String));
    if (selectedIds.size === 0) throw new Error('Select at least one image to save.');
    const selectedImages = scan.images.filter(image => selectedIds.has(String(image.id)));
    if (selectedImages.length !== selectedIds.size) {
        throw new Error('A selected image is no longer available. Refresh the Side Panel and try again.');
    }

    const active = await getActiveBatchForTab(tabId);
    if (active && !isTerminalBatchState(active.state)) {
        throw new Error('A batch save is already running for this tab.');
    }

    const batch = BatchSave.createBatch({
        batchId: `batch_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`,
        tabId,
        pageUrl: scan.pageUrl,
        pageTitle: scan.pageTitle,
        serverId: serverConfig.id,
        serverName: serverConfig.name,
        targetFormat,
        settings: copySerializable(appSettings),
        images: selectedImages
    });
    await persistBatch(batch);
    runBatch(batch.batchId).catch(error => console.error('Batch save failed to run:', error));
    return BatchSave.toPublicBatch(batch);
}

function controllerKey(batchId, itemId) {
    return `${batchId}\u0000${itemId}`;
}

function isAbortFailure(error) {
    return error?.name === 'AbortError' || /aborted/i.test(String(error?.message || ''));
}

async function processBatchItem(batchId, itemId, serverConfig, allocator) {
    const abortController = new AbortController();
    const activeControllerKey = controllerKey(batchId, itemId);
    batchAbortControllers.set(activeControllerKey, abortController);

    let preparedBatch = await updateBatch(batchId, batch => {
        const item = batch.items.find(candidate => candidate.id === itemId);
        if (!item || item.state !== 'queued' || batch.state === 'cancelling') return batch;
        return BatchSave.transitionItem(batch, itemId, {
            state: 'preparing',
            message: '',
            error: '',
            warningCodes: [],
            attempts: (item.attempts || 0) + 1
        });
    });
    let item = preparedBatch.items.find(candidate => candidate.id === itemId);
    if (!item || item.state !== 'preparing') {
        batchAbortControllers.delete(activeControllerKey);
        return;
    }

    try {
        const result = await saveImageCoreImpl({
            imageUrl: item.url,
            pageUrl: preparedBatch.pageUrl,
            pageTitle: preparedBatch.pageTitle,
            serverConfig,
            targetFormat: preparedBatch.targetFormat,
            settings: preparedBatch.settings,
            signal: abortController.signal,
            allocateFilename(folder, generatedFilename) {
                if (item.filename && item.allocatedFolder === folder) return item.filename;
                return allocator.reserve(folder, generatedFilename);
            },
            async onTargetResolved({ folder, filename }) {
                preparedBatch = await updateBatch(batchId, batch => BatchSave.transitionItem(batch, itemId, {
                    state: 'uploading',
                    filename,
                    allocatedFolder: folder
                }));
                item = preparedBatch.items.find(candidate => candidate.id === itemId);
            }
        });
        await updateBatch(batchId, batch => BatchSave.transitionItem(batch, itemId, {
            state: result.status === 'warning' ? 'warning' : 'success',
            filename: result.filename || item.filename,
            allocatedFolder: result.folder || item.allocatedFolder,
            message: result.message || '',
            error: '',
            warningCodes: Array.isArray(result.warningCodes) ? result.warningCodes : []
        }));
    } catch (error) {
        const latest = await getBatch(batchId);
        const cancelled = abortController.signal.aborted || isAbortFailure(error) || latest?.state === 'cancelling';
        await updateBatch(batchId, batch => BatchSave.transitionItem(batch, itemId, {
            state: cancelled ? 'cancelled' : 'failed',
            message: cancelled ? 'Cancelled' : '',
            error: cancelled ? '' : (error.message || String(error))
        }));
    } finally {
        batchAbortControllers.delete(activeControllerKey);
    }
}

function runBatch(batchId) {
    if (batchRunPromises.has(batchId)) return batchRunPromises.get(batchId);

    const run = (async () => {
        let batch = await getBatch(batchId);
        if (!batch) throw new Error('The batch save no longer exists.');
        if (isTerminalBatchState(batch.state) && !batch.items.some(item => item.state === 'queued')) {
            return BatchSave.toPublicBatch(batch);
        }

        const serverConfig = webdavServers.find(server => String(server.id) === String(batch.serverId));
        if (!serverConfig) {
            batch = await updateBatch(batchId, current => ({
                ...current,
                state: 'completed',
                items: current.items.map(item => item.state === 'queued'
                    ? { ...item, state: 'failed', error: 'The selected WebDAV destination is no longer available.' }
                    : item),
                updatedAt: Date.now()
            }));
            return BatchSave.toPublicBatch(batch);
        }

        batch = await updateBatch(batchId, current => ({ ...current, state: 'running', updatedAt: Date.now() }));
        const allocator = BatchSave.createFilenameAllocator(batch);
        const queuedIds = batch.items.filter(item => item.state === 'queued').map(item => item.id);
        await Promise.all(queuedIds.map(itemId => (
            batchTaskPool.run(() => processBatchItem(batchId, itemId, serverConfig, allocator))
        )));

        batch = await updateBatch(batchId, current => {
            const summary = BatchSave.summarize(current);
            const wasCancelled = current.state === 'cancelling' || summary.cancelled > 0;
            return {
                ...current,
                state: wasCancelled ? 'cancelled' : 'completed',
                updatedAt: Date.now()
            };
        });
        return BatchSave.toPublicBatch(batch);
    })();

    batchRunPromises.set(batchId, run);
    run.finally(() => batchRunPromises.delete(batchId)).catch(() => {});
    return run;
}

async function cancelBatch(batchId) {
    const batch = await updateBatch(batchId, current => {
        if (isTerminalBatchState(current.state)) return current;
        return {
            ...current,
            state: 'cancelling',
            updatedAt: Date.now(),
            items: current.items.map(item => item.state === 'queued'
                ? { ...item, state: 'cancelled', message: 'Cancelled', error: '' }
                : item)
        };
    });
    for (const [key, controller] of batchAbortControllers) {
        if (key.startsWith(`${batchId}\u0000`)) controller.abort();
    }
    if (!batchRunPromises.has(batchId)) {
        const finished = await updateBatch(batchId, current => ({ ...current, state: 'cancelled', updatedAt: Date.now() }));
        return BatchSave.toPublicBatch(finished);
    }
    return BatchSave.toPublicBatch(batch);
}

async function retryFailedBatch(batchId) {
    const batch = await updateBatch(batchId, current => {
        if (!isTerminalBatchState(current.state)) throw new Error('Wait for the current batch to finish before retrying.');
        if (!current.items.some(item => item.state === 'failed')) throw new Error('This batch has no failed images to retry.');
        return {
            ...current,
            state: 'queued',
            updatedAt: Date.now(),
            items: current.items.map(item => item.state === 'failed'
                ? { ...item, state: 'queued', message: '', error: '', warningCodes: [] }
                : item)
        };
    });
    runBatch(batchId).catch(error => console.error('Failed to retry batch:', error));
    return BatchSave.toPublicBatch(batch);
}

async function resumePersistedBatches() {
    const sessionData = await chrome.storage.session.get(null);
    for (const [key, storedBatch] of Object.entries(sessionData)) {
        if (!key.startsWith(BATCH_PREFIX) || !storedBatch?.batchId) continue;
        if (storedBatch.state === 'cancelling') {
            const cancelled = {
                ...storedBatch,
                state: 'cancelled',
                updatedAt: Date.now(),
                items: storedBatch.items.map(item => ['queued', 'preparing', 'uploading'].includes(item.state)
                    ? { ...item, state: 'cancelled', message: 'Cancelled', error: '' }
                    : item)
            };
            await persistBatch(cancelled, false);
        } else if (!isTerminalBatchState(storedBatch.state)) {
            const normalized = BatchSave.normalizeInterruptedBatch(storedBatch);
            await persistBatch(normalized, false);
            runBatch(normalized.batchId).catch(error => console.error('Failed to resume batch:', error));
        }
    }
}

async function beginSaveFlow({ serverConfig, imageUrl, pageUrl, pageTitle, tabId }) {
    const uploadId = `upload_${Date.now()}_${Math.random().toString(16).substring(2, 8)}`;
    const operation = {
        uploadId,
        serverId: serverConfig.id,
        serverName: serverConfig.name,
        imageUrl,
        pageUrl,
        pageTitle,
        tabId
    };

    await ensureContentScript(tabId);

    if (appSettings.image.saveFormat === 'ask') {
        await savePendingUpload(operation);
        try {
            await chrome.tabs.sendMessage(tabId, {
                action: 'showFormatChooser',
                uploadId,
                serverName: operation.serverName
            });
        } catch (error) {
            await removePendingUpload(uploadId);
            throw error;
        }
        return;
    }

    await startUploadCountdown(operation, appSettings.image.saveFormat);
}

async function startUploadCountdown(operation, targetFormat) {
    const countdownSeconds = 3;
    const pendingUpload = { ...operation, targetFormat };

    await savePendingUpload(pendingUpload);

    try {
        await chrome.tabs.sendMessage(operation.tabId, {
            action: 'showCountdownBubble',
            uploadId: operation.uploadId,
            serverName: operation.serverName,
            countdownSeconds
        });
    } catch (error) {
        await removePendingUpload(operation.uploadId);
        throw error;
    }
}

function pendingUploadKey(uploadId) {
    return `${PENDING_UPLOAD_PREFIX}${uploadId}`;
}

async function savePendingUpload(operation) {
    await chrome.storage.session.set({ [pendingUploadKey(operation.uploadId)]: operation });
}

async function getPendingUpload(uploadId) {
    const key = pendingUploadKey(uploadId);
    const data = await chrome.storage.session.get(key);
    return data[key] || null;
}

async function removePendingUpload(uploadId) {
    await chrome.storage.session.remove(pendingUploadKey(uploadId));
}

async function removePendingUploadsForTab(tabId) {
    const sessionData = await chrome.storage.session.get(null);
    const keys = Object.entries(sessionData)
        .filter(([key, operation]) => key.startsWith(PENDING_UPLOAD_PREFIX) && operation?.tabId === tabId)
        .map(([key]) => key);

    if (keys.length > 0) await chrome.storage.session.remove(keys);
}

async function cancelPendingUpload(uploadId, tabId) {
    if (processingUploadIds.has(uploadId)) return;
    processingUploadIds.add(uploadId);

    try {
        const operation = await getPendingUpload(uploadId);
        if (!operation || operation.tabId !== tabId) return;
        await removePendingUpload(uploadId);
    } finally {
        processingUploadIds.delete(uploadId);
    }
}

async function handleFormatSelected(message, tabId) {
    if (processingUploadIds.has(message.uploadId)) return;
    processingUploadIds.add(message.uploadId);

    try {
        const operation = await getPendingUpload(message.uploadId);
        const allowedFormats = ['original', 'png', 'jpg', 'webp'];

        if (!operation || operation.tabId !== tabId || operation.targetFormat || !allowedFormats.includes(message.format)) {
            console.warn('Ignored invalid image format selection:', message.format);
            return;
        }

        await startUploadCountdown(operation, message.format);
    } finally {
        processingUploadIds.delete(message.uploadId);
    }
}

async function handleUploadCountdownComplete(uploadId, tabId) {
    if (processingUploadIds.has(uploadId)) return;
    processingUploadIds.add(uploadId);

    try {
        const operation = await getPendingUpload(uploadId);
        const allowedFormats = ['original', 'png', 'jpg', 'webp'];
        if (!operation || operation.tabId !== tabId || !allowedFormats.includes(operation.targetFormat)) return;

        await removePendingUpload(uploadId);
        await configReady;

        const serverConfig = webdavServers.find(server => server.id === operation.serverId);
        if (!serverConfig) {
            throw new Error('The selected WebDAV server is no longer available.');
        }

        await chrome.tabs.sendMessage(tabId, { action: 'removeCountdownBubble', uploadId })
            .catch(error => console.warn('Failed to remove countdown bubble:', error));
        await uploadImage(
            operation.imageUrl,
            operation.pageUrl,
            operation.pageTitle,
            serverConfig,
            uploadId,
            tabId,
            operation.targetFormat
        );
    } finally {
        processingUploadIds.delete(uploadId);
    }
}

chrome.tabs.onRemoved.addListener(tabId => {
    removePendingUploadsForTab(tabId)
        .catch(error => console.warn('Failed to clean up pending uploads for closed tab:', error));
});

function keepMessageChannelOpen(task, sendResponse, formatResponse = () => ({ success: true })) {
    Promise.resolve(task)
        .then(result => sendResponse(formatResponse(result)))
        .catch(error => {
            console.error('Background message task failed:', error);
            sendResponse({ success: false, error: error.message || String(error) });
        });
    return true;
}

function assertSidePanelSender(sender) {
    const sidePanelUrl = chrome.runtime.getURL('sidepanel/sidepanel.html');
    if (String(sender?.url || '').split(/[?#]/)[0] !== sidePanelUrl) {
        throw new Error('This batch command is only available from the Side Panel.');
    }
}

// --- Listen for Cancellation from Content Script ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'batchPanel:getContext') {
        return keepMessageChannelOpen(
            Promise.resolve().then(() => {
                assertSidePanelSender(sender);
                return getActiveTab().then(getBatchPanelContext);
            }),
            sendResponse,
            context => ({ success: true, context })
        );
    }
    else if (message.action === 'batchPanel:scan') {
        return keepMessageChannelOpen(
            Promise.resolve().then(() => {
                assertSidePanelSender(sender);
                return getActiveTab().then(scanBatchTab);
            }),
            sendResponse,
            scan => ({ success: true, scan })
        );
    }
    else if (message.action === 'batchPanel:start') {
        return keepMessageChannelOpen(
            Promise.resolve().then(() => {
                assertSidePanelSender(sender);
                return startBatch(message);
            }),
            sendResponse,
            batch => ({ success: true, batch })
        );
    }
    else if (message.action === 'batchPanel:cancel') {
        return keepMessageChannelOpen(
            Promise.resolve().then(() => {
                assertSidePanelSender(sender);
                return cancelBatch(String(message.batchId || ''));
            }),
            sendResponse,
            batch => ({ success: true, batch })
        );
    }
    else if (message.action === 'batchPanel:retryFailed') {
        return keepMessageChannelOpen(
            Promise.resolve().then(() => {
                assertSidePanelSender(sender);
                return retryFailedBatch(String(message.batchId || ''));
            }),
            sendResponse,
            batch => ({ success: true, batch })
        );
    }
    // Make sure to handle other messages too (like testWebdav, configUpdated)
    else if (message.action === 'cancelUpload') {
        return keepMessageChannelOpen(
            cancelPendingUpload(message.uploadId, sender.tab?.id),
            sendResponse
        );
    }
    else if (message.action === 'formatSelected') {
        const selectionTask = handleFormatSelected(message, sender.tab?.id).catch(async error => {
            if (!sender.tab?.id) return;
            await chrome.tabs.sendMessage(sender.tab.id, {
                action: 'showStatusBubble',
                uploadId: message.uploadId,
                status: 'error',
                message: `Error preparing upload: ${error.message}`
            }).catch(sendError => console.error('Failed to show format selection error:', sendError));
            throw error;
        });
        return keepMessageChannelOpen(selectionTask, sendResponse);
    }
    else if (message.action === 'cancelFormatSelection') {
        return keepMessageChannelOpen(
            cancelPendingUpload(message.uploadId, sender.tab?.id),
            sendResponse
        );
    }
    else if (message.action === 'uploadCountdownComplete') {
        const uploadTask = handleUploadCountdownComplete(message.uploadId, sender.tab?.id).catch(async error => {
            if (!sender.tab?.id) return;
            await chrome.tabs.sendMessage(sender.tab.id, {
                action: 'showStatusBubble',
                uploadId: message.uploadId,
                status: 'error',
                message: `Failed: ${error.message}`
            }).catch(sendError => console.error('Failed to show upload error:', sendError));
            throw error;
        });
        return keepMessageChannelOpen(uploadTask, sendResponse);
    }
    // --- Keep other message handlers ---
    else if (message.action === 'testWebdav') {
         testWebdavConnection(message.config)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Async response
    } else if (message.action === 'listWebdavFolders') {
         listWebdavFolders(message.config, message.folder || '/')
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Async response
    } else if (message.action === 'configUpdated') {
        console.log('Configuration updated, reloading...');
        const reloadTask = configReloadQueue.then(loadConfig);
        configReloadQueue = reloadTask.catch(error => {
            console.error('Configuration reload failed:', error);
        });
        configReady = configReloadQueue;
        const menuUpdateTask = reloadTask.then(() => {
            createContextMenus();
            console.log("Menus updated after config change.");
        });
        return keepMessageChannelOpen(menuUpdateTask, sendResponse);
    }
     return false; // Default for unhandled messages
});


// --- Configuration Loading ---
async function loadConfig() {
    try {
        // Check local storage first, fallback to sync only for legacy migration.
        const [localData, syncData, loadedSettings] = await Promise.all([
            chrome.storage.local.get('webdavServers'),
            chrome.storage.sync.get('webdavServers'),
            AppSettings.loadSettings(chrome.storage.local)
        ]);
        
        webdavServers = localData.webdavServers || syncData.webdavServers || [];
        appSettings = loadedSettings;
        resetWebdavDirectoryCache();
        console.log("Configuration loaded:", webdavServers.length, "servers");
        
        // Migrate from sync to local if needed
        if (syncData.webdavServers && !localData.webdavServers) {
            console.log('Migrating server data to local storage for better security');
            await chrome.storage.local.set({ webdavServers: webdavServers });
        }

        await clearLegacySyncServerData();
    } catch (error) {
        console.error("Error loading configuration:", error);
        webdavServers = [];
        appSettings = AppSettings.createDefaultSettings();
        throw error;
    }
}

async function clearLegacySyncServerData() {
    try {
        await chrome.storage.sync.remove(['webdavServers', 'webdavServersMetadata']);
    } catch (error) {
        console.warn('Could not clear legacy sync storage:', error);
    }
}

// --- Context Menu Setup ---
function createContextMenus() {
    // Remove existing menus first to avoid duplicates on update
    chrome.contextMenus.removeAll(() => {
        if (chrome.runtime.lastError) {
            console.warn("Error removing context menus:", chrome.runtime.lastError.message);
        }

        // Create a parent menu item
        chrome.contextMenus.create({
            id: "webdavSaverParent",
            title: "Save Image to WebDAV",
            contexts: ["image"] // Show only when right-clicking an image
        }, () => {
            if (chrome.runtime.lastError) console.error("Error creating parent menu:", chrome.runtime.lastError.message);
        });

        // Create sub-menu items for each configured server
        if (webdavServers && webdavServers.length > 0) {
            webdavServers.forEach(server => {
                chrome.contextMenus.create({
                    id: server.id, // Use unique server ID for the menu item ID
                    parentId: "webdavSaverParent",
                    title: `Send to: ${server.name} (${server.folder})`,
                    contexts: ["image"]
                }, () => {
                     if (chrome.runtime.lastError) console.error(`Error creating menu for ${server.name}:`, chrome.runtime.lastError.message);
                });
            });
        } else {
            // Add a placeholder if no servers are configured
             chrome.contextMenus.create({
                id: "noConfig",
                parentId: "webdavSaverParent",
                title: "No servers configured...",
                contexts: ["image"],
                enabled: false // Disable it
            });
        }
    });

}


// --- Image Upload Logic ---
async function saveImageCore({
    imageUrl,
    pageUrl,
    pageTitle,
    serverConfig,
    targetFormat = 'original',
    settings = appSettings,
    now = new Date(),
    signal,
    allocateFilename = (_folder, filename) => filename,
    onTargetResolved = async () => {}
}) {
    const response = await fetch(imageUrl, { signal });
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    const imageBlob = await response.blob();

    const dimensions = await FilenameRule.readImageDimensions(imageBlob);
    const sourceExtension = FilenameRule.extractSourceExtension(imageUrl);
    const provisionalExtension = ImageFormat.extensionForMimeType(imageBlob.type, sourceExtension);
    const provisionalFilename = FilenameRule.generateFilename({
        rule: 'automatic',
        imageUrl,
        pageUrl,
        extension: provisionalExtension,
        now
    });
    const preparedImage = await ImageFormat.prepareImageForUpload({
        blob: imageBlob,
        filename: provisionalFilename,
        targetFormat
    });
    const finalExtension = ImageFormat.extensionForMimeType(
        preparedImage.mimeType,
        extractFilenameExtension(preparedImage.filename)
    );
    const generatedFilename = FilenameRule.generateFilename({
        rule: settings.filename?.rule,
        template: settings.filename?.customTemplate,
        imageUrl,
        pageUrl,
        pageTitle,
        width: dimensions.width,
        height: dimensions.height,
        extension: finalExtension,
        now
    });
    if (preparedImage.warningDetail) console.warn('Image conversion fallback:', preparedImage.warningDetail);

    const targetDirectory = DirectoryRule.resolveDirectory({
        rule: settings.directory?.rule,
        rootFolder: serverConfig.folder || '/',
        pageUrl,
        now
    });
    await ensureWebdavDirectories(serverConfig, targetDirectory.foldersToCreate);

    const filename = allocateFilename(targetDirectory.folder, generatedFilename);
    await onTargetResolved({ folder: targetDirectory.folder, filename });
    const targetUrl = buildWebdavResourceUrl(serverConfig.url, targetDirectory.folder, filename);
    const headers = new Headers();
    headers.append('Authorization', basicAuthHeader(serverConfig.username, serverConfig.password));
    headers.append('Content-Type', preparedImage.mimeType);

    const putResponse = await fetch(targetUrl, {
        method: 'PUT',
        headers,
        body: preparedImage.blob,
        signal
    });
    if (!putResponse.ok && putResponse.status !== 201 && putResponse.status !== 204) {
        let errorDetails = `${putResponse.status} ${putResponse.statusText}`;
        try {
            const errorText = await putResponse.text();
            const match = errorText.match(/<[ds]:message[^>]*>([^<]+)<\/[ds]:message>/i);
            if (match && match[1]) errorDetails += ` - ${match[1].trim()}`;
            else if (errorText.length < 100 && errorText.length > 0) errorDetails += ` - ${errorText}`;
        } catch (_) { /* Ignore body read errors. */ }
        throw new Error(`Upload failed: ${errorDetails}`);
    }

    let status = preparedImage.warningCode ? 'warning' : 'success';
    let message = preparedImage.warningCode
        ? getConversionWarningMessage(preparedImage, filename)
        : `Saved as "${filename}"`;
    const warningCodes = preparedImage.warningCode ? [preparedImage.warningCode] : [];
    const localCopyResult = await saveLocalCopyOfUpload({
        blob: preparedImage.blob,
        webdavFilename: filename,
        imageUrl,
        pageUrl,
        pageTitle,
        width: dimensions.width,
        height: dimensions.height,
        extension: finalExtension,
        now,
        settings
    });
    if (localCopyResult.warning) {
        status = 'warning';
        warningCodes.push('local-copy');
        message = `${message} ${localCopyResult.warning}`;
    }

    return {
        status,
        message,
        filename,
        folder: targetDirectory.folder,
        warningCodes
    };
}

async function uploadImage(imageUrl, pageUrl, pageTitle, serverConfig, uploadId, tabId, targetFormat = 'original') {
    let status = 'error';
    let message = '';
    try {
        const result = await saveImageCore({
            imageUrl,
            pageUrl,
            pageTitle,
            serverConfig,
            targetFormat,
            settings: appSettings
        });
        status = result.status;
        message = result.message;
    } catch (error) {
        console.error(`[${uploadId}] Upload process failed:`, error);
        message = `Failed: ${error.message}`;
    }

    await chrome.tabs.sendMessage(tabId, {
        action: 'showStatusBubble',
        uploadId,
        status,
        message
    }).catch(error => console.error(`[${uploadId}] Failed to send final status to tab ${tabId}:`, error));
}

async function saveLocalCopyOfUpload({
    blob,
    webdavFilename,
    imageUrl,
    pageUrl,
    pageTitle,
    width,
    height,
    extension,
    now,
    settings = appSettings
}) {
    const plan = LocalCopy.resolveLocalSave({
        localCopy: settings.localCopy,
        webdavDirectoryRule: settings.directory?.rule,
        webdavFilename,
        webdavFilenameRule: settings.filename,
        imageUrl,
        pageUrl,
        pageTitle,
        width,
        height,
        extension,
        now
    });
    if (plan.skip) {
        return plan.reason === 'folder-not-selected'
            ? { warning: 'Local copy skipped: choose a folder in Save settings.' }
            : {};
    }

    try {
        await persistLocalCopyImpl({ blob, relativePath: plan.relativePath });
        return {};
    } catch (error) {
        console.warn('Local copy failed:', error);
        return { warning: 'Local copy failed.' };
    }
}

function setPersistLocalCopy(writer) {
    persistLocalCopyImpl = typeof writer === 'function' ? writer : LocalCopyFs.writeLocalCopy;
}

function getConversionWarningMessage(preparedImage, finalFilename) {
    const filenameExtension = finalFilename.includes('.')
        ? finalFilename.split('.').pop()
        : '';
    const mimeSubtype = preparedImage.mimeType.includes('/')
        ? preparedImage.mimeType.split('/').pop().split('+')[0]
        : '';
    const originalFormat = (filenameExtension || mimeSubtype || 'image').toUpperCase();
    if (preparedImage.warningCode === 'animated-image') {
        return `Saved original ${originalFormat}; animated images cannot be converted.`;
    }
    return `Saved original ${originalFormat}; this image could not be converted.`;
}

function extractFilenameExtension(filename) {
    const match = /\.([a-z0-9]{1,10})$/i.exec(String(filename || ''));
    return match ? match[1].toLowerCase() : 'bin';
}

// --- WebDAV Folder Browsing ---
async function testWebdavConnection(config) {
    console.log("Testing connection to:", config.url);

    try {
        return await listWebdavFolders(config, '/');
    } catch (error) {
        console.error("WebDAV PROPFIND test failed:", error);
        return await fallbackHeadConnectionTest(config, error);
    }
}

async function listWebdavFolders(config, folder = '/') {
    const normalizedFolder = normalizeWebdavFolder(folder);
    const targetUrl = buildWebdavCollectionUrl(config.url, normalizedFolder);
    const headers = new Headers();
    headers.append('Authorization', basicAuthHeader(config.username, config.password));
    headers.append('Depth', '1');
    headers.append('Content-Type', 'application/xml; charset=utf-8');

    console.log(`Listing WebDAV folder: ${targetUrl}`);

    const response = await fetch(targetUrl, {
        method: 'PROPFIND',
        headers,
        mode: 'cors',
        credentials: 'omit',
        body: '<?xml version="1.0" encoding="utf-8"?>\n<D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/><D:displayname/></D:prop></D:propfind>'
    });

    console.log(`PROPFIND response status: ${response.status}`);

    if (response.status === 207) {
        const responseText = await response.text();
        return {
            success: true,
            folder: normalizedFolder,
            folders: parseWebdavChildFolders(responseText, config.url, normalizedFolder)
        };
    }

    if (response.status === 401) {
        throw new Error('Authentication failed. Check username and password.');
    }

    if (response.status === 404) {
        throw new Error('Folder not found. Check the WebDAV URL or folder path.');
    }

    let errorDetails = `Server error: ${response.status} ${response.statusText}`;
    try {
        const errorText = await response.text();
        if (errorText) errorDetails += ` - ${errorText.substring(0, 200)}`;
    } catch (e) {
        // Ignore body read errors.
    }
    throw new Error(errorDetails);
}

async function fallbackHeadConnectionTest(config, originalError) {
    try {
        console.log("Attempting fallback HEAD request...");
        const fallbackHeaders = new Headers();
        fallbackHeaders.append('Authorization', basicAuthHeader(config.username, config.password));

        const headResponse = await fetch(buildWebdavCollectionUrl(config.url, '/'), {
            method: 'HEAD',
            headers: fallbackHeaders,
            mode: 'cors',
            credentials: 'omit'
        });

        if (headResponse.ok || headResponse.status === 404) {
            console.log("Fallback HEAD request successful");
            return {
                success: true,
                folders: ['/'],
                message: 'Connection test passed with limited folder browsing.'
            };
        }

        if (headResponse.status === 401) {
            return { success: false, error: 'Authentication failed. Check username and password.' };
        }

        return { success: false, error: `Server error: ${headResponse.status} ${headResponse.statusText}` };
    } catch (fallbackError) {
        console.error("Fallback HEAD request also failed:", fallbackError);
        return { success: false, error: fallbackError.message || originalError.message || 'Unknown connection error' };
    }
}

function parseWebdavChildFolders(responseText, baseUrl, parentFolder) {
    const basePath = getWebdavBasePath(baseUrl);
    const normalizedParent = normalizeWebdavFolder(parentFolder);
    const folders = new Set();
    const hrefRegex = /<(?:\w+:)?href[^>]*>([^<]+)<\/(?:\w+:)?href>/gi;
    let match;

    while ((match = hrefRegex.exec(responseText)) !== null) {
        try {
            const rawHref = match[1].trim();
            if (!rawHref || !rawHref.endsWith('/')) continue;

            const hrefPath = getHrefPath(rawHref);
            let relativePath = hrefPath.startsWith(basePath)
                ? hrefPath.substring(basePath.length)
                : hrefPath.replace(/^\/+/, '');

            relativePath = relativePath.replace(/\/+$/, '');
            const folderPath = normalizeWebdavFolder(relativePath ? `/${relativePath}` : '/');

            if (folderPath !== normalizedParent && getWebdavParentFolder(folderPath) === normalizedParent) {
                folders.add(folderPath);
            }
        } catch (error) {
            console.warn(`Skipping href due to processing error: ${match ? match[1] : 'N/A'}`, error);
        }
    }

    return [...folders].sort((a, b) => a.localeCompare(b));
}

function buildWebdavCollectionUrl(baseUrl, folder) {
    const trimmedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const normalizedFolder = normalizeWebdavFolder(folder);

    if (normalizedFolder === '/') {
        return `${trimmedBaseUrl}/`;
    }

    const encodedFolder = normalizedFolder
        .split('/')
        .filter(Boolean)
        .map(segment => encodeURIComponent(segment))
        .join('/');

    return `${trimmedBaseUrl}/${encodedFolder}/`;
}

function buildWebdavResourceUrl(baseUrl, folder, filename) {
    return `${buildWebdavCollectionUrl(baseUrl, folder)}${encodeURIComponent(filename)}`;
}

async function ensureWebdavDirectories(serverConfig, folders) {
    for (const folder of folders || []) {
        await ensureWebdavDirectory(serverConfig, folder);
    }
}

async function ensureWebdavDirectory(serverConfig, folder) {
    const targetUrl = buildWebdavCollectionUrl(serverConfig.url, folder);
    const cacheGeneration = webdavDirectoryCacheGeneration;
    const cacheKey = await webdavDirectoryCacheKey(serverConfig, targetUrl);
    if (cacheGeneration !== webdavDirectoryCacheGeneration) {
        return createWebdavDirectory(serverConfig, targetUrl, null, cacheGeneration);
    }
    if (confirmedWebdavCollections.has(cacheKey)) return;

    const existingCreation = webdavDirectoryCreationPromises.get(cacheKey);
    if (existingCreation) return existingCreation;

    const creation = createWebdavDirectory(serverConfig, targetUrl, cacheKey, cacheGeneration);

    webdavDirectoryCreationPromises.set(cacheKey, creation);
    try {
        await creation;
    } finally {
        if (webdavDirectoryCreationPromises.get(cacheKey) === creation) {
            webdavDirectoryCreationPromises.delete(cacheKey);
        }
    }
}

async function createWebdavDirectory(serverConfig, targetUrl, cacheKey, cacheGeneration) {
    const headers = new Headers();
    headers.append('Authorization', basicAuthHeader(serverConfig.username, serverConfig.password));

    const response = await fetch(targetUrl, {
        method: 'MKCOL',
        headers,
        mode: 'cors',
        credentials: 'omit'
    });

    if (response.ok) {
        confirmWebdavDirectory(cacheKey, cacheGeneration);
        return;
    }

    if (response.status !== 405) {
        throw webdavDirectoryError(response.status, response.statusText);
    }

    const verificationHeaders = new Headers();
    verificationHeaders.append('Authorization', basicAuthHeader(serverConfig.username, serverConfig.password));
    verificationHeaders.append('Depth', '0');
    verificationHeaders.append('Content-Type', 'application/xml; charset=utf-8');
    const verification = await fetch(targetUrl, {
        method: 'PROPFIND',
        headers: verificationHeaders,
        mode: 'cors',
        credentials: 'omit',
        body: '<?xml version="1.0" encoding="utf-8"?><D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/></D:prop></D:propfind>'
    });

    if (verification.ok || verification.status === 207) {
        let verificationBody;
        try {
            verificationBody = await verification.text();
        } catch (error) {
            throw new Error(`Could not read WebDAV directory verification response: ${error.message || String(error)}`);
        }
        if (!isWebdavCollectionResponse(verificationBody)) {
            throw new Error('WebDAV target exists but is not a collection/directory.');
        }
        confirmWebdavDirectory(cacheKey, cacheGeneration);
        return;
    }
    if (verification.status === 404) {
        throw new Error('Cannot create directory: server does not support MKCOL and the directory does not exist.');
    }
    throw webdavDirectoryError(verification.status, verification.statusText, true);
}

function isWebdavCollectionResponse(responseText) {
    const xml = String(responseText || '');
    if (!hasOnlyValidXmlCharacters(xml)) return false;
    const namespaceStack = [];
    let foundCollection = false;
    let rootElementSeen = false;
    let rootElementClosed = false;
    let xmlDeclarationSeen = false;
    let preRootConstructSeen = false;
    let position = xml.startsWith('\uFEFF') ? 1 : 0;

    while (position < xml.length) {
        const tagStart = xml.indexOf('<', position);
        if (tagStart < 0) break;
        if (namespaceStack.length === 0) {
            const outsideRootText = xml.slice(position, tagStart);
            if (!isXmlWhitespace(outsideRootText)) return false;
            if (!rootElementSeen && outsideRootText) preRootConstructSeen = true;
        } else if (!hasValidXmlCharacterData(xml.slice(position, tagStart))) {
            return false;
        }

        if (xml.startsWith('<!--', tagStart)) {
            const commentEnd = xml.indexOf('-->', tagStart + 4);
            if (commentEnd < 0) return false;
            const commentBody = xml.slice(tagStart + 4, commentEnd);
            if (commentBody.includes('--') || commentBody.endsWith('-')) return false;
            if (!rootElementSeen) preRootConstructSeen = true;
            position = commentEnd + 3;
            continue;
        }
        if (xml.startsWith('<![CDATA[', tagStart)) {
            if (namespaceStack.length === 0) return false;
            const cdataEnd = xml.indexOf(']]>', tagStart + 9);
            if (cdataEnd < 0) return false;
            position = cdataEnd + 3;
            continue;
        }
        if (xml.startsWith('<?', tagStart)) {
            const declarationEnd = xml.indexOf('?>', tagStart + 2);
            if (declarationEnd < 0) return false;
            const instructionSource = xml.slice(tagStart + 2, declarationEnd);
            const instructionMatch = /^([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)(?=[\x20\x09\x0D\x0A]|$)/.exec(instructionSource);
            if (!instructionMatch) return false;
            const instructionTarget = instructionMatch[1];
            if (instructionTarget === 'xml') {
                if (xmlDeclarationSeen || rootElementSeen || preRootConstructSeen || !isValidXmlDeclaration(instructionSource)) return false;
                xmlDeclarationSeen = true;
            } else if (instructionTarget.toLowerCase().startsWith('xml')) {
                return false;
            } else if (!rootElementSeen) {
                preRootConstructSeen = true;
            }
            position = declarationEnd + 2;
            continue;
        }

        const tagEnd = findXmlTagEnd(xml, tagStart + 1);
        if (tagEnd < 0) return false;
        const rawTagSource = xml.slice(tagStart + 1, tagEnd);
        const tagSource = trimTrailingXmlWhitespace(rawTagSource);
        position = tagEnd + 1;
        if (!tagSource || isXmlWhitespaceCharacter(tagSource[0])) return false;

        if (tagSource.startsWith('!')) return false;
        if (tagSource.startsWith('/')) {
            const closingName = trimTrailingXmlWhitespace(tagSource.slice(1));
            if (!isXmlQualifiedName(closingName)) return false;
            const frame = namespaceStack.pop();
            if (!frame || frame.qualifiedName !== closingName) return false;
            if (namespaceStack.length === 0) rootElementClosed = true;
            continue;
        }

        const selfClosing = /\/$/.test(tagSource);
        if (selfClosing && rawTagSource.length !== tagSource.length) return false;
        const startTagSource = selfClosing ? trimTrailingXmlWhitespace(tagSource.slice(0, -1)) : tagSource;
        const nameMatch = /^([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)(?=[\x20\x09\x0D\x0A]|$)/.exec(startTagSource);
        if (!nameMatch) return false;

        const qualifiedName = nameMatch[1];
        const declarations = parseXmlNamespaceDeclarations(startTagSource.slice(qualifiedName.length));
        if (!declarations) return false;
        const parentFrame = namespaceStack[namespaceStack.length - 1];
        if (!parentFrame) {
            if (rootElementSeen) return false;
            rootElementSeen = true;
            if (selfClosing) rootElementClosed = true;
        }
        const namespaces = Object.assign(
            Object.create(null),
            parentFrame?.namespaces || { xml: 'http://www.w3.org/XML/1998/namespace' },
            declarations
        );
        const resolvedName = resolveXmlQualifiedName(qualifiedName, namespaces);
        if (!resolvedName) return false;

        const parentIsDavResourceType = parentFrame?.localName === 'resourcetype' && parentFrame.namespaceUri === 'DAV:';
        if (parentIsDavResourceType && resolvedName.localName === 'collection' && resolvedName.namespaceUri === 'DAV:') {
            foundCollection = true;
        }

        if (!selfClosing) {
            namespaceStack.push({
                qualifiedName,
                namespaces,
                localName: resolvedName.localName,
                namespaceUri: resolvedName.namespaceUri
            });
        }
    }

    const trailingText = xml.slice(position);
    if (namespaceStack.length > 0 && !hasValidXmlCharacterData(trailingText)) return false;
    return foundCollection && rootElementSeen && rootElementClosed && namespaceStack.length === 0 && isXmlWhitespace(trailingText);
}

function isXmlWhitespace(value) {
    return /^[\x20\x09\x0D\x0A]*$/.test(value);
}

function isXmlWhitespaceCharacter(value) {
    return value === ' ' || value === '\t' || value === '\r' || value === '\n';
}

function trimTrailingXmlWhitespace(value) {
    return String(value).replace(/[\x20\x09\x0D\x0A]+$/g, '');
}

function isValidXmlDeclaration(instructionSource) {
    return /^xml[\x20\x09\x0D\x0A]+version[\x20\x09\x0D\x0A]*=[\x20\x09\x0D\x0A]*(['"])(?:1\.0|1\.1)\1(?:[\x20\x09\x0D\x0A]+encoding[\x20\x09\x0D\x0A]*=[\x20\x09\x0D\x0A]*(['"])[A-Za-z][A-Za-z0-9._-]*\2)?(?:[\x20\x09\x0D\x0A]+standalone[\x20\x09\x0D\x0A]*=[\x20\x09\x0D\x0A]*(['"])(?:yes|no)\3)?[\x20\x09\x0D\x0A]*$/.test(instructionSource);
}

function hasValidXmlEntityReferences(value) {
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
        if (text[index] !== '&') continue;
        const semicolon = text.indexOf(';', index + 1);
        if (semicolon < 0 || !isValidXmlEntityReference(text.slice(index + 1, semicolon))) return false;
        index = semicolon;
    }
    return true;
}

function hasValidXmlCharacterData(value) {
    const text = String(value);
    return !text.includes(']]>') && hasValidXmlEntityReferences(text);
}

function isValidXmlEntityReference(reference) {
    if (['amp', 'lt', 'gt', 'apos', 'quot'].includes(reference)) return true;

    let codePoint;
    if (/^#[0-9]+$/.test(reference)) {
        codePoint = Number.parseInt(reference.slice(1), 10);
    } else if (/^#x[0-9A-Fa-f]+$/.test(reference)) {
        codePoint = Number.parseInt(reference.slice(2), 16);
    } else {
        return false;
    }

    return Number.isSafeInteger(codePoint) && isValidXmlCharacter(codePoint);
}

function isValidXmlCharacter(codePoint) {
    return codePoint === 0x09 || codePoint === 0x0A || codePoint === 0x0D ||
        (codePoint >= 0x20 && codePoint <= 0xD7FF) ||
        (codePoint >= 0xE000 && codePoint <= 0xFFFD) ||
        (codePoint >= 0x10000 && codePoint <= 0x10FFFF);
}

function hasOnlyValidXmlCharacters(value) {
    for (const character of String(value)) {
        if (!isValidXmlCharacter(character.codePointAt(0))) return false;
    }
    return true;
}

function findXmlTagEnd(xml, start) {
    let quote = '';
    for (let index = start; index < xml.length; index += 1) {
        const character = xml[index];
        if (quote) {
            if (character === quote) quote = '';
        } else if (character === '"' || character === "'") {
            quote = character;
        } else if (character === '>') {
            return index;
        }
    }
    return -1;
}

function isXmlQualifiedName(value) {
    return /^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?$/.test(value);
}

function parseXmlNamespaceDeclarations(attributeSource) {
    const declarations = Object.create(null);
    const seenAttributes = new Set();
    let position = 0;

    while (position < attributeSource.length) {
        const whitespaceStart = position;
        while (position < attributeSource.length && isXmlWhitespaceCharacter(attributeSource[position])) position += 1;
        if (position >= attributeSource.length) break;
        if (position === whitespaceStart) return null;

        const attributeMatch = /^([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)/.exec(attributeSource.slice(position));
        if (!attributeMatch) return null;
        const attributeName = attributeMatch[1];
        if (seenAttributes.has(attributeName)) return null;
        seenAttributes.add(attributeName);
        position += attributeName.length;

        while (position < attributeSource.length && isXmlWhitespaceCharacter(attributeSource[position])) position += 1;
        if (attributeSource[position] !== '=') return null;
        position += 1;
        while (position < attributeSource.length && isXmlWhitespaceCharacter(attributeSource[position])) position += 1;
        const quote = attributeSource[position];
        if (quote !== '"' && quote !== "'") return null;
        position += 1;
        const valueEnd = attributeSource.indexOf(quote, position);
        if (valueEnd < 0) return null;
        const value = attributeSource.slice(position, valueEnd);
        position = valueEnd + 1;
        if (value.includes('<') || !hasValidXmlEntityReferences(value)) return null;

        if (attributeName === 'xmlns') declarations[''] = value;
        else if (attributeName.startsWith('xmlns:')) declarations[attributeName.slice('xmlns:'.length)] = value;
    }

    return declarations;
}

function resolveXmlQualifiedName(qualifiedName, namespaces) {
    const colonIndex = qualifiedName.indexOf(':');
    const prefix = colonIndex >= 0 ? qualifiedName.slice(0, colonIndex) : '';
    if (prefix && !Object.prototype.hasOwnProperty.call(namespaces, prefix)) return null;
    return {
        localName: colonIndex >= 0 ? qualifiedName.slice(colonIndex + 1) : qualifiedName,
        namespaceUri: namespaces[prefix] || ''
    };
}

function confirmWebdavDirectory(cacheKey, cacheGeneration) {
    if (cacheKey && cacheGeneration === webdavDirectoryCacheGeneration) {
        confirmedWebdavCollections.add(cacheKey);
    }
}

async function webdavDirectoryCacheKey(serverConfig, targetUrl) {
    const serverIdentity = getWebdavServerIdentity(serverConfig);
    const credentialFingerprint = await getWebdavCredentialFingerprint(serverConfig.username, serverConfig.password);
    return JSON.stringify([serverIdentity, targetUrl, credentialFingerprint]);
}

function getWebdavServerIdentity(serverConfig) {
    if (serverConfig.id !== undefined && serverConfig.id !== null && String(serverConfig.id) !== '') {
        return `id:${serverConfig.id}`;
    }
    try {
        const serverUrl = new URL(serverConfig.url);
        return `url:${serverUrl.origin}${serverUrl.pathname.replace(/\/+$/, '')}`;
    } catch (_) {
        return `url:${String(serverConfig.url || '')}`;
    }
}

async function getWebdavCredentialFingerprint(username, password) {
    if (!globalThis.crypto?.subtle) {
        throw new Error('Secure WebDAV credential fingerprinting is unavailable.');
    }
    const credentialBytes = new TextEncoder().encode(`${username || ''}\u0000${password || ''}`);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', credentialBytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function webdavDirectoryError(status, statusText, isVerification = false) {
    if (status === 401) return new Error('Directory creation authentication failed. Check username and password.');
    if (status === 403) return new Error('Directory creation permission denied.');
    if (status === 409) return new Error('Cannot create directory because its parent does not exist.');
    const operation = isVerification
        ? 'Failed to verify directory after MKCOL was not allowed'
        : 'Failed to create directory';
    return new Error(`${operation}: ${status} ${statusText || ''}`.trim());
}

function resetWebdavDirectoryCache() {
    webdavDirectoryCacheGeneration += 1;
    confirmedWebdavCollections.clear();
    webdavDirectoryCreationPromises.clear();
}

function basicAuthHeader(username, password) {
    const bytes = new TextEncoder().encode(`${username || ''}:${password || ''}`);
    let binary = '';

    bytes.forEach(byte => {
        binary += String.fromCharCode(byte);
    });

    return `Basic ${btoa(binary)}`;
}

function getWebdavBasePath(baseUrl) {
    const url = new URL(baseUrl);
    let pathname = decodeURIComponent(url.pathname || '/');

    if (!pathname.endsWith('/')) {
        pathname += '/';
    }

    return pathname;
}

function getHrefPath(href) {
    try {
        return decodeURIComponent(new URL(href).pathname);
    } catch (error) {
        return decodeURIComponent(href.split(/[?#]/)[0]);
    }
}

function normalizeWebdavFolder(folder) {
    const rawFolder = String(folder || '/').trim();
    if (!rawFolder || rawFolder === '/') return '/';

    let normalized = rawFolder.startsWith('/') ? rawFolder : `/${rawFolder}`;
    normalized = normalized.replace(/\/+/g, '/');

    if (normalized.endsWith('/') && normalized.length > 1) {
        normalized = normalized.slice(0, -1);
    }

    return normalized;
}

function getWebdavParentFolder(folder) {
    const normalizedFolder = normalizeWebdavFolder(folder);
    if (normalizedFolder === '/') return '/';

    const lastSlash = normalizedFolder.lastIndexOf('/');
    return lastSlash <= 0 ? '/' : normalizedFolder.slice(0, lastSlash);
}

// --- Initial load and menu creation on startup ---
configReady = loadConfig().catch(error => {
    console.error('Initial configuration load failed:', error);
});
configReloadQueue = configReady;
configReady.then(() => {
    createContextMenus();
    return resumePersistedBatches();
}).catch(error => {
    console.error('Failed to restore background state:', error);
});
