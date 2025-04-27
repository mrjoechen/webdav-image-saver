const profilesContainer = document.getElementById('profilesContainer');
const addProfileButton = document.getElementById('addProfile');
const saveButton = document.getElementById('save');
const statusDiv = document.getElementById('status');

// Function to add a new profile section to the form
function addProfileElement(profile = { id: Date.now(), name: '', url: '', username: '', password: '', path: '/' }) {
  const profileDiv = document.createElement('div');
  profileDiv.classList.add('profile');
  profileDiv.dataset.id = profile.id;

  profileDiv.innerHTML = `
    <label>Profile Name:</label>
    <input type="text" class="profile-name" value="${profile.name}" placeholder="e.g., Work Drive">
    <label>WebDAV URL:</label>
    <input type="url" class="profile-url" value="${profile.url}" placeholder="https://your-webdav-server.com/remote.php/dav/files/username/">
    <label>Username:</label>
    <input type="text" class="profile-username" value="${profile.username}">
    <label>Password:</label>
    <input type="password" class="profile-password" value="${profile.password}">
    <label>Target Path (optional, start & end with /):</label>
    <input type="text" class="profile-path" value="${profile.path || '/'}" placeholder="/images/">
    <button class="removeProfile">Remove Profile</button>
  `;

  profileDiv.querySelector('.removeProfile').addEventListener('click', () => {
    profileDiv.remove();
  });

  profilesContainer.appendChild(profileDiv);
}

// Load existing settings when the options page opens
function loadOptions() {
  chrome.storage.local.get('webdavProfiles', (data) => {
    const profiles = data.webdavProfiles || [];
    if (profiles.length === 0) {
      // Add a default empty profile if none exist
      addProfileElement();
    } else {
      profiles.forEach(profile => addProfileElement(profile));
    }
  });
}

// Save settings
function saveOptions() {
  const profiles = [];
  const profileElements = profilesContainer.querySelectorAll('.profile');

  profileElements.forEach(div => {
    const profile = {
      id: div.dataset.id,
      name: div.querySelector('.profile-name').value.trim(),
      url: div.querySelector('.profile-url').value.trim(),
      username: div.querySelector('.profile-username').value.trim(),
      password: div.querySelector('.profile-password').value, // Store password directly (consider security implications)
      path: div.querySelector('.profile-path').value.trim() || '/'
    };
    // Basic validation
    if (profile.name && profile.url && profile.username) {
       // Ensure path starts and ends with / if not empty
       if (profile.path && !profile.path.startsWith('/')) profile.path = '/' + profile.path;
       if (profile.path && !profile.path.endsWith('/') && profile.path !== '/') profile.path = profile.path + '/';
       profiles.push(profile);
    } else {
        alert(`Profile "${profile.name || 'Unnamed'}" is incomplete and won't be saved.`);
    }
  });

  chrome.storage.local.set({ webdavProfiles: profiles }, () => {
    statusDiv.textContent = 'Options saved.';
    // Update context menus after saving
    chrome.runtime.sendMessage({ action: "updateContextMenus" });
    setTimeout(() => { statusDiv.textContent = ''; }, 1500);
  });
}

document.addEventListener('DOMContentLoaded', loadOptions);
saveButton.addEventListener('click', saveOptions);
addProfileButton.addEventListener('click', () => addProfileElement());

// Listen for clicks on the extension icon to open the options page
// This needs to be handled in the background script for Manifest V3
// chrome.action.onClicked.addListener(() => {
//   chrome.runtime.openOptionsPage();
// });
// In background.js, add:
// chrome.action.onClicked.addListener((tab) => {
//   chrome.runtime.openOptionsPage();
// });