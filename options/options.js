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
    saveSettingsDialog: document.getElementById('save-settings-dialog'),
    saveSettingsForm: document.getElementById('save-settings-form'),
    imageFormatPreference: document.getElementById('image-format-preference'),
    imageFormatSelect: document.getElementById('image-format-select'),
    imageFormatTrigger: document.getElementById('image-format-trigger'),
    imageFormatValue: document.getElementById('image-format-value'),
    imageFormatOptions: document.getElementById('image-format-options'),
    filenameRule: document.getElementById('filename-rule'),
    filenameRuleSelect: document.getElementById('filename-rule-select'),
    filenameRuleTrigger: document.getElementById('filename-rule-trigger'),
    filenameRuleValue: document.getElementById('filename-rule-value'),
    filenameRuleOptions: document.getElementById('filename-rule-options'),
    filenameTemplateGroup: document.getElementById('filename-template-group'),
    filenameTemplate: document.getElementById('filename-template'),
    filenameTemplateError: document.getElementById('filename-template-error'),
    filenamePreview: document.getElementById('filename-preview'),
    directoryRule: document.getElementById('directory-rule'),
    directoryRuleSelect: document.getElementById('directory-rule-select'),
    directoryRuleTrigger: document.getElementById('directory-rule-trigger'),
    directoryRuleValue: document.getElementById('directory-rule-value'),
    directoryRuleOptions: document.getElementById('directory-rule-options'),
    directoryPreview: document.getElementById('directory-preview'),
    closeSaveSettingsBtn: document.getElementById('close-save-settings-btn'),
    cancelSaveSettingsBtn: document.getElementById('cancel-save-settings-btn'),
    saveSaveSettingsBtn: document.getElementById('save-save-settings-btn'),
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    themeToggleIcon: document.getElementById('theme-toggle-icon'),
    languageToggleBtn: document.getElementById('language-toggle-btn'),
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
  const imageFormatOptionElements = [...document.querySelectorAll('.image-format-option')];
  const filenameRuleOptionElements = [...document.querySelectorAll('.filename-rule-option')];
  const directoryRuleOptionElements = [...document.querySelectorAll('.directory-rule-option')];
  const saveSettingsTabElements = [...document.querySelectorAll('.settings-tab')];
  const filenameVariableElements = [...document.querySelectorAll('.variable-token')];
  const saveSettingsPanelElements = ['format', 'filename', 'directory']
    .map(name => document.getElementById(`settings-panel-${name}`))
    .filter(Boolean);
  const imageFormatLabelKeys = {
    original: 'formatOriginal',
    ask: 'formatAsk',
    png: 'png',
    jpg: 'jpg',
    webp: 'webp'
  };
  const filenameRuleLabelKeys = {
    automatic: 'filenameAutomatic',
    original: 'filenameOriginal',
    custom: 'filenameCustom'
  };
  const directoryRuleLabelKeys = {
    fixed: 'directoryFixed',
    date: 'directoryDate',
    domain: 'directoryDomain',
    'domain-date': 'directoryDomainDate'
  };
  const translations = {
    en: {
      pageTitle: 'WebDAV Image Saver - Settings',
      headerSubtitle: 'WebDAV upload settings',
      saveSettings: 'Save settings',
      saveSettingsSections: 'Save settings sections',
      supportKoFiLabel: 'Support this project on Ko-fi',
      supportKoFiTitle: 'Support on Ko-fi',
      githubLabel: 'Open GitHub repository',
      noServers: 'No servers yet',
      noServersHelp: 'Add a WebDAV endpoint for right-click image saving.',
      add: 'Add',
      servers: 'Servers',
      addServer: 'Add Server',
      editServer: 'Edit Server',
      close: 'Close',
      name: 'Name',
      personalCloud: 'Personal cloud',
      serverUrl: 'Server URL',
      username: 'Username',
      usernamePlaceholder: 'Your username',
      password: 'Password',
      passwordPlaceholder: 'Your password',
      testConnection: 'Test',
      targetFolder: 'Target folder',
      browseFolders: 'Browse folders',
      targetFolderHelp: 'Images are saved to this WebDAV folder.',
      cancel: 'Cancel',
      save: 'Save',
      closeSaveSettings: 'Close save settings',
      imageFormat: 'Image format',
      saveImagesAs: 'Save images as',
      formatOriginal: 'Original',
      formatAsk: 'Ask every time',
      png: 'PNG',
      jpg: 'JPG',
      webp: 'WebP',
      formatHelp: 'Animated or unsupported images are saved in their original format with a warning.',
      fileNamingRule: 'File naming rule',
      filenameAutomatic: 'Automatic',
      filenameOriginal: 'Original filename',
      filenameCustom: 'Custom template',
      filenameRuleHelp: 'Choose a safe default, keep the original file name, or build a descriptive template.',
      filenameTemplate: 'Filename template',
      filenameTemplateHelp: 'Type a template or insert variables below.',
      preview: 'Preview',
      variables: 'Variables — click to insert',
      insertVariable: 'Insert {variable}',
      saveDirectoryRule: 'Save directory rule',
      directoryFixed: 'Fixed directory',
      directoryDate: 'By date',
      directoryDomain: 'By website',
      directoryDomainDate: 'By website and date',
      directoryRuleHelp: 'Rules are relative to the target folder configured on the selected WebDAV server. /Images is only an example, never a fixed path.',
      pathPreview: 'Path preview',
      chooseFolder: 'Choose Folder',
      closeFolderPicker: 'Close folder picker',
      parentFolder: 'Parent folder',
      refreshFolders: 'Refresh folders',
      refresh: 'Refresh',
      select: 'Select',
      switchLanguage: 'Switch language',
      switchToChinese: 'Switch to Chinese',
      switchToEnglish: 'Switch to English',
      switchToLight: 'Switch to light mode',
      switchToDark: 'Switch to dark mode',
      lightMode: 'Light mode',
      darkMode: 'Dark mode',
      loadingSaveSettings: 'Loading Save settings',
      retryLoadingSaveSettings: 'Retry loading Save settings',
      couldNotLoadSaveSettings: 'Could not load Save settings.',
      filenameTemplateEmpty: 'Filename template cannot be empty.',
      filenameTemplateUnbalanced: 'Template variable braces must be balanced.',
      filenameTemplateEmptyVariable: 'Template variable cannot be empty.',
      filenameTemplateNested: 'Template variables cannot be nested.',
      filenamePreviewUnavailable: 'Fix the template to see a preview.',
      filenameTemplateInvalid: 'Filename template is not valid.',
      unsupportedTemplateVariable: 'Unsupported template variable: {variable}.',
      saveSettingsSaved: 'Save settings saved.',
      savedReloadApply: 'Saved. Reload the extension to apply it.',
      couldNotSaveSaveSettings: 'Could not save Save settings.',
      saving: 'Saving',
      saved: 'Saved',
      savedReloadMenu: 'Saved. Reload the extension to update the menu.',
      couldNotSaveSettings: 'Could not save settings.',
      requiredServerFields: 'Name, URL, and username are required.',
      invalidServerUrl: 'URL must start with http:// or https://',
      testingRequiresCredentials: 'URL and Username are required for testing.',
      testing: 'Testing',
      testingConnection: 'Testing connection...',
      connectionReady: 'Connection ready.',
      connectionFailed: 'Connection failed: {error}',
      unknownError: 'Unknown error',
      authenticationFailed: 'Authentication failed. Check username and password.',
      folderNotFound: 'Folder not found. Check the WebDAV URL or folder path.',
      networkRequestFailed: 'Network request failed.',
      unknownConnectionError: 'Unknown connection error',
      serverError: 'Server error: {error}',
      errorMessage: 'Error: {error}',
      backgroundUnavailable: 'Could not contact background script.',
      urlUsernameRequired: 'URL and username are required.',
      couldNotListFolders: 'Could not list folders.',
      folderListError: 'Could not list folders: {error}',
      noFolders: 'No folders here',
      loadingFolders: 'Loading folders',
      couldNotLoadServers: 'Could not load server configurations.',
      userLabel: 'User:',
      folderLabel: 'Folder:',
      editServerLabel: 'Edit {name}',
      edit: 'Edit',
      deleteServerLabel: 'Delete {name}',
      delete: 'Delete',
      serverNotFound: 'Server not found.',
      couldNotLoadServer: 'Could not load server.',
      deleteConfirm: 'Delete "{name}"?',
      deleted: 'Deleted',
      deletedReloadMenu: 'Deleted. Reload the extension to update the menu.',
      couldNotDeleteServer: 'Could not delete server.'
    },
    zh: {
      pageTitle: 'WebDAV Image Saver - 设置',
      headerSubtitle: 'WebDAV 上传设置',
      saveSettings: '保存设置',
      saveSettingsSections: '保存设置分类',
      supportKoFiLabel: '在 Ko-fi 上支持此项目',
      supportKoFiTitle: '支持项目',
      githubLabel: '打开 GitHub 仓库',
      noServers: '暂无服务器',
      noServersHelp: '添加 WebDAV 端点，以便右键保存图片。',
      add: '添加',
      servers: '服务器',
      addServer: '添加服务器',
      editServer: '编辑服务器',
      close: '关闭',
      name: '名称',
      personalCloud: '个人云盘',
      serverUrl: '服务器 URL',
      username: '用户名',
      usernamePlaceholder: '请输入用户名',
      password: '密码',
      passwordPlaceholder: '请输入密码',
      testConnection: '测试连接',
      targetFolder: '目标文件夹',
      browseFolders: '浏览文件夹',
      targetFolderHelp: '图片将保存到此 WebDAV 文件夹。',
      cancel: '取消',
      save: '保存',
      closeSaveSettings: '关闭保存设置',
      imageFormat: '图片格式',
      saveImagesAs: '图片保存为',
      formatOriginal: '原格式',
      formatAsk: '每次询问',
      png: 'PNG',
      jpg: 'JPG',
      webp: 'WebP',
      formatHelp: '动画图片或不支持的图片会以原格式保存，并显示警告。',
      fileNamingRule: '文件命名规则',
      filenameAutomatic: '自动',
      filenameOriginal: '原文件名',
      filenameCustom: '自定义模板',
      filenameRuleHelp: '选择安全的默认规则、保留原文件名，或创建描述性模板。',
      filenameTemplate: '文件名模板',
      filenameTemplateHelp: '输入模板，或插入下方变量。',
      preview: '预览',
      variables: '变量 — 点击插入',
      insertVariable: '插入 {variable}',
      saveDirectoryRule: '保存目录规则',
      directoryFixed: '固定目录',
      directoryDate: '按日期',
      directoryDomain: '按网站',
      directoryDomainDate: '按网站和日期',
      directoryRuleHelp: '规则相对于所选 WebDAV 服务器配置的目标文件夹。/Images 仅为示例，不是固定路径。',
      pathPreview: '路径预览',
      chooseFolder: '选择文件夹',
      closeFolderPicker: '关闭文件夹选择器',
      parentFolder: '上级文件夹',
      refreshFolders: '刷新文件夹',
      refresh: '刷新',
      select: '选择',
      switchLanguage: '中英文切换',
      switchToChinese: '切换到中文',
      switchToEnglish: '切换到英文',
      switchToLight: '切换到浅色模式',
      switchToDark: '切换到深色模式',
      lightMode: '浅色模式',
      darkMode: '深色模式',
      loadingSaveSettings: '正在加载保存设置',
      retryLoadingSaveSettings: '重试加载保存设置',
      couldNotLoadSaveSettings: '无法加载保存设置。',
      filenameTemplateEmpty: '文件名模板不能为空。',
      filenameTemplateUnbalanced: '模板变量的花括号必须成对。',
      filenameTemplateEmptyVariable: '模板变量不能为空。',
      filenameTemplateNested: '模板变量不能嵌套。',
      filenamePreviewUnavailable: '请修正规则后查看预览。',
      filenameTemplateInvalid: '文件名模板规则不正确。',
      unsupportedTemplateVariable: '不支持的模板变量：{variable}。',
      saveSettingsSaved: '保存设置已保存。',
      savedReloadApply: '已保存。请重新加载扩展以应用更改。',
      couldNotSaveSaveSettings: '无法保存保存设置。',
      saving: '正在保存',
      saved: '已保存',
      savedReloadMenu: '已保存。请重新加载扩展以更新菜单。',
      couldNotSaveSettings: '无法保存设置。',
      requiredServerFields: '名称、URL 和用户名为必填项。',
      invalidServerUrl: 'URL 必须以 http:// 或 https:// 开头',
      testingRequiresCredentials: '测试需要填写 URL 和用户名。',
      testing: '正在测试',
      testingConnection: '正在测试连接……',
      connectionReady: '连接成功，可以使用。',
      connectionFailed: '连接失败：{error}',
      unknownError: '未知错误',
      authenticationFailed: '身份验证失败，请检查用户名和密码。',
      folderNotFound: '未找到文件夹，请检查 WebDAV URL 或文件夹路径。',
      networkRequestFailed: '网络请求失败。',
      unknownConnectionError: '未知连接错误',
      serverError: '服务器错误：{error}',
      errorMessage: '错误：{error}',
      backgroundUnavailable: '无法联系后台脚本。',
      urlUsernameRequired: 'URL 和用户名为必填项。',
      couldNotListFolders: '无法列出文件夹。',
      folderListError: '无法列出文件夹：{error}',
      noFolders: '此处没有文件夹',
      loadingFolders: '正在加载文件夹',
      couldNotLoadServers: '无法加载服务器配置。',
      userLabel: '用户：',
      folderLabel: '文件夹：',
      editServerLabel: '编辑 {name}',
      edit: '编辑',
      deleteServerLabel: '删除 {name}',
      delete: '删除',
      serverNotFound: '未找到服务器。',
      couldNotLoadServer: '无法加载服务器。',
      deleteConfirm: '确定删除“{name}”吗？',
      deleted: '已删除',
      deletedReloadMenu: '已删除。请重新加载扩展以更新菜单。',
      couldNotDeleteServer: '无法删除服务器。'
    }
  };
  const currentSettingsSchemaVersion = Number.isInteger(AppSettings.SETTINGS_SCHEMA_VERSION)
    ? AppSettings.SETTINGS_SCHEMA_VERSION
    : 2;
  let persistedSaveSettings = {
    schemaVersion: currentSettingsSchemaVersion,
    image: { saveFormat: 'original' },
    filename: {
      rule: 'automatic',
      customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE
    },
    directory: { rule: 'fixed' }
  };
  let saveSettingsReady = false;
  let saveSettingsLoading = false;
  let saveSettingsRevision = 0;
  let isSaving = false;
  let saveSettingsOpener = null;
  let saveSettingsLoadFailed = false;
  let activeSaveSettingsTab = 'format';
  let currentLanguage = localStorage.getItem('language') === 'zh' ? 'zh' : 'en';
  let renderedServers = [];
  let connectionStatusState = null;
  let folderPickerViewState = null;
  let notificationState = null;
  const dirtySaveSettingsFields = new Set();

  // Initialize the app
  init();

  async function init() {
    initializeSaveSettingsTabs();
    applyLanguage(currentLanguage);
    initTheme();
    attachEventListeners();
    setSaveSettingsButtonState({ disabled: true, title: t('loadingSaveSettings') });
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
    elements.filenameRuleTrigger?.addEventListener('click', () => toggleRuleSelect('filename'));
    elements.filenameRuleTrigger?.addEventListener('keydown', event => handleRuleTriggerKeydown('filename', event));
    filenameRuleOptionElements.forEach((option, index) => {
      option.addEventListener('click', () => selectRuleValue('filename', option.dataset.value));
      option.addEventListener('keydown', event => handleRuleOptionKeydown('filename', event, index));
    });
    elements.directoryRuleTrigger?.addEventListener('click', () => toggleRuleSelect('directory'));
    elements.directoryRuleTrigger?.addEventListener('keydown', event => handleRuleTriggerKeydown('directory', event));
    directoryRuleOptionElements.forEach((option, index) => {
      option.addEventListener('click', () => selectRuleValue('directory', option.dataset.value));
      option.addEventListener('keydown', event => handleRuleOptionKeydown('directory', event, index));
    });
    saveSettingsTabElements.forEach((tab, index) => {
      tab.addEventListener('click', () => activateSaveSettingsTab(getSaveSettingsTabName(tab), { focus: true }));
      tab.addEventListener('keydown', event => handleSaveSettingsTabKeydown(event, index));
    });
    filenameVariableElements.forEach(token => {
      token.addEventListener('click', () => insertFilenameVariable(token.dataset.variable));
    });
    elements.filenameRule?.addEventListener('change', () => {
      dirtySaveSettingsFields.add('filename.rule');
      setRuleSelectValue('filename', elements.filenameRule?.value);
      updateFilenameRuleEditor();
    });
    elements.filenameTemplate?.addEventListener('input', handleFilenameTemplateInput);
    elements.directoryRule?.addEventListener('change', () => {
      dirtySaveSettingsFields.add('directory.rule');
      setRuleSelectValue('directory', elements.directoryRule?.value);
      updateDirectoryPreview();
    });
    elements.closeSaveSettingsBtn?.addEventListener('click', closeSaveSettingsModal);
    elements.cancelSaveSettingsBtn?.addEventListener('click', closeSaveSettingsModal);
    elements.saveSettingsModal?.addEventListener('click', event => {
      if (event.target === elements.saveSettingsModal) closeSaveSettingsModal();
    });
    elements.themeToggleBtn?.addEventListener('click', toggleTheme);
    elements.languageToggleBtn?.addEventListener('click', toggleLanguage);
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
      if (isRuleSelectOpen('filename') && !elements.filenameRuleSelect?.contains(event.target)) {
        closeRuleSelect('filename');
      }
      if (isRuleSelectOpen('directory') && !elements.directoryRuleSelect?.contains(event.target)) {
        closeRuleSelect('directory');
      }
    });


    // ESC key to close modal
    document.addEventListener('keydown', (e) => {
      const saveSettingsVisible = !elements.saveSettingsModal?.classList.contains('hidden');
      if (saveSettingsVisible) {
        if (e.key === 'Escape' && isAnySaveSettingsSelectOpen()) {
          e.preventDefault();
          closeOpenSaveSettingsSelect({ restoreFocus: true });
          return;
        }
        if (isSaving) {
          if (e.key === 'Escape') e.preventDefault();
          return;
        }
        if (e.key === 'Tab') {
          trapSaveSettingsTab(e);
          return;
        }
        if (e.key === 'Escape') {
          closeSaveSettingsModal();
          return;
        }
      }

      if (e.key !== 'Escape') return;

      if (isAnySaveSettingsSelectOpen()) {
        closeOpenSaveSettingsSelect({ restoreFocus: true });
      } else if (!elements.folderPickerModal?.classList.contains('hidden')) {
        closeFolderPicker();
      } else if (!elements.modal?.classList.contains('hidden')) {
        closeModal();
      }
    });
  }

  function t(key, replacements = {}) {
    const template = translations[currentLanguage]?.[key] ?? translations.en[key] ?? key;
    return String(template).replace(/\{([a-zA-Z]+)\}/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(replacements, name) ? String(replacements[name]) : match
    );
  }

  function localizedMessage(key, replacements = {}) {
    return { key, replacements };
  }

  function resolveLocalizedMessage(message) {
    if (!message || typeof message !== 'object' || typeof message.key !== 'string') {
      return String(message ?? '');
    }
    const replacements = Object.fromEntries(
      Object.entries(message.replacements || {}).map(([name, value]) => [name, resolveLocalizedMessage(value)])
    );
    return t(message.key, replacements);
  }

  function localizeWebdavError(message) {
    const error = String(message || '').trim();
    const knownErrors = {
      'Authentication failed. Check username and password.': 'authenticationFailed',
      'Folder not found. Check the WebDAV URL or folder path.': 'folderNotFound',
      'Failed to fetch': 'networkRequestFailed',
      'NetworkError when attempting to fetch resource.': 'networkRequestFailed',
      'Unknown connection error': 'unknownConnectionError'
    };
    if (knownErrors[error]) return localizedMessage(knownErrors[error]);
    const serverError = /^Server error:\s*(.+)$/s.exec(error);
    if (serverError) return localizedMessage('serverError', { error: serverError[1] });
    return error;
  }

  function applyLanguage(language) {
    currentLanguage = language === 'zh' ? 'zh' : 'en';
    document.documentElement.lang = currentLanguage === 'zh' ? 'zh-CN' : 'en';
    document.documentElement.dataset.language = currentLanguage;
    document.title = t('pageTitle');

    document.querySelectorAll('[data-i18n]').forEach(element => {
      const value = translations[currentLanguage]?.[element.dataset.i18n];
      if (value !== undefined) element.textContent = value;
    });
    applyTranslatedAttribute('placeholder');
    applyTranslatedAttribute('aria-label');
    applyTranslatedAttribute('title');

    if (elements.languageToggleBtn) {
      elements.languageToggleBtn.setAttribute(
        'aria-label',
        t(currentLanguage === 'zh' ? 'switchToEnglish' : 'switchToChinese')
      );
      elements.languageToggleBtn.setAttribute('title', t('switchLanguage'));
    }
    filenameVariableElements.forEach(token => {
      const variable = `{${token.dataset.variable || ''}}`;
      token.setAttribute('aria-label', t('insertVariable', { variable }));
      token.setAttribute('title', t('insertVariable', { variable }));
    });

    setImageFormatControl(elements.imageFormatPreference?.value || 'original');
    setRuleSelectValue('filename', elements.filenameRule?.value || 'automatic');
    setRuleSelectValue('directory', elements.directoryRule?.value || 'fixed');
    updateThemeToggle(getCurrentTheme());
    refreshSaveSettingsButtonCopy();
    if (elements.filenameTemplate?.getAttribute('aria-invalid') === 'true') updateFilenameRuleEditor();
    if (!elements.modal?.classList.contains('hidden')) updateServerModalTitle();
    if (renderedServers.length > 0) renderServerList(renderedServers);
    renderConnectionStatusState();
    rerenderFolderPickerView();
    if (!elements.notification?.classList.contains('hidden')) renderNotificationState();
  }

  function applyTranslatedAttribute(attribute) {
    document.querySelectorAll(`[data-i18n-${attribute}]`).forEach(element => {
      const key = element.getAttribute(`data-i18n-${attribute}`);
      if (key && translations[currentLanguage]?.[key] !== undefined) {
        element.setAttribute(attribute, t(key));
      }
    });
  }

  function toggleLanguage() {
    const nextLanguage = currentLanguage === 'en' ? 'zh' : 'en';
    localStorage.setItem('language', nextLanguage);
    applyLanguage(nextLanguage);
  }

  function getCurrentTheme() {
    return document.documentElement.dataset.theme ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }

  function refreshSaveSettingsButtonCopy() {
    if (saveSettingsLoading) {
      setSaveSettingsButtonState({ disabled: true, title: t('loadingSaveSettings') });
    } else if (saveSettingsLoadFailed) {
      setSaveSettingsButtonState({
        disabled: false,
        title: t('retryLoadingSaveSettings'),
        label: t('retryLoadingSaveSettings')
      });
    } else {
      setSaveSettingsButtonState({ disabled: !saveSettingsReady, title: t('saveSettings') });
    }
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
    const currentTheme = getCurrentTheme();
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem('theme', nextTheme);
    updateThemeToggle(nextTheme);
  }

  function updateThemeToggle(theme) {
    if (!elements.themeToggleIcon || !elements.themeToggleBtn) return;

    const isDark = theme === 'dark';
    elements.themeToggleIcon.querySelector('use')?.setAttribute('href', isDark ? '#icon-sun' : '#icon-moon');
    elements.themeToggleBtn.setAttribute('aria-label', isDark ? t('switchToLight') : t('switchToDark'));
    elements.themeToggleBtn.setAttribute('title', isDark ? t('lightMode') : t('darkMode'));
  }

  function copySaveSettings(settings) {
    const source = settings && typeof settings === 'object' ? settings : {};
    const sourceImage = source.image && typeof source.image === 'object' ? source.image : {};
    const sourceFilename = source.filename && typeof source.filename === 'object' ? source.filename : {};
    const sourceDirectory = source.directory && typeof source.directory === 'object' ? source.directory : {};
    return {
      ...source,
      schemaVersion: Number.isInteger(source.schemaVersion) && source.schemaVersion > 0
        ? source.schemaVersion
        : currentSettingsSchemaVersion,
      image: {
        ...sourceImage,
        saveFormat: Object.prototype.hasOwnProperty.call(sourceImage, 'saveFormat')
          ? sourceImage.saveFormat
          : 'original'
      },
      filename: {
        ...sourceFilename,
        rule: Object.prototype.hasOwnProperty.call(sourceFilename, 'rule')
          ? sourceFilename.rule
          : 'automatic',
        customTemplate: Object.prototype.hasOwnProperty.call(sourceFilename, 'customTemplate')
          ? sourceFilename.customTemplate
          : FilenameRule.DEFAULT_CUSTOM_TEMPLATE
      },
      directory: {
        ...sourceDirectory,
        rule: Object.prototype.hasOwnProperty.call(sourceDirectory, 'rule')
          ? sourceDirectory.rule
          : 'fixed'
      }
    };
  }

  function setSaveSettingsButtonState({ disabled, title, label = title } = {}) {
    if (!elements.saveSettingsBtn) return;
    elements.saveSettingsBtn.disabled = Boolean(disabled);
    if (title) elements.saveSettingsBtn.setAttribute('title', title);
    if (label) elements.saveSettingsBtn.setAttribute('aria-label', label);
  }

  function getSaveSettingsTabName(tab) {
    return tab?.dataset.settingsTab || String(tab?.id || '').replace('settings-tab-', '');
  }

  function initializeSaveSettingsTabs() {
    saveSettingsTabElements.forEach(tab => {
      const name = getSaveSettingsTabName(tab);
      const panel = document.getElementById(`settings-panel-${name}`);
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', `settings-panel-${name}`);
      panel?.setAttribute('role', 'tabpanel');
      panel?.setAttribute('aria-labelledby', tab.id);
    });
    activateSaveSettingsTab(activeSaveSettingsTab);
  }

  function activateSaveSettingsTab(name, { focus = false } = {}) {
    if (isSaving) return;
    const target = saveSettingsTabElements.find(tab => getSaveSettingsTabName(tab) === name) || saveSettingsTabElements[0];
    if (!target) return;
    activeSaveSettingsTab = getSaveSettingsTabName(target);
    if (activeSaveSettingsTab !== 'format') closeImageFormatSelect();
    if (activeSaveSettingsTab !== 'filename') closeRuleSelect('filename');
    if (activeSaveSettingsTab !== 'directory') closeRuleSelect('directory');

    saveSettingsTabElements.forEach(tab => {
      const selected = tab === target;
      tab.setAttribute('aria-selected', String(selected));
      tab.setAttribute('tabindex', selected ? '0' : '-1');
      tab.tabIndex = selected ? 0 : -1;
    });
    saveSettingsPanelElements.forEach(panel => {
      const selected = panel.id === `settings-panel-${activeSaveSettingsTab}`;
      panel.toggleAttribute('hidden', !selected);
      panel.setAttribute('aria-hidden', String(!selected));
    });
    if (focus) target.focus();
  }

  function handleSaveSettingsTabKeydown(event, index) {
    if (isSaving || saveSettingsTabElements.length === 0) return;
    let targetIndex = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      targetIndex = (index + 1) % saveSettingsTabElements.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      targetIndex = (index - 1 + saveSettingsTabElements.length) % saveSettingsTabElements.length;
    } else if (event.key === 'Home') {
      targetIndex = 0;
    } else if (event.key === 'End') {
      targetIndex = saveSettingsTabElements.length - 1;
    } else if (event.key === 'Enter' || event.key === ' ') {
      targetIndex = index;
    }
    if (targetIndex === null) return;
    event.preventDefault();
    activateSaveSettingsTab(getSaveSettingsTabName(saveSettingsTabElements[targetIndex]), { focus: true });
  }

  async function loadSaveSettings({ openWhenReady = false, opener = null } = {}) {
    const loadRevision = ++saveSettingsRevision;
    saveSettingsLoading = true;
    saveSettingsLoadFailed = false;
    setSaveSettingsButtonState({ disabled: true, title: t('loadingSaveSettings') });
    try {
      const settings = await AppSettings.loadSettings(chrome.storage.local);
      if (loadRevision !== saveSettingsRevision) return false;
      persistedSaveSettings = copySaveSettings(settings);
      saveSettingsReady = true;
      saveSettingsLoading = false;
      saveSettingsLoadFailed = false;
      setSaveSettingsButtonState({ disabled: false, title: t('saveSettings') });
      restoreSaveSettingsControls();
      if (openWhenReady) openSaveSettingsModal({ opener });
      return true;
    } catch (error) {
      if (loadRevision !== saveSettingsRevision) return false;
      saveSettingsReady = false;
      saveSettingsLoading = false;
      saveSettingsLoadFailed = true;
      setSaveSettingsButtonState({
        disabled: false,
        title: t('retryLoadingSaveSettings'),
        label: t('retryLoadingSaveSettings')
      });
      console.error('Error loading save settings:', error);
      showNotification(localizedMessage('couldNotLoadSaveSettings'), 'error');
      return false;
    }
  }

  function openSaveSettingsModal({ opener = document.activeElement } = {}) {
    if (isSaving || saveSettingsLoading) return;
    if (!saveSettingsReady) {
      loadSaveSettings({ openWhenReady: true, opener });
      return;
    }
    saveSettingsOpener = opener || elements.saveSettingsBtn;
    restoreSaveSettingsControls();
    activateSaveSettingsTab(activeSaveSettingsTab);
    elements.saveSettingsModal?.classList.remove('hidden');
    saveSettingsTabElements
      .find(tab => getSaveSettingsTabName(tab) === activeSaveSettingsTab)
      ?.focus();
  }

  function closeSaveSettingsModal() {
    if (isSaving) return;
    closeOpenSaveSettingsSelect();
    elements.saveSettingsModal?.classList.add('hidden');
    restoreSaveSettingsControls();
    const opener = saveSettingsOpener || elements.saveSettingsBtn;
    saveSettingsOpener = null;
    opener?.focus();
  }

  function getSaveSettingsFocusableElements() {
    const candidates = [...(elements.saveSettingsModal?.querySelectorAll('button, input, select, [tabindex]') || [])];
    return candidates.filter(control => {
      if (control.disabled ||
        control === elements.imageFormatPreference ||
        control === elements.filenameRule ||
        control === elements.directoryRule) return false;
      if (elements.filenameTemplateGroup?.hasAttribute('hidden') && elements.filenameTemplateGroup.contains(control)) return false;
      if (elements.imageFormatOptions?.classList.contains('hidden') && elements.imageFormatOptions.contains(control)) return false;
      if (elements.filenameRuleOptions?.classList.contains('hidden') && elements.filenameRuleOptions.contains(control)) return false;
      if (elements.directoryRuleOptions?.classList.contains('hidden') && elements.directoryRuleOptions.contains(control)) return false;
      if (saveSettingsPanelElements.some(panel => panel.hasAttribute('hidden') && panel.contains(control))) return false;
      return true;
    });
  }

  function trapSaveSettingsTab(event) {
    const focusable = getSaveSettingsFocusableElements();
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function setSaveSettingsBusy(saving) {
    const controls = [
      elements.saveSaveSettingsBtn,
      elements.cancelSaveSettingsBtn,
      elements.closeSaveSettingsBtn,
      elements.imageFormatTrigger,
      elements.filenameRuleTrigger,
      elements.directoryRuleTrigger,
      elements.filenameRule,
      elements.filenameTemplate,
      elements.directoryRule,
      ...imageFormatOptionElements,
      ...filenameRuleOptionElements,
      ...directoryRuleOptionElements,
      ...saveSettingsTabElements,
      ...filenameVariableElements
    ];
    elements.saveSettingsDialog?.setAttribute('aria-busy', String(saving));
    elements.saveSettingsModal?.setAttribute('aria-busy', String(saving));
    elements.saveSettingsForm?.setAttribute('aria-busy', String(saving));
    if (saving) closeOpenSaveSettingsSelect();
    controls.forEach(control => {
      if (control) control.disabled = saving;
    });
    if (!saving) updateFilenameRuleEditor();
  }

  function restoreSaveSettingsControls() {
    dirtySaveSettingsFields.clear();
    setImageFormatControl(persistedSaveSettings.image.saveFormat);
    if (elements.filenameRule) {
      setRuleSelectValue('filename', persistedSaveSettings.filename.rule);
    }
    if (elements.filenameTemplate) {
      elements.filenameTemplate.value = String(persistedSaveSettings.filename.customTemplate ?? '');
    }
    if (elements.directoryRule) {
      setRuleSelectValue('directory', persistedSaveSettings.directory.rule);
    }
    updateFilenameRuleEditor();
    updateDirectoryPreview();
  }

  function setImageFormatControl(value) {
    const normalizedValue = ImageFormat.normalizeFormatPreference(value);
    if (elements.imageFormatPreference) elements.imageFormatPreference.value = normalizedValue;
    if (elements.imageFormatValue) elements.imageFormatValue.textContent = t(imageFormatLabelKeys[normalizedValue]);

    imageFormatOptionElements.forEach(option => {
      const isSelected = option.dataset.value === normalizedValue;
      option.setAttribute('aria-selected', String(isSelected));
      option.classList.toggle('selected', isSelected);
    });
  }

  function getRuleSelectConfig(name) {
    if (name === 'filename') {
      return {
        input: elements.filenameRule,
        select: elements.filenameRuleSelect,
        trigger: elements.filenameRuleTrigger,
        valueElement: elements.filenameRuleValue,
        optionsElement: elements.filenameRuleOptions,
        optionElements: filenameRuleOptionElements,
        labelKeys: filenameRuleLabelKeys,
        normalize: FilenameRule.normalizeFilenameRule,
        dirtyField: 'filename.rule',
        afterSelect: updateFilenameRuleEditor
      };
    }
    if (name === 'directory') {
      return {
        input: elements.directoryRule,
        select: elements.directoryRuleSelect,
        trigger: elements.directoryRuleTrigger,
        valueElement: elements.directoryRuleValue,
        optionsElement: elements.directoryRuleOptions,
        optionElements: directoryRuleOptionElements,
        labelKeys: directoryRuleLabelKeys,
        normalize: DirectoryRule.normalizeDirectoryRule,
        dirtyField: 'directory.rule',
        afterSelect: updateDirectoryPreview
      };
    }
    return null;
  }

  function setRuleSelectValue(name, value) {
    const config = getRuleSelectConfig(name);
    if (!config) return '';
    const normalizedValue = config.normalize(value);
    if (config.input) config.input.value = normalizedValue;
    if (config.valueElement) config.valueElement.textContent = t(config.labelKeys[normalizedValue]);

    config.optionElements.forEach(option => {
      const isSelected = option.dataset.value === normalizedValue;
      option.setAttribute('aria-selected', String(isSelected));
      option.classList.toggle('selected', isSelected);
    });
    return normalizedValue;
  }

  function isRuleSelectOpen(name) {
    return getRuleSelectConfig(name)?.trigger?.getAttribute('aria-expanded') === 'true';
  }

  function isAnySaveSettingsSelectOpen() {
    return isImageFormatSelectOpen() || isRuleSelectOpen('filename') || isRuleSelectOpen('directory');
  }

  function closeOpenSaveSettingsSelect({ restoreFocus = false } = {}) {
    if (isImageFormatSelectOpen()) closeImageFormatSelect({ restoreFocus });
    if (isRuleSelectOpen('filename')) closeRuleSelect('filename', { restoreFocus });
    if (isRuleSelectOpen('directory')) closeRuleSelect('directory', { restoreFocus });
  }

  function openRuleSelect(name, { focusSelected = false } = {}) {
    const config = getRuleSelectConfig(name);
    if (!config || !config.select || !config.optionsElement || !config.trigger) return;
    closeImageFormatSelect();
    if (name !== 'filename') closeRuleSelect('filename');
    if (name !== 'directory') closeRuleSelect('directory');

    config.select.classList.add('is-open');
    config.optionsElement.classList.remove('hidden');
    config.trigger.setAttribute('aria-expanded', 'true');

    if (focusSelected) {
      const selectedOption = config.optionElements.find(option => option.getAttribute('aria-selected') === 'true');
      (selectedOption || config.optionElements[0])?.focus();
    }
  }

  function closeRuleSelect(name, { restoreFocus = false } = {}) {
    const config = getRuleSelectConfig(name);
    if (!config) return;
    config.select?.classList.remove('is-open');
    config.optionsElement?.classList.add('hidden');
    config.trigger?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) config.trigger?.focus();
  }

  function toggleRuleSelect(name) {
    if (isSaving) return;
    if (isRuleSelectOpen(name)) {
      closeRuleSelect(name);
    } else {
      openRuleSelect(name);
    }
  }

  function selectRuleValue(name, value) {
    const config = getRuleSelectConfig(name);
    if (isSaving || !config) return;
    dirtySaveSettingsFields.add(config.dirtyField);
    setRuleSelectValue(name, value);
    closeRuleSelect(name, { restoreFocus: true });
    config.afterSelect();
  }

  function handleRuleTriggerKeydown(name, event) {
    if (isSaving) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openRuleSelect(name, { focusSelected: true });
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleRuleSelect(name);
    }
  }

  function handleRuleOptionKeydown(name, event, index) {
    if (isSaving) return;
    const config = getRuleSelectConfig(name);
    if (!config) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const offset = event.key === 'ArrowDown' ? 1 : -1;
      config.optionElements[(index + offset + config.optionElements.length) % config.optionElements.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const targetIndex = event.key === 'Home' ? 0 : config.optionElements.length - 1;
      config.optionElements[targetIndex]?.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectRuleValue(name, config.optionElements[index]?.dataset.value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeRuleSelect(name, { restoreFocus: true });
    } else if (event.key === 'Tab') {
      closeRuleSelect(name);
    }
  }

  function isImageFormatSelectOpen() {
    return elements.imageFormatTrigger?.getAttribute('aria-expanded') === 'true';
  }

  function openImageFormatSelect({ focusSelected = false } = {}) {
    closeRuleSelect('filename');
    closeRuleSelect('directory');
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
    if (isSaving) return;
    if (isImageFormatSelectOpen()) {
      closeImageFormatSelect();
    } else {
      openImageFormatSelect();
    }
  }

  function selectImageFormat(value) {
    if (isSaving) return;
    dirtySaveSettingsFields.add('image.saveFormat');
    setImageFormatControl(value);
    closeImageFormatSelect({ restoreFocus: true });
  }

  function handleImageFormatTriggerKeydown(event) {
    if (isSaving) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openImageFormatSelect({ focusSelected: true });
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleImageFormatSelect();
    }
  }

  function handleImageFormatOptionKeydown(event, index) {
    if (isSaving) return;
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
    const filenameRule = FilenameRule.normalizeFilenameRule(elements.filenameRule?.value);
    const isCustom = filenameRule === 'custom';
    elements.filenameTemplateGroup?.toggleAttribute('hidden', !isCustom);
    elements.filenameTemplateGroup?.classList.toggle('hidden', !isCustom);
    const template = elements.filenameTemplate?.value || '';
    const validation = localizeFilenameValidation(FilenameRule.validateTemplate(template.trim()));
    const filenameControlsUntouched = !dirtySaveSettingsFields.has('filename.rule') &&
      !dirtySaveSettingsFields.has('filename.customTemplate');
    const preservesFutureFilenameValues = persistedSaveSettings.schemaVersion > currentSettingsSchemaVersion &&
      filenameControlsUntouched &&
      filenameRule === FilenameRule.normalizeFilenameRule(persistedSaveSettings.filename.rule) &&
      template === String(persistedSaveSettings.filename.customTemplate ?? '');
    const effectiveValidation = isCustom && preservesFutureFilenameValues
      ? { valid: true, error: '' }
      : validation;
    const invalid = isCustom && !effectiveValidation.valid;

    if (elements.filenameTemplate) {
      elements.filenameTemplate.setAttribute('aria-invalid', String(invalid));
      elements.filenameTemplate.classList.toggle('is-invalid', invalid);
    }
    elements.filenameTemplateGroup?.classList.toggle('has-error', invalid);
    if (elements.filenameTemplateError) {
      elements.filenameTemplateError.textContent = invalid ? effectiveValidation.error : '';
      elements.filenameTemplateError.classList.toggle('hidden', !invalid);
    }
    if (elements.saveSaveSettingsBtn && !isSaving) elements.saveSaveSettingsBtn.disabled = invalid;
    updateFilenamePreview({ invalid });
    return effectiveValidation;
  }

  function localizeFilenameValidation(validation) {
    if (validation.valid) return validation;
    if (validation.error === 'Template cannot be empty.') {
      return { valid: false, error: t('filenameTemplateEmpty') };
    }
    const messageKeys = {
      'Template variable braces must be balanced.': 'filenameTemplateUnbalanced',
      'Template variable cannot be empty.': 'filenameTemplateEmptyVariable',
      'Template variables cannot be nested.': 'filenameTemplateNested'
    };
    if (messageKeys[validation.error]) {
      return { valid: false, error: t(messageKeys[validation.error]) };
    }
    const unsupportedVariable = /^Unsupported template variable: (.*)\.$/s.exec(validation.error);
    if (unsupportedVariable) {
      return {
        valid: false,
        error: t('unsupportedTemplateVariable', { variable: unsupportedVariable[1] })
      };
    }
    return { valid: false, error: t('filenameTemplateInvalid') };
  }

  function handleFilenameTemplateInput() {
    dirtySaveSettingsFields.add('filename.customTemplate');
    updateFilenameRuleEditor();
  }

  function insertFilenameVariable(variable) {
    if (isSaving || !FilenameRule.TEMPLATE_VARIABLES.includes(variable) || !elements.filenameTemplate) return;
    const input = elements.filenameTemplate;
    const token = `{${variable}}`;
    const start = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
    const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : start;
    input.value = `${input.value.slice(0, start)}${token}${input.value.slice(end)}`;
    const caret = start + token.length;
    handleFilenameTemplateInput();
    input.focus();
    input.setSelectionRange?.(caret, caret);
  }

  function updateFilenamePreview({ invalid = false } = {}) {
    if (!elements.filenamePreview) return;
    elements.filenamePreview.classList.toggle('is-invalid', invalid);
    if (invalid) {
      elements.filenamePreview.textContent = t('filenamePreviewUnavailable');
      return;
    }
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

  function updateDirectoryPreview() {
    if (!elements.directoryPreview) return;
    const preview = DirectoryRule.resolveDirectory({
      rule: DirectoryRule.normalizeDirectoryRule(elements.directoryRule?.value),
      rootFolder: '/Images',
      pageUrl: 'https://www.example.com/article',
      now: new Date(2026, 7, 20, 14, 35, 9)
    });
    elements.directoryPreview.textContent = preview.folder;
  }

  async function saveSaveSettings(event) {
    event.preventDefault();
    if (isSaving || !saveSettingsReady) return;
    const filenameValidation = updateFilenameRuleEditor();
    const filenameRule = FilenameRule.normalizeFilenameRule(elements.filenameRule?.value);
    if (filenameRule === 'custom' && !filenameValidation.valid) {
      elements.filenameTemplate?.focus();
      return;
    }

    const selectedPreference = ImageFormat.normalizeFormatPreference(elements.imageFormatPreference?.value);
    const customTemplate = (elements.filenameTemplate?.value || '').trim() || FilenameRule.DEFAULT_CUSTOM_TEMPLATE;
    const directoryRule = DirectoryRule.normalizeDirectoryRule(elements.directoryRule?.value);
    const completeUpdate = {
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
    };
    const isFutureSchema = persistedSaveSettings.schemaVersion > currentSettingsSchemaVersion;
    const settingsUpdate = isFutureSchema
      ? buildDirtySaveSettingsUpdate(completeUpdate)
      : completeUpdate;

    try {
      isSaving = true;
      ++saveSettingsRevision;
      setSaveSettingsBusy(true);
      const settings = await AppSettings.updateSettings(chrome.storage.local, settingsUpdate);
      persistedSaveSettings = copySaveSettings(settings);
      isSaving = false;
      setSaveSettingsBusy(false);
      closeSaveSettingsModal();
      const backgroundUpdated = await notifyBackgroundConfigUpdated();
      showNotification(
        localizedMessage(backgroundUpdated ? 'saveSettingsSaved' : 'savedReloadApply'),
        backgroundUpdated ? 'success' : 'warning'
      );
    } catch (error) {
      isSaving = false;
      setSaveSettingsBusy(false);
      console.error('Error saving Save settings:', error);
      showNotification(localizedMessage('couldNotSaveSaveSettings'), 'error');
    }
  }

  function buildDirtySaveSettingsUpdate(completeUpdate) {
    const update = {};
    if (dirtySaveSettingsFields.has('image.saveFormat')) {
      update.image = { saveFormat: completeUpdate.image.saveFormat };
    }

    const filenameUpdate = {};
    if (dirtySaveSettingsFields.has('filename.rule')) {
      filenameUpdate.rule = completeUpdate.filename.rule;
    }
    if (dirtySaveSettingsFields.has('filename.customTemplate')) {
      filenameUpdate.customTemplate = completeUpdate.filename.customTemplate;
    }
    if (Object.keys(filenameUpdate).length > 0) update.filename = filenameUpdate;

    if (dirtySaveSettingsFields.has('directory.rule')) {
      update.directory = { rule: completeUpdate.directory.rule };
    }
    return update;
  }

  function openModal(serverId = null) {
    if (serverId) {
      loadServerForEdit(serverId);
    } else {
      resetForm();
    }
    if (inputs.editId && serverId) inputs.editId.value = serverId;
    updateServerModalTitle();
    
    elements.modal?.classList.remove('hidden');
    inputs.serverName?.focus();
  }

  function updateServerModalTitle() {
    if (elements.modalTitle) elements.modalTitle.textContent = t(inputs.editId?.value ? 'editServer' : 'addServer');
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
    connectionStatusState = null;
    folderPickerViewState = null;
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
      elements.saveServerBtn.innerHTML = `${iconSvg('sync', 'loading')}<span data-i18n="saving">${escapeHTML(t('saving'))}</span>`;
      
      const backgroundUpdated = await saveServer(formData);
      closeModal();
      await loadServers();
      showNotification(
        localizedMessage(backgroundUpdated ? 'saved' : 'savedReloadMenu'),
        backgroundUpdated ? 'success' : 'warning'
      );
    } catch (error) {
      console.error('Error saving server:', error);
      showNotification(localizedMessage('couldNotSaveSettings'), 'error');
    } finally {
      elements.saveServerBtn.disabled = false;
      elements.saveServerBtn.innerHTML = `${iconSvg('save')}<span data-i18n="save">${escapeHTML(t('save'))}</span>`;
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
      showNotification(localizedMessage('requiredServerFields'), 'error');
      return false;
    }

    if (!data.url.startsWith('http://') && !data.url.startsWith('https://')) {
      showNotification(localizedMessage('invalidServerUrl'), 'error');
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
      showConnectionStatus(localizedMessage('testingRequiresCredentials'), 'error');
      elements.folderSelection?.classList.add('hidden');
      return;
    }

    try {
      if (elements.testConnectionBtn) {
        elements.testConnectionBtn.disabled = true;
        elements.testConnectionBtn.innerHTML = `${iconSvg('sync', 'loading')}<span data-i18n="testing">${escapeHTML(t('testing'))}</span>`;
      }
      showConnectionStatus(localizedMessage('testingConnection'), 'loading');
      elements.folderSelection?.classList.add('hidden');


      const response = await chrome.runtime.sendMessage({
        action: 'testWebdav',
        config
      });

      console.log('Test response from background:', response);

      if (response?.success) {
        showConnectionStatus(localizedMessage('connectionReady'), 'success');
        elements.folderSelection?.classList.remove('hidden');
        await openFolderPicker('/', response.folders || ['/']);
      } else {
        showConnectionStatus(localizedMessage('connectionFailed', {
          error: response?.error
            ? localizeWebdavError(response.error)
            : localizedMessage('unknownError')
        }), 'error');
        elements.folderSelection?.classList.add('hidden');
        closeFolderPicker();
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      showConnectionStatus(localizedMessage('errorMessage', {
        error: error.message
          ? localizeWebdavError(error.message)
          : localizedMessage('backgroundUnavailable')
      }), 'error');
      elements.folderSelection?.classList.add('hidden');
      closeFolderPicker();
    } finally {
      if (elements.testConnectionBtn) {
        elements.testConnectionBtn.disabled = false;
        elements.testConnectionBtn.innerHTML = `${iconSvg('link')}<span data-i18n="testConnection">${escapeHTML(t('testConnection'))}</span>`;
      }
    }
  }

  function showConnectionStatus(message, type) {
    connectionStatusState = { message, type };
    renderConnectionStatusState();
  }

  function renderConnectionStatusState() {
    if (!elements.connectionStatus || !connectionStatusState) return;
    const { message, type } = connectionStatusState;
    elements.connectionStatus.className = `connection-status ${type}`;
    elements.connectionStatus.innerHTML = `${iconSvg(getStatusIcon(type))}<span>${escapeHTML(resolveLocalizedMessage(message))}</span>`;
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
      showNotification(localizedMessage('urlUsernameRequired'), 'error');
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
        throw new Error(response?.error || '');
      }

      renderFolderPickerList(response.folders || []);
    } catch (error) {
      console.error('Error listing folders:', error);
      renderFolderPickerError(error.message
        ? localizedMessage('folderListError', { error: localizeWebdavError(error.message) })
        : localizedMessage('couldNotListFolders'));
    } finally {
      setFolderPickerLoading(false);
    }
  }

  function renderFolderPickerList(folders, { remember = true } = {}) {
    if (!elements.folderList) return;

    if (remember) {
      folderPickerViewState = {
        kind: 'list',
        folders: normalizeFolderList(folders)
      };
    }

    const normalizedFolders = normalizeFolderList(folders)
      .filter(folder => folder !== folderPickerState.currentPath);
    elements.folderList.innerHTML = '';
    updateSelectedFolderPath(folderPickerState.currentPath);
    updateFolderPickerBackButton();

    if (normalizedFolders.length === 0) {
      elements.folderList.innerHTML = `
        <div class="folder-list-empty">
          ${iconSvg('folder-open')}
          <span>${escapeHTML(t('noFolders'))}</span>
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

  function renderFolderPickerError(message, { remember = true } = {}) {
    if (!elements.folderList) return;

    if (remember) folderPickerViewState = { kind: 'error', message };

    elements.folderList.innerHTML = `
      <div class="folder-list-empty">
        ${iconSvg('error')}
        <span>${escapeHTML(resolveLocalizedMessage(message))}</span>
      </div>
    `;
    updateFolderPickerBackButton();
  }

  function setFolderPickerLoading(isLoading, { remember = true } = {}) {
    if (!elements.folderList) return;

    elements.folderPickerRefreshBtn.disabled = isLoading;
    elements.folderPickerBackBtn.disabled = isLoading || folderPickerState.currentPath === '/';
    elements.selectFolderBtn.disabled = isLoading;

    if (isLoading) {
      if (remember) folderPickerViewState = { kind: 'loading' };
      elements.folderList.innerHTML = `
        <div class="folder-list-empty">
          ${iconSvg('sync', 'loading')}
          <span>${escapeHTML(t('loadingFolders'))}</span>
        </div>
      `;
    }
  }

  function rerenderFolderPickerView() {
    if (!folderPickerViewState) return;
    if (folderPickerViewState.kind === 'loading') {
      setFolderPickerLoading(true, { remember: false });
    } else if (folderPickerViewState.kind === 'error') {
      renderFolderPickerError(folderPickerViewState.message, { remember: false });
    } else if (folderPickerViewState.kind === 'list') {
      renderFolderPickerList(folderPickerViewState.folders, { remember: false });
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
      renderedServers = servers.map(server => ({ ...server }));

      if (servers.length === 0) {
        renderServerList([]);
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
      showNotification(localizedMessage('couldNotLoadServers'), 'error');
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
            <span class="server-info-label">${escapeHTML(t('userLabel'))}</span>
            <span class="server-info-value">${escapeHTML(server.username)}</span>
          </div>
          <div class="server-info-item">
            ${iconSvg('folder')}
            <span class="server-info-label">${escapeHTML(t('folderLabel'))}</span>
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
    editBtn?.setAttribute('aria-label', t('editServerLabel', { name: server.name }));
    editBtn?.setAttribute('title', t('edit'));
    deleteBtn?.setAttribute('aria-label', t('deleteServerLabel', { name: server.name }));
    deleteBtn?.setAttribute('title', t('delete'));
    
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
        showNotification(localizedMessage('serverNotFound'), 'error');
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
      showNotification(localizedMessage('couldNotLoadServer'), 'error');
    }
  }

  function confirmDeleteServer(serverId, serverName) {
    if (confirm(t('deleteConfirm', { name: serverName }))) {
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
        localizedMessage(backgroundUpdated ? 'deleted' : 'deletedReloadMenu'),
        backgroundUpdated ? 'success' : 'warning'
      );
    } catch (error) {
      console.error('Error deleting server:', error);
      showNotification(localizedMessage('couldNotDeleteServer'), 'error');
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

    notificationState = { message, type };
    renderNotificationState();
    elements.notification.classList.remove('hidden');

    // Toasts stay brief so saves feel light and non-blocking.
    setTimeout(() => {
      elements.notification.classList.add('hidden');
    }, type === 'success' ? 2200 : 4200);
  }

  function renderNotificationState() {
    if (!elements.notification || !notificationState) return;

    const iconMap = {
      success: 'check-circle',
      error: 'error',
      warning: 'error',
      info: 'info'
    };
    const { message, type } = notificationState;
    elements.notification.className = `notification ${type}`;
    elements.notification.querySelector('.notification-icon').innerHTML = iconSvg(iconMap[type] || 'info');
    elements.notification.querySelector('.notification-message').textContent = resolveLocalizedMessage(message);
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
