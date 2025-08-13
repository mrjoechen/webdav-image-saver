document.addEventListener('DOMContentLoaded', () => {
  // Element selectors
  const elements = {
    emptyState: document.getElementById('empty-state'),
    serversSection: document.getElementById('servers-section'),
    serverList: document.getElementById('server-list'),
    addServerBtn: document.getElementById('add-server-btn'),
    addFirstServerBtn: document.getElementById('add-first-server-btn'),
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


  // Initialize the app
  init();

  async function init() {
    attachEventListeners();
    await loadServers();
  }

  function attachEventListeners() {
    // Modal controls
    elements.addServerBtn?.addEventListener('click', () => openModal());
    elements.addFirstServerBtn?.addEventListener('click', () => openModal());
    elements.closeModalBtn?.addEventListener('click', () => closeModal());
    elements.cancelBtn?.addEventListener('click', () => closeModal());
    
    // Click outside modal to close
    elements.modal?.addEventListener('click', (e) => {
      if (e.target === elements.modal) closeModal();
    });

    // Form submission
    elements.serverForm?.addEventListener('submit', handleFormSubmit);
    
    // Connection test
    elements.testConnectionBtn?.addEventListener('click', testConnection);


    // ESC key to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !elements.modal?.classList.contains('hidden')) {
        closeModal();
      }
    });
  }

  function openModal(serverId = null) {
    if (serverId) {
      loadServerForEdit(serverId);
      elements.modalTitle.textContent = 'Edit Server Configuration';
    } else {
      resetForm();
      elements.modalTitle.textContent = 'Add New Server';
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
    elements.customFolderPath.value = '';
    
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    
    const formData = getFormData();
    if (!validateFormData(formData)) return;

    try {
      elements.saveServerBtn.disabled = true;
      elements.saveServerBtn.innerHTML = '<span class="loading">Saving...</span>';
      
      await saveServer(formData);
      closeModal();
      await loadServers();
      showNotification('Server configuration saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving server:', error);
      showNotification('Failed to save server configuration.', 'error');
    } finally {
      elements.saveServerBtn.disabled = false;
      elements.saveServerBtn.innerHTML = '<span class="material-icons-outlined">save</span>Save Configuration';
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
      showNotification('Name, URL, and Username are required.', 'error');
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
      // Use local storage for sensitive data like passwords
      const localData = await chrome.storage.local.get('webdavServers');
      const syncData = await chrome.storage.sync.get('webdavServers');
      
      const servers = localData.webdavServers || syncData.webdavServers || [];
      
      const existingIndex = servers.findIndex(s => s.id === serverData.id);
      if (existingIndex > -1) {
        servers[existingIndex] = serverData;
      } else {
        servers.push(serverData);
      }
      
      // Store sensitive data locally, sync non-sensitive metadata
      await chrome.storage.local.set({ webdavServers: servers });
      
      // Create a sanitized version for sync (without passwords)
      const sanitizedServers = servers.map(server => ({
        id: server.id,
        name: server.name,
        url: server.url,
        username: server.username,
        folder: server.folder
        // Deliberately omit password for sync
      }));
      
      await chrome.storage.sync.set({ webdavServersMetadata: sanitizedServers });
      
      // Inform background script about the changes
      chrome.runtime.sendMessage({ action: 'configUpdated' });
    } catch (error) {
      console.error('Error saving server configuration:', error);
      throw new Error('Failed to save server configuration securely');
    }
  }

  async function testConnection() {
    const url = inputs.serverUrl.value.trim();
    const username = inputs.serverUsername.value.trim();
    const password = inputs.serverPassword.value;

    if (!url || !username) {
      showConnectionStatus('URL and Username are required for testing.', 'error');
      elements.folderSelection?.classList.add('hidden');
      return;
    }

    try {
      if (elements.testConnectionBtn) {
        elements.testConnectionBtn.disabled = true;
        elements.testConnectionBtn.innerHTML = '<span class="loading">Testing...</span>';
      }
      showConnectionStatus('Testing connection...', 'loading');
      elements.folderSelection?.classList.add('hidden');


      const response = await chrome.runtime.sendMessage({
        action: 'testWebdav',
        config: { url, username, password }
      });

      console.log('Test response from background:', response);

      if (response?.success) {
        showConnectionStatus('✓ Connection successful!', 'success');
        elements.folderSelection?.classList.remove('hidden');
      } else {
        showConnectionStatus(`✗ Connection failed: ${response?.error || 'Unknown error'}`, 'error');
        elements.folderSelection?.classList.add('hidden');
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      showConnectionStatus(`✗ Error: ${error.message || 'Could not contact background script.'}`, 'error');
      elements.folderSelection?.classList.add('hidden');
    } finally {
      if (elements.testConnectionBtn) {
        elements.testConnectionBtn.disabled = false;
        elements.testConnectionBtn.innerHTML = '<span class="material-icons-outlined">wifi_protected_setup</span>Test Connection';
      }
    }
  }

  function showConnectionStatus(message, type) {
    elements.connectionStatus.textContent = message;
    elements.connectionStatus.className = `connection-status ${type}`;
  }

  async function loadServers() {
    try {
      // Prefer local storage for complete data, fallback to sync for migration
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
          <span class="material-icons-outlined">storage</span>
          ${escapeHTML(server.name)}
        </div>
        <div class="server-card-url">${escapeHTML(server.url)}</div>
      </div>
      <div class="server-card-body">
        <div class="server-info">
          <div class="server-info-item">
            <span class="material-icons-outlined">person</span>
            <span class="server-info-label">User:</span>
            <span class="server-info-value">${escapeHTML(server.username)}</span>
          </div>
          <div class="server-info-item">
            <span class="material-icons-outlined">folder</span>
            <span class="server-info-label">Folder:</span>
            <span class="server-info-value">${escapeHTML(server.folder || '/')}</span>
          </div>
        </div>
      </div>
      <div class="server-card-actions">
        <button class="btn btn-secondary btn-sm edit-btn" data-id="${server.id}">
          <span class="material-icons-outlined">edit</span>
          Edit
        </button>
        <button class="btn btn-danger btn-sm delete-btn" data-id="${server.id}" data-name="${escapeHTML(server.name)}">
          <span class="material-icons-outlined">delete</span>
          Delete
        </button>
      </div>
    `;

    // Attach event listeners
    const editBtn = card.querySelector('.edit-btn');
    const deleteBtn = card.querySelector('.delete-btn');
    
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
        showNotification('Server configuration not found.', 'error');
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
      
      // Show folder selection if we have the info
      if (server.folder) {
        elements.folderSelection?.classList.remove('hidden');
      }
    } catch (error) {
      console.error('Error loading server for edit:', error);
      showNotification('Failed to load server configuration.', 'error');
    }
  }

  function confirmDeleteServer(serverId, serverName) {
    if (confirm(`Are you sure you want to delete the configuration "${serverName}"?`)) {
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
      
      // Update metadata for sync as well
      const sanitizedServers = servers.map(server => ({
        id: server.id,
        name: server.name,
        url: server.url,
        username: server.username,
        folder: server.folder
      }));
      await chrome.storage.sync.set({ webdavServersMetadata: sanitizedServers });
      
      await loadServers();
      showNotification('Server configuration deleted successfully.', 'success');
      
      // Inform background script
      chrome.runtime.sendMessage({ action: 'configUpdated' });
    } catch (error) {
      console.error('Error deleting server:', error);
      showNotification('Failed to delete server configuration.', 'error');
    }
  }

  function showNotification(message, type = 'success') {
    if (!elements.notification) return;
    
    const iconMap = {
      success: 'check_circle',
      error: 'error',
      warning: 'warning',
      info: 'info'
    };
    
    elements.notification.className = `notification ${type}`;
    elements.notification.querySelector('.notification-icon').textContent = iconMap[type] || 'info';
    elements.notification.querySelector('.notification-message').textContent = message;
    
    elements.notification.classList.remove('hidden');
    
    // Auto hide after 5 seconds
    setTimeout(() => {
      elements.notification.classList.add('hidden');
    }, 5000);
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  }

});