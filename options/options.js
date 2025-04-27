document.addEventListener('DOMContentLoaded', () => {
  const serverList = document.getElementById('server-list');
  const addServerBtn = document.getElementById('add-server-btn');
  const serverDialog = document.getElementById('server-dialog');
  const saveServerBtn = document.getElementById('save-server-btn');
  const closeDialogBtn = document.getElementById('close-dialog-btn');
  const testConnectionBtn = document.getElementById('test-connection-btn');
  const connectionStatus = document.getElementById('connection-status');
  const folderSelectionDiv = document.getElementById('folder-selection');
  const folderSelect = document.getElementById('server-folder');
  const newFolderPathInput = document.getElementById('new-folder-path');

  // --- Dialog Handling ---
  if (!serverDialog.showModal) { // Polyfill for browsers without <dialog> support
      dialogPolyfill.registerDialog(serverDialog);
  }
  addServerBtn.addEventListener('click', () => {
      resetDialog();
      serverDialog.showModal();
  });
  closeDialogBtn.addEventListener('click', () => {
      serverDialog.close();
  });

  // --- Load existing servers ---
  loadServers();

  // --- Save Server ---
  saveServerBtn.addEventListener('click', async () => {
      const id = document.getElementById('edit-id').value || `server_${Date.now()}`; // Generate ID if new
      const name = document.getElementById('server-name').value.trim();
      const url = document.getElementById('server-url').value.trim();
      const username = document.getElementById('server-username').value.trim();
      const password = document.getElementById('server-password').value; // Don't trim password
      let targetFolder = newFolderPathInput.value.trim() || folderSelect.value;

      if (!name || !url || !username) { // Password can be empty for some servers
          alert('Name, URL, and Username are required.');
          return;
      }

      // Basic URL validation (simple check)
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
          alert('URL must start with http:// or https://');
          return;
      }
      // Normalize folder path
      if (!targetFolder.startsWith('/')) targetFolder = '/' + targetFolder;
      if (targetFolder.endsWith('/') && targetFolder.length > 1) targetFolder = targetFolder.slice(0, -1);


      const newServer = { id, name, url, username, password, folder: targetFolder };

      try {
          const data = await chrome.storage.sync.get('webdavServers');
          const servers = data.webdavServers || [];
          const existingIndex = servers.findIndex(s => s.id === id);
          if (existingIndex > -1) {
              servers[existingIndex] = newServer; // Update
          } else {
              servers.push(newServer); // Add new
          }
          await chrome.storage.sync.set({ webdavServers: servers });
          serverDialog.close();
          loadServers(); // Reload the list
          // Inform background script about the changes (important!)
          chrome.runtime.sendMessage({ action: 'configUpdated' });
      } catch (error) {
          console.error('Error saving server:', error);
          alert('Failed to save configuration.');
      }
  });

  // --- Test Connection ---
  testConnectionBtn.addEventListener('click', async () => {
      const url = document.getElementById('server-url').value.trim();
      const username = document.getElementById('server-username').value.trim();
      const password = document.getElementById('server-password').value;

      if (!url || !username) {
          connectionStatus.textContent = 'URL and Username are required for testing.';
          connectionStatus.className = 'error';
          folderSelectionDiv.style.display = 'none';
          return;
      }

      connectionStatus.textContent = 'Testing...';
      connectionStatus.className = '';
      folderSelectionDiv.style.display = 'none';
      folderSelect.innerHTML = '<option value="/">/ (Root)</option>'; // Reset folder list

      try {
           // Send message to background script to perform the test
          const response = await chrome.runtime.sendMessage({
              action: 'testWebdav',
              config: { url, username, password }
          });

          console.log("Test response from background:", response);

          if (response && response.success) {
              connectionStatus.textContent = 'Connection successful!';
              connectionStatus.className = 'success';
              folderSelectionDiv.style.display = 'block';
              // Populate folder list
              if (response.folders && response.folders.length > 0) {
                  response.folders.forEach(folder => {
                       // Ensure folder path starts with / and is clean
                      let folderPath = folder.startsWith('/') ? folder : '/' + folder;
                      if (folderPath.endsWith('/') && folderPath.length > 1) {
                           folderPath = folderPath.slice(0, -1);
                      }
                      if (folderPath === '/') return; // Skip adding root again if present

                      const option = document.createElement('option');
                      option.value = folderPath;
                      option.textContent = folderPath;
                      folderSelect.appendChild(option);
                  });
              }
               // Re-apply Material Design Lite styling if needed
               if (typeof componentHandler !== 'undefined') {
                   componentHandler.upgradeElement(folderSelect.parentElement); // Upgrade the parent textfield
               }

          } else {
              connectionStatus.textContent = `Connection failed: ${response.error || 'Unknown error'}`;
              connectionStatus.className = 'error';
          }
      } catch (error) {
          console.error('Error sending test message:', error);
          connectionStatus.textContent = `Error: ${error.message || 'Could not contact background script.'}`;
          connectionStatus.className = 'error';
      }
  });

  // --- Helper Functions ---
  function resetDialog() {
    document.getElementById('edit-id').value = '';
    document.getElementById('server-name').value = '';
    document.getElementById('server-url').value = '';
    document.getElementById('server-username').value = '';
    document.getElementById('server-password').value = '';
    connectionStatus.textContent = '';
    connectionStatus.className = '';
    folderSelectionDiv.style.display = 'none';
    folderSelect.innerHTML = '<option value="/">/ (Root)</option>';
    newFolderPathInput.value = '';

    // Reset MDL textfield states (is-dirty, is-focused etc.)
    const dialogFields = serverDialog.querySelectorAll('.mdl-js-textfield');
    dialogFields.forEach(field => {
        // *** ADD THIS CHECK ***
        if (field.MaterialTextfield) {
            // Only call change() if the component object exists
            field.MaterialTextfield.change(); // Reset visual state (labels, dirty)
        } else {
            // Optional: Log a warning if an element wasn't upgraded.
            // This helps identify if there's a deeper MDL setup issue.
            console.warn('MDL Textfield component not found on element:', field);
        }
    });
     // If you have other MDL components in the dialog (checkboxes, etc.)
     // you might need similar checks and reset logic for them.
}

  async function loadServers() {
      serverList.innerHTML = ''; // Clear existing list
      try {
          const data = await chrome.storage.sync.get('webdavServers');
          const servers = data.webdavServers || [];
          servers.forEach(server => {
              const card = createServerCard(server);
              serverList.appendChild(card);
          });
           // Apply MDL styling to dynamically added elements
           if (typeof componentHandler !== 'undefined') {
              componentHandler.upgradeDom();
           }
      } catch (error) {
          console.error('Error loading servers:', error);
          serverList.innerHTML = '<p class="error">Could not load configurations.</p>';
      }
  }

  function createServerCard(server) {
      // Use MDL Card structure (or your chosen framework/CSS)
      const card = document.createElement('div');
      card.className = 'mdl-cell mdl-cell--4-col mdl-card mdl-shadow--2dp'; // Example MDL grid cell and card
      card.innerHTML = `
          <div class="mdl-card__title">
              <h2 class="mdl-card__title-text">${escapeHTML(server.name)}</h2>
          </div>
          <div class="mdl-card__supporting-text">
              URL: ${escapeHTML(server.url)}<br>
              Username: ${escapeHTML(server.username)}<br>
              Target Folder: ${escapeHTML(server.folder)}
          </div>
          <div class="mdl-card__actions mdl-card--border">
              <button class="mdl-button mdl-button--colored mdl-js-button mdl-js-ripple-effect edit-btn" data-id="${server.id}">
                  Edit
              </button>
              <button class="mdl-button mdl-color-text--red mdl-js-button mdl-js-ripple-effect delete-btn" data-id="${server.id}">
                  Delete
              </button>
          </div>
      `;

      card.querySelector('.edit-btn').addEventListener('click', () => editServer(server.id));
      card.querySelector('.delete-btn').addEventListener('click', () => deleteServer(server.id, server.name));

      return card;
  }

  async function editServer(id) {
    const data = await chrome.storage.sync.get('webdavServers');
    const server = (data.webdavServers || []).find(s => s.id === id);
    if (server) {
        resetDialog(); // Clear first

        // ... (fill input values) ...
        document.getElementById('edit-id').value = server.id;
        document.getElementById('server-name').value = server.name;
        document.getElementById('server-url').value = server.url;
        document.getElementById('server-username').value = server.username;
        document.getElementById('server-password').value = server.password;
        folderSelect.value = server.folder;
        if (!folderSelect.value) {
            newFolderPathInput.value = server.folder;
        }
        folderSelectionDiv.style.display = 'block';

        // Important: Trigger MDL update for filled fields
        const dialogFields = serverDialog.querySelectorAll('.mdl-js-textfield');
        dialogFields.forEach(field => {
             // *** ADD THIS CHECK HERE TOO ***
            if (field.MaterialTextfield) {
                field.MaterialTextfield.checkDirty(); // Update state based on new value
            } else {
                 console.warn('MDL Textfield component not found during edit on element:', field);
            }
        });

        // Update the dropdown's visual state if using MDL select wrapper
        const folderSelectWrapper = folderSelect.parentElement;
        if(folderSelectWrapper && folderSelectWrapper.MaterialTextfield) {
             folderSelectWrapper.MaterialTextfield.change(folderSelect.value);
             folderSelectWrapper.MaterialTextfield.checkDirty();
        }


        serverDialog.showModal();
    }
}

  async function deleteServer(id, name) {
      if (confirm(`Are you sure you want to delete the configuration "${name}"?`)) {
          try {
              const data = await chrome.storage.sync.get('webdavServers');
              let servers = data.webdavServers || [];
              servers = servers.filter(s => s.id !== id);
              await chrome.storage.sync.set({ webdavServers: servers });
              loadServers(); // Reload list
               // Inform background script
              chrome.runtime.sendMessage({ action: 'configUpdated' });
          } catch (error) {
              console.error('Error deleting server:', error);
              alert('Failed to delete configuration.');
          }
      }
  }

  function escapeHTML(str) {
      const div = document.createElement('div');
      div.appendChild(document.createTextNode(str));
      return div.innerHTML;
  }
});