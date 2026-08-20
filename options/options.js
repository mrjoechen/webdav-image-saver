document.addEventListener('DOMContentLoaded', () => {
  // Element selectors
  const elements = {
    emptyState: document.getElementById('empty-state'),
    serversSection: document.getElementById('servers-section'),
    serverList: document.getElementById('server-list'),
    addServerBtn: document.getElementById('add-server-btn'),
    addFirstServerBtn: document.getElementById('add-first-server-btn'),
    saveSettingsBtn: document.getElementById('save-settings-btn'),
    saveSettingsModal: document.getElementById('save-settings-modal'),
    saveSettingsForm: document.getElementById('save-settings-form'),
    imageFormatPreference: document.getElementById('image-format-preference'),
    imageFormatSelect: document.getElementById('image-format-select'),
    imageFormatTrigger: document.getElementById('image-format-trigger'),
    imageFormatValue: document.getElementById('image-format-value'),
    imageFormatOptions: document.getElementById('image-format-options'),
    filenameRule: document.getElementById('filename-rule'),
    filenameTemplateGroup: document.getElementById('filename-template-group'),
    filenameTemplate: document.getElementById('filename-template'),
    filenameTemplateError: document.getElementById('filename-template-error'),
    filenamePreview: document.getElementById('filename-preview'),
    directoryRule: document.getElementById('directory-rule'),
    closeSaveSettingsBtn: document.getElementById('close-save-settings-btn'),
    cancelSaveSettingsBtn: document.getElementById('cancel-save-settings-btn'),
    saveSaveSettingsBtn: document.getElementById('save-save-settings-btn'),
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    themeToggleIcon: document.getElementById('theme-toggle-icon'),
    modal: document.getElementById('server-modal'),
    modalTitle: document.getElementById('modal-title'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    cancelBtn: document.getElementById('cancel-btn'),
    serverForm: document.getElementById('server-form'),
    saveServerBtn: document.getElementById('save-server-btn'),
    testConnectionBtn: document.getElementById('test-connection-btn'),
    connectionStatus: document.getElementById('connection-status'),
    folderSelection: document.getElementById('folder-selection'),
    customFolderPath: document.getElementById('custom-folder-path'),
    openFolderPickerBtn: document.getElementById('open-folder-picker-btn'),
    folderPickerModal: document.getElementById('folder-picker-modal'),
    closeFolderPickerBtn: document.getElementById('close-folder-picker-btn'),
    cancelFolderPickerBtn: document.getElementById('cancel-folder-picker-btn'),
    selectFolderBtn: document.getElementById('select-folder-btn'),
    folderPickerBackBtn: document.getElementById('folder-picker-back-btn'),
    folderPickerRefreshBtn: document.getElementById('folder-picker-refresh-btn'),
    folderList: document.getElementById('folder-list'),
    selectedFolderPath: document.getElementById('selected-folder-path'),
    notification: document.getElementById('notification')
  };

  // Form inputs
  const inputs = {
    editId: document.getElementById('edit-id'),
    serverName: document.getElementById('server-name'),
    serverUrl: document.getElementById('server-url'),
    serverUsername: document.getElementById('server-username'),
    serverPassword: document.getElementById('server-password')
  };

  const folderPickerState = {
    config: null,
    currentPath: '/',
    selectedPath: '/'
  };
  const imageFormatOptionElements = [...document.querySelectorAll('.format-select-option')];
  const imageFormatLabels = {
    original: 'Original',
    ask: 'Ask every time',
    png: 'PNG',
    jpg: 'JPG',
    webp: 'WebP'
  };
  let persistedSaveSettings = {
    image: { saveFormat: 'original' },
    filename: {
      rule: 'automatic',
      customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE
    },
    directory: { rule: 'fixed' }
  };

  // Initialize the app
  init();

  async function init() {
    initTheme();
    attachEventListeners();
    await Promise.all([loadServers(), loadSaveSettings()]);
  }

  function attachEventListeners() {
    // Modal controls
    elements.addServerBtn?.addEventListener('click', () => openModal());
    elements.addFirstServerBtn?.addEventListener('click', () => openModal());
    elements.saveSettingsBtn?.addEventListener('click', openSaveSettingsModal);
    elements.saveSettingsForm?.addEventListener('submit', saveSaveSettings);
    elements.imageFormatTrigger?.addEventListener('click', toggleImageFormatSelect);
    elements.imageFormatTrigger?.addEventListener('keydown', handleImageFormatTriggerKeydown);
    imageFormatOptionElements.forEach((option, index) => {
      option.addEventListener('click', () => selectImageFormat(option.dataset.value));
      option.addEventListener('keydown', event => handleImageFormatOptionKeydown(event, index));
    });
    elements.filenameRule?.addEventListener('change', updateFilenameRuleEditor);
    elements.filenameTemplate?.addEventListener('input', updateFilenameRuleEditor);
    elements.closeSaveSettingsBtn?.addEventListener('click', closeSaveSettingsModal);
    elements.cancelSaveSettingsBtn?.addEventListener('click', closeSaveSettingsModal);
    elements.saveSettingsModal?.addEventListener('click', event => {
      if (event.target === elements.saveSettingsModal) closeSaveSettingsModal();
    });
    elements.themeToggleBtn?.addEventListener('click', toggleTheme);
    elements.closeModalBtn?.addEventListener('click', () => closeModal());
    elements.cancelBtn?.addEventListener('click', () => closeModal());
    
    // Form submission
    elements.serverForm?.addEventListener('submit', handleFormSubmit);
    
    // Connection test
    elements.testConnectionBtn?.addEventListener('click', testConnection);
    elements.openFolderPickerBtn?.addEventListener('click', () => openFolderPicker(elements.customFolderPath?.value || '/'));
    elements.customFolderPath?.addEventListener('input', updateFolderSelectionFromInput);
    elements.closeFolderPickerBtn?.addEventListener('click', closeFolderPicker);
    elements.cancelFolderPickerBtn?.addEventListener('click', closeFolderPicker);
    elements.selectFolderBtn?.addEventListener('click', confirmFolderSelection);
    elements.folderPickerBackBtn?.addEventListener('click', openParentFolder);
    elements.folderPickerRefreshBtn?.addEventListener('click', () => loadFolderPickerPath(folderPickerState.currentPath));

    document.addEventListener('click', event => {
      if (isImageFormatSelectOpen() && !elements.imageFormatSelect?.contains(event.target)) {
        closeImageFormatSelect();
      }
    });


    // ESC key to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;

      if (isImageFormatSelectOpen()) {
        closeImageFormatSelect({ restoreFocus: true });
      } else if (!elements.folderPickerModal?.classList.contains('hidden')) {
        closeFolderPicker();
      } else if (!elements.saveSettingsModal?.classList.contains('hidden')) {
        closeSaveSettingsModal();
      } else if (!elements.modal?.classList.contains('hidden')) {
        closeModal();
      }
    });
  }

  function initTheme() {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'light' || storedTheme === 'dark') {
      document.documentElement.dataset.theme = storedTheme;
      updateThemeToggle(storedTheme);
      return;
    }

    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    updateThemeToggle(systemTheme);
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.dataset.theme ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem('theme', nextTheme);
    updateThemeToggle(nextTheme);
  }

  function updateThemeToggle(theme) {
    if (!elements.themeToggleIcon || !elements.themeToggleBtn) return;

    const isDark = theme === 'dark';
    elements.themeToggleIcon.querySelector('use')?.setAttribute('href', isDark ? '#icon-sun' : '#icon-moon');
    elements.themeToggleBtn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    elements.themeToggleBtn.setAttribute('title', isDark ? 'Light mode' : 'Dark mode');
  }

  function copySaveSettings(settings) {
    return {
      image: { saveFormat: ImageFormat.normalizeFormatPreference(settings?.image?.saveFormat) },
      filename: {
        rule: FilenameRule.normalizeFilenameRule(settings?.filename?.rule),
        customTemplate: String(settings?.filename?.customTemplate || FilenameRule.DEFAULT_CUSTOM_TEMPLATE).trim()
      },
      directory: { rule: DirectoryRule.normalizeDirectoryRule(settings?.directory?.rule) }
    };
  }

  async function loadSaveSettings() {
    try {
      const settings = await AppSettings.loadSettings(chrome.storage.local);
      persistedSaveSettings = copySaveSettings(settings);
      restoreSaveSettingsControls();
    } catch (error) {
      console.error('Error loading save settings:', error);
      showNotification('Could not load Save settings.', 'error');
    }
  }

  function openSaveSettingsModal() {
    restoreSaveSettingsControls();
    elements.saveSettingsModal?.classList.remove('hidden');
    elements.imageFormatTrigger?.focus();
  }

  function closeSaveSettingsModal() {
    closeImageFormatSelect();
    elements.saveSettingsModal?.classList.add('hidden');
    restoreSaveSettingsControls();
  }

  function restoreSaveSettingsControls() {
    setImageFormatControl(persistedSaveSettings.image.saveFormat);
    if (elements.filenameRule) elements.filenameRule.value = persistedSaveSettings.filename.rule;
    if (elements.filenameTemplate) elements.filenameTemplate.value = persistedSaveSettings.filename.customTemplate;
    if (elements.directoryRule) elements.directoryRule.value = persistedSaveSettings.directory.rule;
    updateFilenameRuleEditor();
  }

  function setImageFormatControl(value) {
    const normalizedValue = ImageFormat.normalizeFormatPreference(value);
    if (elements.imageFormatPreference) elements.imageFormatPreference.value = normalizedValue;
    if (elements.imageFormatValue) elements.imageFormatValue.textContent = imageFormatLabels[normalizedValue];

    imageFormatOptionElements.forEach(option => {
      const isSelected = option.dataset.value === normalizedValue;
      option.setAttribute('aria-selected', String(isSelected));
      option.classList.toggle('selected', isSelected);
    });
  }

  function isImageFormatSelectOpen() {
    return elements.imageFormatTrigger?.getAttribute('aria-expanded') === 'true';
  }

  function openImageFormatSelect({ focusSelected = false } = {}) {
    elements.imageFormatSelect?.classList.add('is-open');
    elements.imageFormatOptions?.classList.remove('hidden');
    elements.imageFormatTrigger?.setAttribute('aria-expanded', 'true');

    if (focusSelected) {
      const selectedOption = imageFormatOptionElements.find(option => option.getAttribute('aria-selected') === 'true');
      (selectedOption || imageFormatOptionElements[0])?.focus();
    }
  }

  function closeImageFormatSelect({ restoreFocus = false } = {}) {
    elements.imageFormatSelect?.classList.remove('is-open');
    elements.imageFormatOptions?.classList.add('hidden');
    elements.imageFormatTrigger?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) elements.imageFormatTrigger?.focus();
  }

  function toggleImageFormatSelect() {
    if (isImageFormatSelectOpen()) {
      closeImageFormatSelect();
    } else {
      openImageFormatSelect();
    }
  }

  function selectImageFormat(value) {
    setImageFormatControl(value);
    closeImageFormatSelect({ restoreFocus: true });
  }

  function handleImageFormatTriggerKeydown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openImageFormatSelect({ focusSelected: true });
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleImageFormatSelect();
    }
  }

  function handleImageFormatOptionKeydown(event, index) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const offset = event.key === 'ArrowDown' ? 1 : -1;
      imageFormatOptionElements[(index + offset + imageFormatOptionElements.length) % imageFormatOptionElements.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const targetIndex = event.key === 'Home' ? 0 : imageFormatOptionElements.length - 1;
      imageFormatOptionElements[targetIndex]?.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectImageFormat(imageFormatOptionElements[index]?.dataset.value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeImageFormatSelect({ restoreFocus: true });
    } else if (event.key === 'Tab') {
      closeImageFormatSelect();
    }
  }

  function updateFilenameRuleEditor() {
    const isCustom = FilenameRule.normalizeFilenameRule(elements.filenameRule?.value) === 'custom';
    elements.filenameTemplateGroup?.toggleAttribute('hidden', !isCustom);
    const template = elements.filenameTemplate?.value || '';
    const validation = FilenameRule.validateTemplate(template.trim());
    const invalid = isCustom && !validation.valid;

    if (elements.filenameTemplate) {
      elements.filenameTemplate.setAttribute('aria-invalid', String(invalid));
      elements.filenameTemplate.classList.toggle('is-invalid', invalid);
    }
    if (elements.filenameTemplateError) {
      elements.filenameTemplateError.textContent = invalid ? validation.error : '';
      elements.filenameTemplateError.classList.toggle('hidden', !invalid);
    }
    if (elements.saveSaveSettingsBtn) elements.saveSaveSettingsBtn.disabled = invalid;
    updateFilenamePreview();
    return validation;
  }

  function updateFilenamePreview() {
    if (!elements.filenamePreview) return;
    elements.filenamePreview.textContent = FilenameRule.generateFilename({
      rule: FilenameRule.normalizeFilenameRule(elements.filenameRule?.value),
      template: elements.filenameTemplate.value,
      imageUrl: 'https://cdn.example.net/photos/sunset.png',
      pageUrl: 'https://www.example.com/article',
      pageTitle: 'Summer trip',
      width: 1920,
      height: 1080,
      extension: 'jpg',
      now: new Date(2026, 7, 20, 14, 35, 9)
    });
  }

  async function saveSaveSettings(event) {
    event.preventDefault();
    const filenameValidation = updateFilenameRuleEditor();
    const filenameRule = FilenameRule.normalizeFilenameRule(elements.filenameRule?.value);
    if (filenameRule === 'custom' && !filenameValidation.valid) {
      elements.filenameTemplate?.focus();
      return;
    }

    const selectedPreference = ImageFormat.normalizeFormatPreference(elements.imageFormatPreference?.value);
    const customTemplate = (elements.filenameTemplate?.value || '').trim() || FilenameRule.DEFAULT_CUSTOM_TEMPLATE;
    const directoryRule = DirectoryRule.normalizeDirectoryRule(elements.directoryRule?.value);

    try {
      if (elements.saveSaveSettingsBtn) elements.saveSaveSettingsBtn.disabled = true;
      const settings = await AppSettings.updateSettings(chrome.storage.local, {
        image: {
          saveFormat: selectedPreference
        },
        filename: {
          rule: filenameRule,
          customTemplate
        },
        directory: {
          rule: directoryRule
        }
      });
      persistedSaveSettings = copySaveSettings(settings);
      closeSaveSettingsModal();
      const backgroundUpdated = await notifyBackgroundConfigUpdated();
      showNotification(
        backgroundUpdated ? 'Save settings saved.' : 'Saved. Reload the extension to apply it.',
        backgroundUpdated ? 'success' : 'warning'
      );
    } catch (error) {
      console.error('Error saving Save settings:', error);
      showNotification('Could not save Save settings.', 'error');
    } finally {
      if (elements.saveSaveSettingsBtn) elements.saveSaveSettingsBtn.disabled = false;
    }
  }

  function openModal(serverId = null) {
    if (serverId) {
      loadServerForEdit(serverId);
      elements.modalTitle.textContent = 'Edit Server';
    } else {
      resetForm();
      elements.modalTitle.textContent = 'Add Server';
    }
    
    elements.modal?.classList.remove('hidden');
    inputs.serverName?.focus();
  }

  function closeModal() {
    elements.modal?.classList.add('hidden');
    resetForm();
  }

  function resetForm() {
    // Clear all form inputs
    Object.values(inputs).forEach(input => {
      if (input) input.value = '';
    });
    
    // Reset connection status and folder selection
    elements.connectionStatus.textContent = '';
    elements.connectionStatus.className = 'connection-status';
    elements.folderSelection?.classList.add('hidden');
    if (elements.folderList) elements.folderList.innerHTML = '';
    elements.customFolderPath.value = '';
    closeFolderPicker();
    updateSelectedFolderPath('/');
    
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    
    const formData = getFormData();
    if (!validateFormData(formData)) return;

    try {
      elements.saveServerBtn.disabled = true;
      elements.saveServerBtn.innerHTML = `${iconSvg('sync', 'loading')}Saving`;
      
      const backgroundUpdated = await saveServer(formData);
      closeModal();
      await loadServers();
      showNotification(
        backgroundUpdated ? 'Saved' : 'Saved. Reload the extension to update the menu.',
        backgroundUpdated ? 'success' : 'warning'
      );
    } catch (error) {
      console.error('Error saving server:', error);
      showNotification('Could not save settings.', 'error');
    } finally {
      elements.saveServerBtn.disabled = false;
      elements.saveServerBtn.innerHTML = `${iconSvg('save')}Save`;
    }
  }

  function getFormData() {
    const id = inputs.editId.value || `server_${Date.now()}_${Math.random().toString(16).substring(2, 8)}`;
    const name = inputs.serverName.value.trim();
    const url = inputs.serverUrl.value.trim();
    const username = inputs.serverUsername.value.trim();
    const password = inputs.serverPassword.value;
    
    // Get folder path from custom input
    let targetFolder = elements.customFolderPath.value.trim() || '/';
    
    // Normalize folder path
    if (!targetFolder.startsWith('/')) targetFolder = '/' + targetFolder;
    if (targetFolder.endsWith('/') && targetFolder.length > 1) {
      targetFolder = targetFolder.slice(0, -1);
    }

    return { id, name, url, username, password, folder: targetFolder };
  }

  function validateFormData(data) {
    if (!data.name || !data.url || !data.username) {
      showNotification('Name, URL, and username are required.', 'error');
      return false;
    }

    if (!data.url.startsWith('http://') && !data.url.startsWith('https://')) {
      showNotification('URL must start with http:// or https://', 'error');
      return false;
    }

    return true;
  }

  async function saveServer(serverData) {
    try {
      // Store all server configuration locally.
      const localData = await chrome.storage.local.get('webdavServers');
      const syncData = await chrome.storage.sync.get('webdavServers');
      
      const servers = localData.webdavServers || syncData.webdavServers || [];
      
      const existingIndex = servers.findIndex(s => s.id === serverData.id);
      if (existingIndex > -1) {
        servers[existingIndex] = serverData;
      } else {
        servers.push(serverData);
      }
      
      await chrome.storage.local.set({ webdavServers: servers });
      await clearLegacySyncServerData();
      return await notifyBackgroundConfigUpdated();
    } catch (error) {
      console.error('Error saving server configuration:', error);
      throw new Error('Failed to save server configuration securely');
    }
  }

  async function testConnection() {
    const config = getConnectionConfig();

    if (!config.url || !config.username) {
      showConnectionStatus('URL and Username are required for testing.', 'error');
      elements.folderSelection?.classList.add('hidden');
      return;
    }

    try {
      if (elements.testConnectionBtn) {
        elements.testConnectionBtn.disabled = true;
        elements.testConnectionBtn.innerHTML = `${iconSvg('sync', 'loading')}Testing`;
      }
      showConnectionStatus('Testing connection...', 'loading');
      elements.folderSelection?.classList.add('hidden');


      const response = await chrome.runtime.sendMessage({
        action: 'testWebdav',
        config
      });

      console.log('Test response from background:', response);

      if (response?.success) {
        showConnectionStatus('Connection ready.', 'success');
        elements.folderSelection?.classList.remove('hidden');
        await openFolderPicker('/', response.folders || ['/']);
      } else {
        showConnectionStatus(`Connection failed: ${response?.error || 'Unknown error'}`, 'error');
        elements.folderSelection?.classList.add('hidden');
        closeFolderPicker();
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      showConnectionStatus(`Error: ${error.message || 'Could not contact background script.'}`, 'error');
      elements.folderSelection?.classList.add('hidden');
      closeFolderPicker();
    } finally {
      if (elements.testConnectionBtn) {
        elements.testConnectionBtn.disabled = false;
        elements.testConnectionBtn.innerHTML = `${iconSvg('link')}Test`;
      }
    }
  }

  function showConnectionStatus(message, type) {
    elements.connectionStatus.className = `connection-status ${type}`;
    elements.connectionStatus.innerHTML = `${iconSvg(getStatusIcon(type))}<span>${escapeHTML(message)}</span>`;
  }

  function getConnectionConfig() {
    return {
      url: inputs.serverUrl.value.trim(),
      username: inputs.serverUsername.value.trim(),
      password: inputs.serverPassword.value
    };
  }

  async function openFolderPicker(startPath = '/', initialFolders = null) {
    const config = getConnectionConfig();
    if (!config.url || !config.username) {
      showNotification('URL and username are required.', 'error');
      return;
    }

    folderPickerState.config = config;
    folderPickerState.currentPath = normalizeFolderPath(startPath);
    folderPickerState.selectedPath = folderPickerState.currentPath;
    elements.folderPickerModal?.classList.remove('hidden');
    updateSelectedFolderPath(folderPickerState.currentPath);

    if (initialFolders) {
      const childFolders = getChildFolders(initialFolders, folderPickerState.currentPath);
      renderFolderPickerList(childFolders.length > 0 ? childFolders : normalizeFolderList(initialFolders));
      return;
    }

    await loadFolderPickerPath(folderPickerState.currentPath);
  }

  function closeFolderPicker() {
    elements.folderPickerModal?.classList.add('hidden');
  }

  async function loadFolderPickerPath(path) {
    if (!elements.folderList || !folderPickerState.config) return;

    const normalizedPath = normalizeFolderPath(path);
    folderPickerState.currentPath = normalizedPath;
    folderPickerState.selectedPath = normalizedPath;
    updateSelectedFolderPath(normalizedPath);
    setFolderPickerLoading(true);

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'listWebdavFolders',
        config: folderPickerState.config,
        folder: normalizedPath
      });

      if (!response?.success) {
        throw new Error(response?.error || 'Could not list folders.');
      }

      renderFolderPickerList(response.folders || []);
    } catch (error) {
      console.error('Error listing folders:', error);
      renderFolderPickerError(error.message || 'Could not list folders.');
    } finally {
      setFolderPickerLoading(false);
    }
  }

  function renderFolderPickerList(folders) {
    if (!elements.folderList) return;

    const normalizedFolders = normalizeFolderList(folders)
      .filter(folder => folder !== folderPickerState.currentPath);
    elements.folderList.innerHTML = '';
    updateSelectedFolderPath(folderPickerState.currentPath);
    updateFolderPickerBackButton();

    if (normalizedFolders.length === 0) {
      elements.folderList.innerHTML = `
        <div class="folder-list-empty">
          ${iconSvg('folder-open')}
          <span>No folders here</span>
        </div>
      `;
      return;
    }

    normalizedFolders.forEach(folder => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'folder-item';
      item.innerHTML = `
        ${iconSvg('folder')}
        <span class="folder-item-text">
          <span class="folder-item-name">${escapeHTML(getFolderName(folder))}</span>
          <span class="folder-item-path">${escapeHTML(folder)}</span>
        </span>
        ${iconSvg('chevron-right', 'folder-selected-icon')}
      `;
      item.addEventListener('click', () => loadFolderPickerPath(folder));
      elements.folderList.appendChild(item);
    });
  }

  function renderFolderPickerError(message) {
    if (!elements.folderList) return;

    elements.folderList.innerHTML = `
      <div class="folder-list-empty">
        ${iconSvg('error')}
        <span>${escapeHTML(message)}</span>
      </div>
    `;
    updateFolderPickerBackButton();
  }

  function setFolderPickerLoading(isLoading) {
    if (!elements.folderList) return;

    elements.folderPickerRefreshBtn.disabled = isLoading;
    elements.folderPickerBackBtn.disabled = isLoading || folderPickerState.currentPath === '/';
    elements.selectFolderBtn.disabled = isLoading;

    if (isLoading) {
      elements.folderList.innerHTML = `
        <div class="folder-list-empty">
          ${iconSvg('sync', 'loading')}
          <span>Loading folders</span>
        </div>
      `;
    }
  }

  function updateFolderPickerBackButton() {
    if (elements.folderPickerBackBtn) {
      elements.folderPickerBackBtn.disabled = folderPickerState.currentPath === '/';
    }
  }

  function openParentFolder() {
    const parentFolder = getParentFolder(folderPickerState.currentPath);
    loadFolderPickerPath(parentFolder);
  }

  function confirmFolderSelection() {
    const selectedPath = normalizeFolderPath(folderPickerState.currentPath);
    elements.customFolderPath.value = selectedPath;
    updateSelectedFolderPath(selectedPath);
    closeFolderPicker();
  }

  function updateFolderSelectionFromInput() {
    const normalizedFolder = normalizeFolderPath(elements.customFolderPath?.value || '/');
    updateSelectedFolderPath(normalizedFolder);
  }

  function updateSelectedFolderPath(folder) {
    if (elements.selectedFolderPath) {
      elements.selectedFolderPath.textContent = normalizeFolderPath(folder);
    }
  }

  function normalizeFolderList(folders) {
    const normalized = (Array.isArray(folders) ? folders : ['/'])
      .map(normalizeFolderPath)
      .filter(Boolean);

    return [...new Set(normalized)];
  }

  function normalizeFolderPath(folder) {
    const rawFolder = String(folder || '/').trim();
    if (!rawFolder || rawFolder === '/') return '/';

    let normalized = rawFolder.startsWith('/') ? rawFolder : `/${rawFolder}`;
    normalized = normalized.replace(/\/+/g, '/');
    if (normalized.endsWith('/') && normalized.length > 1) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  }

  function getChildFolders(folders, parentPath) {
    const normalizedParentPath = normalizeFolderPath(parentPath);

    return normalizeFolderList(folders).filter(folder => {
      if (folder === normalizedParentPath) return false;
      return getParentFolder(folder) === normalizedParentPath;
    });
  }

  function getParentFolder(folder) {
    const normalizedFolder = normalizeFolderPath(folder);
    if (normalizedFolder === '/') return '/';

    const lastSlash = normalizedFolder.lastIndexOf('/');
    return lastSlash <= 0 ? '/' : normalizedFolder.slice(0, lastSlash);
  }

  function getFolderName(folder) {
    const normalizedFolder = normalizeFolderPath(folder);
    if (normalizedFolder === '/') return '/';

    return normalizedFolder.slice(normalizedFolder.lastIndexOf('/') + 1);
  }

  async function loadServers() {
    try {
      // Prefer local storage, fallback to sync only for legacy migration.
      const localData = await chrome.storage.local.get('webdavServers');
      const syncData = await chrome.storage.sync.get('webdavServers');
      
      const servers = localData.webdavServers || syncData.webdavServers || [];

      if (servers.length === 0) {
        showEmptyState();
      } else {
        showServersSection();
        renderServerList(servers);
      }
      
      // Migrate from sync to local if needed
      if (syncData.webdavServers && !localData.webdavServers) {
        console.log('Migrating server data to local storage for better security');
        await chrome.storage.local.set({ webdavServers: servers });
      }

      await clearLegacySyncServerData();
    } catch (error) {
      console.error('Error loading servers:', error);
      showNotification('Could not load server configurations.', 'error');
    }
  }

  function showEmptyState() {
    elements.emptyState?.classList.remove('hidden');
    elements.serversSection?.classList.add('hidden');
  }

  function showServersSection() {
    elements.emptyState?.classList.add('hidden');
    elements.serversSection?.classList.remove('hidden');
  }

  function renderServerList(servers) {
    if (!elements.serverList) return;
    
    elements.serverList.innerHTML = '';
    
    servers.forEach((server, index) => {
      const card = createServerCard(server, index);
      elements.serverList.appendChild(card);
    });
  }

  function createServerCard(server, index) {
    const card = document.createElement('div');
    card.className = 'server-card';
    card.style.animationDelay = `${index * 0.1}s`;
    
    card.innerHTML = `
      <div class="server-card-header">
        <div class="server-card-title">
          ${iconSvg('storage')}
          ${escapeHTML(server.name)}
        </div>
        <div class="server-card-url">${escapeHTML(server.url)}</div>
      </div>
      <div class="server-card-body">
        <div class="server-info">
          <div class="server-info-item">
            ${iconSvg('user')}
            <span class="server-info-label">User:</span>
            <span class="server-info-value">${escapeHTML(server.username)}</span>
          </div>
          <div class="server-info-item">
            ${iconSvg('folder')}
            <span class="server-info-label">Folder:</span>
            <span class="server-info-value">${escapeHTML(server.folder || '/')}</span>
          </div>
        </div>
      </div>
      <div class="server-card-actions">
        <button class="btn btn-secondary btn-sm edit-btn" data-id="${server.id}">
          ${iconSvg('edit')}
        </button>
        <button class="btn btn-danger btn-sm delete-btn" data-id="${server.id}" data-name="${escapeHTML(server.name)}">
          ${iconSvg('trash')}
        </button>
      </div>
    `;

    // Attach event listeners
    const editBtn = card.querySelector('.edit-btn');
    const deleteBtn = card.querySelector('.delete-btn');
    editBtn?.setAttribute('aria-label', `Edit ${server.name}`);
    editBtn?.setAttribute('title', 'Edit');
    deleteBtn?.setAttribute('aria-label', `Delete ${server.name}`);
    deleteBtn?.setAttribute('title', 'Delete');
    
    editBtn?.addEventListener('click', () => openModal(server.id));
    deleteBtn?.addEventListener('click', () => {
      const serverName = deleteBtn.getAttribute('data-name');
      confirmDeleteServer(server.id, serverName);
    });

    return card;
  }

  async function loadServerForEdit(serverId) {
    try {
      const localData = await chrome.storage.local.get('webdavServers');
      const syncData = await chrome.storage.sync.get('webdavServers');
      const servers = localData.webdavServers || syncData.webdavServers || [];
      const server = servers.find(s => s.id === serverId);
      
      if (!server) {
        showNotification('Server not found.', 'error');
        return;
      }

      // Populate form with server data
      inputs.editId.value = server.id;
      inputs.serverName.value = server.name;
      inputs.serverUrl.value = server.url;
      inputs.serverUsername.value = server.username;
      inputs.serverPassword.value = server.password;
      
      // Set the folder path in custom input
      const serverFolder = server.folder || '/';
      elements.customFolderPath.value = serverFolder;
      updateSelectedFolderPath(serverFolder);
      
      // Show folder selection if we have the info
      if (server.folder) {
        elements.folderSelection?.classList.remove('hidden');
      }
    } catch (error) {
      console.error('Error loading server for edit:', error);
      showNotification('Could not load server.', 'error');
    }
  }

  function confirmDeleteServer(serverId, serverName) {
    if (confirm(`Delete "${serverName}"?`)) {
      deleteServer(serverId);
    }
  }

  async function deleteServer(serverId) {
    try {
      const localData = await chrome.storage.local.get('webdavServers');
      const syncData = await chrome.storage.sync.get('webdavServers');
      let servers = localData.webdavServers || syncData.webdavServers || [];
      
      servers = servers.filter(s => s.id !== serverId);
      await chrome.storage.local.set({ webdavServers: servers });
      await clearLegacySyncServerData();
      
      await loadServers();
      const backgroundUpdated = await notifyBackgroundConfigUpdated();
      showNotification(
        backgroundUpdated ? 'Deleted' : 'Deleted. Reload the extension to update the menu.',
        backgroundUpdated ? 'success' : 'warning'
      );
    } catch (error) {
      console.error('Error deleting server:', error);
      showNotification('Could not delete server.', 'error');
    }
  }

  async function clearLegacySyncServerData() {
    try {
      await chrome.storage.sync.remove(['webdavServers', 'webdavServersMetadata']);
    } catch (error) {
      console.warn('Could not clear legacy sync storage:', error);
    }
  }

  async function notifyBackgroundConfigUpdated() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'configUpdated' });
      if (response?.success === false) throw new Error(response.error || 'Background reload failed.');
      return true;
    } catch (error) {
      console.warn('Settings were saved, but the background reload failed:', error);
      return false;
    }
  }

  function showNotification(message, type = 'success') {
    if (!elements.notification) return;
    
    const iconMap = {
      success: 'check-circle',
      error: 'error',
      warning: 'error',
      info: 'info'
    };
    
    elements.notification.className = `notification ${type}`;
    elements.notification.querySelector('.notification-icon').innerHTML = iconSvg(iconMap[type] || 'info');
    elements.notification.querySelector('.notification-message').textContent = message;
    
    elements.notification.classList.remove('hidden');
    
    // Toasts stay brief so saves feel light and non-blocking.
    setTimeout(() => {
      elements.notification.classList.add('hidden');
    }, type === 'success' ? 2200 : 4200);
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  }

  function iconSvg(name, className = '') {
    const extraClass = className ? ` ${className}` : '';
    return `<svg class="ui-icon${extraClass}" aria-hidden="true" focusable="false"><use href="#icon-${name}"></use></svg>`;
  }

  function getStatusIcon(type) {
    if (type === 'success') return 'check-circle';
    if (type === 'error') return 'error';
    if (type === 'loading') return 'sync';
    return 'info';
  }

});
