(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SidePanelApp = api;

  if (typeof document !== 'undefined' && typeof chrome !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => api.initialize(document, chrome));
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ALLOWED_FORMATS = new Set(['original', 'png', 'jpg', 'webp']);
  const TERMINAL_BATCH_STATES = new Set(['completed', 'cancelled']);
  const UI_PREFERENCE_KEYS = new Set(['theme', 'language']);
  const TRANSLATIONS = {
    en: {
      panelTitle: 'Batch save images',
      currentPage: 'Current page',
      loading: 'Loading…',
      openSettings: 'Open extension settings',
      settings: 'Settings',
      selectionActions: 'Image selection actions',
      selectAll: 'Select all',
      clear: 'Clear',
      refresh: 'Refresh',
      imagesFoundOnPage: 'Images found on this page',
      noImagesFound: 'No images were found on this page.',
      destination: 'Destination',
      noDestinations: 'No destinations configured',
      chooseDestination: 'Choose a WebDAV destination',
      saveBatchAs: 'Save this batch as',
      chooseFormat: 'Choose a format',
      formatOriginal: 'Original',
      selectedNone: '0 selected',
      selectedCount: '{count} selected',
      saveImages: 'Save images',
      saveSelectedImage: 'Save {count} image',
      saveSelectedImages: 'Save {count} images',
      savingImages: 'Saving images',
      progressInitial: '0 of 0 complete',
      cancel: 'Cancel',
      retry: 'Retry',
      retryImage: 'Retry {name}',
      retryFailed: 'Retry failed',
      scanCurrentPage: 'Scan current page',
      extensionActionFailed: 'The extension could not complete this action.',
      sizeUnavailable: 'Size unavailable',
      uniqueImageFound: '{count} unique image found',
      uniqueImagesFound: '{count} unique images found',
      selectImage: 'Select {name}',
      imageFallback: 'image',
      noPreview: 'No preview',
      configureDestination: 'Configure a WebDAV destination before saving.',
      waiting: 'Waiting',
      preparing: 'Preparing',
      uploading: 'Uploading',
      saved: 'Saved',
      savedWarning: 'Saved with warning',
      animatedImageKept: 'Animated image kept in its original format',
      conversionFallback: 'Image kept in its original format after conversion failed',
      localCopyFailed: 'Local copy could not be saved',
      failed: 'Failed',
      cancelled: 'Cancelled',
      batchFinished: 'Batch save finished',
      batchSummary: '{saved} saved · {failed} failed · {cancelled} cancelled',
      batchProgress: '{completed} of {total} complete · {server}',
      webdav: 'WebDAV',
      scanning: 'Scanning the current page…',
      scanUnavailable: 'Scan unavailable',
      startingBatch: 'Starting batch save…'
    },
    zh: {
      panelTitle: '批量保存图片',
      currentPage: '当前页面',
      loading: '加载中…',
      openSettings: '打开扩展设置',
      settings: '设置',
      selectionActions: '图片选择操作',
      selectAll: '全选',
      clear: '清除',
      refresh: '刷新',
      imagesFoundOnPage: '当前页面发现的图片',
      noImagesFound: '当前页面未发现图片。',
      destination: '保存位置',
      noDestinations: '尚未配置保存位置',
      chooseDestination: '选择 WebDAV 保存位置',
      saveBatchAs: '本批次保存格式',
      chooseFormat: '选择格式',
      formatOriginal: '原格式',
      selectedNone: '已选择 0 张',
      selectedCount: '已选择 {count} 张',
      saveImages: '保存图片',
      saveSelectedImage: '保存 {count} 张图片',
      saveSelectedImages: '保存 {count} 张图片',
      savingImages: '正在保存图片',
      progressInitial: '已完成 0/0',
      cancel: '取消',
      retry: '重试',
      retryImage: '重试 {name}',
      retryFailed: '重试失败项',
      scanCurrentPage: '扫描当前页面',
      extensionActionFailed: '扩展无法完成此操作。',
      sizeUnavailable: '尺寸不可用',
      uniqueImageFound: '发现 {count} 张去重后的图片',
      uniqueImagesFound: '发现 {count} 张去重后的图片',
      selectImage: '选择 {name}',
      imageFallback: '图片',
      noPreview: '无预览',
      configureDestination: '保存前请先配置 WebDAV 保存位置。',
      waiting: '等待中',
      preparing: '准备中',
      uploading: '上传中',
      saved: '已保存',
      savedWarning: '已保存（有警告）',
      animatedImageKept: '动画图片已保留原格式',
      conversionFallback: '转换失败，图片已保留原格式',
      localCopyFailed: '本地副本未能保存',
      failed: '失败',
      cancelled: '已取消',
      batchFinished: '批量保存完成',
      batchSummary: '已保存 {saved} · 失败 {failed} · 已取消 {cancelled}',
      batchProgress: '已完成 {completed}/{total} · {server}',
      webdav: 'WebDAV',
      scanning: '正在扫描当前页面…',
      scanUnavailable: '无法扫描',
      startingBatch: '正在启动批量保存…'
    }
  };

  function normalizeLanguage(language) {
    return language === 'zh' ? 'zh' : 'en';
  }

  function translate(language, key, replacements = {}) {
    const normalizedLanguage = normalizeLanguage(language);
    const template = TRANSLATIONS[normalizedLanguage]?.[key] ?? TRANSLATIONS.en[key] ?? key;
    return String(template).replace(/\{([a-zA-Z]+)\}/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(replacements, name) ? String(replacements[name]) : match
    );
  }

  function canRetryBatchItem(batch = {}, item = {}) {
    return TERMINAL_BATCH_STATES.has(batch.state) && item.state === 'failed';
  }

  function canRetryFailedBatch(batch = {}) {
    if (!TERMINAL_BATCH_STATES.has(batch.state)) return false;
    const failed = Number(batch.summary?.failed);
    return Number.isFinite(failed)
      ? failed > 0
      : (batch.items || []).some(item => item.state === 'failed');
  }

  function createRetryFailedMessage(batchId, itemId) {
    const message = { action: 'batchPanel:retryFailed', batchId: String(batchId || '') };
    if (itemId !== undefined) message.itemIds = [String(itemId)];
    return message;
  }

  function createBatchItemActions(doc, {
    language,
    batch,
    item,
    statusText,
    onRetry = () => {}
  }) {
    const actions = doc.createElement('span');
    actions.className = 'batch-item-actions';
    const badge = doc.createElement('span');
    badge.className = 'status-badge';
    badge.textContent = statusText;
    actions.appendChild(badge);

    if (canRetryBatchItem(batch, item)) {
      const retry = doc.createElement('button');
      retry.type = 'button';
      retry.className = 'secondary-button item-retry-button';
      retry.textContent = translate(language, 'retry');
      retry.setAttribute('aria-label', translate(language, 'retryImage', {
        name: item.name || item.filename || translate(language, 'imageFallback')
      }));
      retry.addEventListener('click', () => (
        onRetry(createRetryFailedMessage(batch.batchId, item.id), retry)
      ));
      actions.appendChild(retry);
    }
    return actions;
  }

  function applyDocumentLanguage(doc, language) {
    const normalizedLanguage = normalizeLanguage(language);
    doc.title = translate(normalizedLanguage, 'panelTitle');
    doc.querySelectorAll('[data-i18n]').forEach(element => {
      element.textContent = translate(normalizedLanguage, element.dataset.i18n);
    });
    for (const attribute of ['aria-label', 'title']) {
      doc.querySelectorAll(`[data-i18n-${attribute}]`).forEach(element => {
        const key = element.getAttribute(`data-i18n-${attribute}`);
        if (key) element.setAttribute(attribute, translate(normalizedLanguage, key));
      });
    }
  }

  function readUiPreferences(storage) {
    try {
      const storedTheme = storage?.getItem('theme');
      return {
        theme: storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : '',
        language: normalizeLanguage(storage?.getItem('language'))
      };
    } catch (_error) {
      return { theme: '', language: 'en' };
    }
  }

  function createUiPreferenceSync({ root, storage, onLanguageChange = () => {} }) {
    let appliedLanguage = '';

    function sync() {
      const preferences = readUiPreferences(storage);
      if (preferences.theme) root.dataset.theme = preferences.theme;
      else delete root.dataset.theme;
      root.dataset.language = preferences.language;
      root.lang = preferences.language === 'zh' ? 'zh-CN' : 'en';
      if (preferences.language !== appliedLanguage) {
        appliedLanguage = preferences.language;
        onLanguageChange(preferences.language);
      }
      return preferences;
    }

    function handleStorage(event = {}) {
      if (event.key === null || UI_PREFERENCE_KEYS.has(event.key)) return sync();
      return null;
    }

    return { sync, handleStorage };
  }

  function batchItemDetail(language, item = {}, target = '') {
    if (item.error) return String(item.error);
    const warningKeys = {
      'animated-image': 'animatedImageKept',
      'conversion-failed': 'conversionFallback',
      'local-copy': 'localCopyFailed'
    };
    const warnings = [...new Set(Array.isArray(item.warningCodes) ? item.warningCodes : [])]
      .map(code => warningKeys[code])
      .filter(Boolean)
      .map(key => translate(language, key));
    if (warnings.length) return warnings.join(' · ');
    if (item.state === 'cancelled') return translate(language, 'cancelled');
    if (item.state === 'failed') return translate(language, 'failed');
    if (item.state === 'warning' && item.message) return String(item.message);
    if (target) return target;
    const statusKeys = {
      queued: 'waiting',
      preparing: 'preparing',
      uploading: 'uploading',
      success: 'saved'
    };
    return translate(language, statusKeys[item.state] || 'waiting');
  }

  function uniqueAvailableIds(images, selectedIds) {
    const requested = new Set((selectedIds || []).map(String));
    return (images || [])
      .map(image => String(image.id || ''))
      .filter((id, index, ids) => id && requested.has(id) && ids.indexOf(id) === index);
  }

  function createPanelModel({ scan, servers = [], settings = {} }) {
    const images = Array.isArray(scan?.images) ? scan.images.slice() : [];
    const saveFormat = settings.image?.saveFormat || 'original';
    return {
      scanId: String(scan?.scanId || ''),
      tabId: scan?.tabId,
      pageUrl: String(scan?.pageUrl || ''),
      pageTitle: String(scan?.pageTitle || ''),
      images,
      servers: servers.slice(),
      settings,
      selectedIds: uniqueAvailableIds(images, images.map(image => image.id)),
      serverId: servers.length === 1 ? String(servers[0].id) : '',
      targetFormat: saveFormat === 'ask' ? '' : saveFormat
    };
  }

  function updatePanelModel(model, changes = {}) {
    const next = { ...model, ...changes };
    next.selectedIds = uniqueAvailableIds(
      next.images,
      Object.prototype.hasOwnProperty.call(changes, 'selectedIds')
        ? changes.selectedIds
        : model.selectedIds
    );
    next.serverId = String(next.serverId || '');
    next.targetFormat = String(next.targetFormat || '');
    return next;
  }

  function selectedImages(model) {
    const selected = new Set(model.selectedIds);
    return model.images.filter(image => selected.has(String(image.id)));
  }

  function canStartBatch(model) {
    return selectedImages(model).length > 0 &&
      model.servers.some(server => String(server.id) === model.serverId) &&
      ALLOWED_FORMATS.has(model.targetFormat);
  }

  function createDestinationMenu(servers = [], selectedId = '', language = 'en') {
    const requestedValue = String(selectedId || '');
    const items = servers.map(server => ({
      value: String(server.id),
      label: `${server.name} · ${server.folder || '/'}`,
      selected: String(server.id) === requestedValue
    }));
    const selectedItem = items.find(item => item.selected);
    return {
      disabled: items.length === 0,
      value: selectedItem?.value || '',
      label: selectedItem?.label || translate(language, items.length ? 'chooseDestination' : 'noDestinations'),
      items
    };
  }

  function nextDestinationIndex(currentIndex, key, itemCount) {
    if (itemCount <= 0) return -1;
    if (key === 'Home') return 0;
    if (key === 'End') return itemCount - 1;
    if (key === 'ArrowDown') return (currentIndex + 1 + itemCount) % itemCount;
    if (key === 'ArrowUp') return (currentIndex - 1 + itemCount) % itemCount;
    return currentIndex;
  }

  function initialize(doc, chromeApi) {
    const elements = {
      pageTitle: doc.getElementById('page-title'),
      pageMeta: doc.getElementById('page-meta'),
      notice: doc.getElementById('notice'),
      selectionView: doc.getElementById('selection-view'),
      progressView: doc.getElementById('progress-view'),
      imageList: doc.getElementById('image-list'),
      emptyState: doc.getElementById('empty-state'),
      selectedCount: doc.getElementById('selected-count'),
      selectAll: doc.getElementById('select-all'),
      clearSelection: doc.getElementById('clear-selection'),
      refresh: doc.getElementById('refresh'),
      settings: doc.getElementById('open-settings'),
      destination: doc.getElementById('destination'),
      destinationSelect: doc.getElementById('destination-select'),
      destinationTrigger: doc.getElementById('destination-trigger'),
      destinationValue: doc.getElementById('destination-value'),
      destinationOptions: doc.getElementById('destination-options'),
      formatField: doc.getElementById('format-field'),
      format: doc.getElementById('format'),
      save: doc.getElementById('save'),
      progressTitle: doc.getElementById('progress-title'),
      progressMeta: doc.getElementById('progress-meta'),
      progress: doc.getElementById('batch-progress'),
      batchItems: doc.getElementById('batch-items'),
      cancel: doc.getElementById('cancel-batch'),
      retry: doc.getElementById('retry-failed'),
      newBatch: doc.getElementById('new-batch')
    };
    let context = null;
    let model = null;
    let currentBatch = null;
    let loading = false;
    let destinationOptionElements = [];
    let currentLanguage = 'en';
    let noticeState = { message: '', kind: '' };
    const t = (key, replacements = {}) => translate(currentLanguage, key, replacements);

    function localizedMessage(key, replacements = {}) {
      return { key, replacements };
    }

    function resolveMessage(message) {
      if (message && typeof message === 'object' && typeof message.key === 'string') {
        return t(message.key, message.replacements || {});
      }
      return String(message || '');
    }

    async function send(message) {
      const response = await chromeApi.runtime.sendMessage(message);
      if (!response?.success) throw new Error(response?.error || t('extensionActionFailed'));
      return response;
    }

    function renderNotice() {
      const message = resolveMessage(noticeState.message);
      elements.notice.textContent = message;
      elements.notice.className = `notice${noticeState.kind ? ` ${noticeState.kind}` : ''}`;
      elements.notice.hidden = !message;
    }

    function setNotice(message, kind = '') {
      noticeState = { message, kind };
      renderNotice();
    }

    function setLoading(value, message = '') {
      loading = value;
      elements.refresh.disabled = value;
      if (model) elements.save.disabled = value || !canStartBatch(model);
      if (message) setNotice(message, 'loading');
    }

    function setText(element, value) {
      element.textContent = String(value || '');
    }

    function formatDimensions(image) {
      return image.width && image.height ? `${image.width} × ${image.height}` : t('sizeUnavailable');
    }

    function applyLanguage(language) {
      const preservedNotice = noticeState;
      currentLanguage = normalizeLanguage(language);
      applyDocumentLanguage(doc, currentLanguage);
      if (currentBatch) renderBatch(currentBatch);
      else if (model) renderSelection();
      if (preservedNotice.message) noticeState = preservedNotice;
      renderNotice();
    }

    function isDestinationOpen() {
      return elements.destinationTrigger.getAttribute('aria-expanded') === 'true';
    }

    function openDestination({ focusSelected = false } = {}) {
      if (elements.destinationTrigger.disabled || !destinationOptionElements.length) return;
      elements.destinationSelect.classList.add('is-open');
      elements.destinationOptions.hidden = false;
      elements.destinationTrigger.setAttribute('aria-expanded', 'true');
      if (focusSelected) {
        const selectedOption = destinationOptionElements.find(option => option.getAttribute('aria-selected') === 'true');
        (selectedOption || destinationOptionElements[0]).focus();
      }
    }

    function closeDestination({ restoreFocus = false } = {}) {
      elements.destinationSelect.classList.remove('is-open');
      elements.destinationOptions.hidden = true;
      elements.destinationTrigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus) elements.destinationTrigger.focus();
    }

    function toggleDestination() {
      if (isDestinationOpen()) closeDestination();
      else openDestination();
    }

    function selectDestination(value) {
      if (!model) return;
      model = updatePanelModel(model, { serverId: value });
      renderDestinations();
      elements.destinationTrigger.focus();
      renderSelectionFooter();
    }

    function handleDestinationTriggerKeydown(event) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        openDestination({ focusSelected: true });
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleDestination();
      } else if (event.key === 'Escape' && isDestinationOpen()) {
        event.preventDefault();
        closeDestination();
      }
    }

    function handleDestinationOptionKeydown(event, index) {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        destinationOptionElements[nextDestinationIndex(index, event.key, destinationOptionElements.length)]?.focus();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectDestination(destinationOptionElements[index]?.dataset.value);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeDestination({ restoreFocus: true });
      } else if (event.key === 'Tab') {
        closeDestination();
      }
    }

    function renderDestinations() {
      closeDestination();
      const menu = createDestinationMenu(context.servers, model.serverId, currentLanguage);
      elements.destination.value = menu.value;
      elements.destinationValue.textContent = menu.label;
      elements.destinationTrigger.disabled = menu.disabled;
      elements.destinationOptions.replaceChildren();
      destinationOptionElements = menu.items.map((item, index) => {
        const option = doc.createElement('button');
        option.type = 'button';
        option.className = 'format-select-option';
        option.dataset.value = item.value;
        option.id = `destination-option-${index}`;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(item.selected));

        const label = doc.createElement('span');
        label.textContent = item.label;
        const icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.classList.add('ui-icon');
        icon.setAttribute('aria-hidden', 'true');
        icon.setAttribute('viewBox', '0 0 24 24');
        const check = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
        check.setAttribute('d', 'm5 12 4 4L19 7');
        icon.appendChild(check);
        option.append(label, icon);
        option.addEventListener('click', () => selectDestination(item.value));
        option.addEventListener('keydown', event => handleDestinationOptionKeydown(event, index));
        elements.destinationOptions.appendChild(option);
        return option;
      });
    }

    function renderSelection() {
      if (!model) return;
      currentBatch = null;
      elements.selectionView.hidden = false;
      elements.progressView.hidden = true;
      setText(elements.pageTitle, model.pageTitle || t('currentPage'));
      setText(
        elements.pageMeta,
        t(model.images.length === 1 ? 'uniqueImageFound' : 'uniqueImagesFound', { count: model.images.length })
      );
      elements.imageList.replaceChildren();
      elements.emptyState.hidden = model.images.length > 0;
      const selected = new Set(model.selectedIds);

      model.images.forEach(image => {
        const row = doc.createElement('label');
        row.className = 'image-row';

        const checkbox = doc.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selected.has(String(image.id));
        checkbox.setAttribute('aria-label', t('selectImage', { name: image.name || t('imageFallback') }));
        checkbox.addEventListener('change', () => {
          const ids = new Set(model.selectedIds);
          if (checkbox.checked) ids.add(String(image.id));
          else ids.delete(String(image.id));
          model = updatePanelModel(model, { selectedIds: [...ids] });
          renderSelectionFooter();
          row.classList.toggle('selected', checkbox.checked);
        });

        const thumbFrame = doc.createElement('span');
        thumbFrame.className = 'thumbnail-frame';
        const thumbnail = doc.createElement('img');
        thumbnail.className = 'thumbnail';
        thumbnail.src = image.url;
        thumbnail.alt = '';
        thumbnail.loading = 'lazy';
        thumbnail.referrerPolicy = 'no-referrer';
        thumbnail.addEventListener('error', () => {
          thumbFrame.dataset.unavailableLabel = t('noPreview');
          thumbFrame.classList.add('unavailable');
        });
        thumbFrame.appendChild(thumbnail);

        const copy = doc.createElement('span');
        copy.className = 'image-copy';
        const name = doc.createElement('span');
        name.className = 'image-name';
        name.textContent = image.name || t('imageFallback');
        name.title = image.name || t('imageFallback');
        const dimensions = doc.createElement('span');
        dimensions.className = 'image-dimensions';
        dimensions.textContent = formatDimensions(image);
        copy.append(name, dimensions);

        row.classList.toggle('selected', checkbox.checked);
        row.append(checkbox, thumbFrame, copy);
        elements.imageList.appendChild(row);
      });

      renderDestinations();
      const asksForFormat = context.settings.image?.saveFormat === 'ask';
      elements.formatField.hidden = !asksForFormat;
      elements.format.value = model.targetFormat;
      renderSelectionFooter();

      if (!context.servers.length) {
        setNotice(localizedMessage('configureDestination'), 'warning');
      } else {
        setNotice('');
      }
    }

    function renderSelectionFooter() {
      const count = model?.selectedIds.length || 0;
      elements.selectedCount.textContent = t('selectedCount', { count });
      elements.selectAll.disabled = !model?.images.length || count === model.images.length;
      elements.clearSelection.disabled = count === 0;
      elements.save.disabled = loading || !model || !canStartBatch(model);
      elements.save.textContent = count
        ? t(count === 1 ? 'saveSelectedImage' : 'saveSelectedImages', { count })
        : t('saveImages');
    }

    function batchStatusText(item) {
      const labels = {
        queued: t('waiting'),
        preparing: t('preparing'),
        uploading: t('uploading'),
        success: t('saved'),
        warning: t('savedWarning'),
        failed: t('failed'),
        cancelled: t('cancelled')
      };
      return labels[item.state] || item.state || t('waiting');
    }

    async function retryFailedItems(message, trigger) {
      if (!currentBatch) return;
      trigger.disabled = true;
      try {
        const response = await send(message);
        renderBatch(response.batch);
      } catch (error) {
        setNotice(error.message, 'error');
      } finally {
        trigger.disabled = false;
      }
    }

    function renderBatch(batch) {
      if (!batch) return;
      closeDestination();
      currentBatch = batch;
      elements.selectionView.hidden = true;
      elements.progressView.hidden = false;
      setNotice('');

      const summary = batch.summary || {};
      const completed = summary.completed || 0;
      const total = summary.total || batch.items?.length || 0;
      const terminal = TERMINAL_BATCH_STATES.has(batch.state);
      elements.progress.value = total ? completed / total : 0;
      elements.progress.max = 1;
      elements.progressTitle.textContent = terminal ? t('batchFinished') : t('savingImages');
      elements.progressMeta.textContent = terminal
        ? t('batchSummary', {
            saved: (summary.success || 0) + (summary.warning || 0),
            failed: summary.failed || 0,
            cancelled: summary.cancelled || 0
          })
        : t('batchProgress', {
            completed,
            total,
            server: batch.serverName || t('webdav')
          });
      elements.batchItems.replaceChildren();

      (batch.items || []).forEach(item => {
        const row = doc.createElement('li');
        row.className = `batch-item state-${item.state || 'queued'}`;
        const thumb = doc.createElement('img');
        thumb.src = item.url;
        thumb.alt = '';
        thumb.loading = 'lazy';
        thumb.referrerPolicy = 'no-referrer';
        const copy = doc.createElement('span');
        copy.className = 'batch-item-copy';
        const name = doc.createElement('span');
        name.className = 'batch-item-name';
        name.textContent = item.name || item.filename || t('imageFallback');
        const detail = doc.createElement('span');
        detail.className = 'batch-item-detail';
        const target = item.filename ? `${item.allocatedFolder || ''}/${item.filename}`.replace(/\/+/g, '/') : '';
        detail.textContent = batchItemDetail(currentLanguage, item, target);
        const actions = createBatchItemActions(doc, {
          language: currentLanguage,
          batch,
          item,
          statusText: batchStatusText(item),
          onRetry: retryFailedItems
        });
        copy.append(name, detail);
        row.append(thumb, copy, actions);
        elements.batchItems.appendChild(row);
      });

      elements.cancel.hidden = terminal;
      elements.cancel.disabled = batch.state === 'cancelling';
      elements.retry.hidden = !canRetryFailedBatch(batch);
      elements.newBatch.hidden = !terminal;
    }

    async function loadCurrentPage() {
      try {
        setLoading(true, localizedMessage('scanning'));
        const contextResponse = await send({ action: 'batchPanel:getContext' });
        context = contextResponse.context;
        if (context.activeBatch && !TERMINAL_BATCH_STATES.has(context.activeBatch.state)) {
          renderBatch(context.activeBatch);
          return;
        }
        const scanResponse = await send({ action: 'batchPanel:scan' });
        model = createPanelModel({
          scan: scanResponse.scan,
          servers: context.servers,
          settings: context.settings
        });
        renderSelection();
      } catch (error) {
        model = null;
        currentBatch = null;
        elements.selectionView.hidden = false;
        elements.progressView.hidden = true;
        elements.imageList.replaceChildren();
        elements.emptyState.hidden = false;
        elements.save.disabled = true;
        elements.selectedCount.textContent = t('selectedCount', { count: 0 });
        setText(elements.pageTitle, t('currentPage'));
        setText(elements.pageMeta, t('scanUnavailable'));
        setText(elements.emptyState, error.message);
        setNotice(error.message, 'error');
      } finally {
        setLoading(false);
      }
    }

    const view = doc.defaultView;
    let preferenceStorage = null;
    try {
      preferenceStorage = view?.localStorage || null;
    } catch (_error) {
      preferenceStorage = null;
    }
    const preferenceSync = createUiPreferenceSync({
      root: doc.documentElement,
      storage: preferenceStorage,
      onLanguageChange: applyLanguage
    });
    preferenceSync.sync();
    view?.addEventListener('storage', preferenceSync.handleStorage);

    elements.selectAll.addEventListener('click', () => {
      model = updatePanelModel(model, { selectedIds: model.images.map(image => image.id) });
      renderSelection();
    });
    elements.clearSelection.addEventListener('click', () => {
      model = updatePanelModel(model, { selectedIds: [] });
      renderSelection();
    });
    elements.refresh.addEventListener('click', loadCurrentPage);
    elements.settings.addEventListener('click', () => chromeApi.runtime.openOptionsPage());
    elements.destinationTrigger.addEventListener('click', toggleDestination);
    elements.destinationTrigger.addEventListener('keydown', handleDestinationTriggerKeydown);
    elements.format.addEventListener('change', () => {
      model = updatePanelModel(model, { targetFormat: elements.format.value });
      renderSelectionFooter();
    });
    elements.save.addEventListener('click', async () => {
      if (!canStartBatch(model)) return;
      try {
        setLoading(true, localizedMessage('startingBatch'));
        const response = await send({
          action: 'batchPanel:start',
          scanId: model.scanId,
          tabId: model.tabId,
          imageIds: model.selectedIds,
          serverId: model.serverId,
          targetFormat: model.targetFormat
        });
        renderBatch(response.batch);
      } catch (error) {
        setNotice(error.message, 'error');
      } finally {
        setLoading(false);
      }
    });
    elements.cancel.addEventListener('click', async () => {
      if (!currentBatch) return;
      try {
        const response = await send({ action: 'batchPanel:cancel', batchId: currentBatch.batchId });
        renderBatch(response.batch);
      } catch (error) {
        setNotice(error.message, 'error');
      }
    });
    elements.retry.addEventListener('click', () => {
      if (!currentBatch) return;
      return retryFailedItems(
        createRetryFailedMessage(currentBatch.batchId),
        elements.retry
      );
    });
    elements.newBatch.addEventListener('click', loadCurrentPage);

    doc.addEventListener('click', event => {
      if (isDestinationOpen() && !elements.destinationSelect.contains(event.target)) closeDestination();
    });

    chromeApi.runtime.onMessage.addListener(message => {
      if (message.action === 'batchPanel:stateChanged' && message.batch) renderBatch(message.batch);
      return false;
    });
    chromeApi.tabs?.onActivated?.addListener(() => {
      if (!currentBatch || TERMINAL_BATCH_STATES.has(currentBatch.state)) loadCurrentPage();
    });

    loadCurrentPage();
  }

  return {
    applyDocumentLanguage,
    batchItemDetail,
    canRetryBatchItem,
    canRetryFailedBatch,
    createBatchItemActions,
    createRetryFailedMessage,
    createPanelModel,
    createDestinationMenu,
    createUiPreferenceSync,
    nextDestinationIndex,
    translate,
    updatePanelModel,
    selectedImages,
    canStartBatch,
    initialize
  };
}));
