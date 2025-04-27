// content_script.js

(() => {
    // Use an object to keep track of active countdowns/bubbles by their unique ID
    const activeBubbles = {};
  
    // Function to create or update the countdown bubble
    function showCountdownBubble(id, serverName, initialSeconds) {
      // Remove existing bubble for this ID if any (shouldn't happen often)
      removeBubble(id);
  
      const bubble = document.createElement('div');
      bubble.id = `webdav-bubble-${id}`;
      bubble.className = 'webdav-saver-bubble';
  
      let secondsRemaining = initialSeconds;
  
      bubble.innerHTML = `
        <p>Sending to "${escapeHTML(serverName)}" in <span class="countdown-timer">${secondsRemaining}</span>s...</p>
        <button class="cancel-button" title="Cancel Upload">Cancel</button>
      `;
  
      document.body.appendChild(bubble);
  
      const timerSpan = bubble.querySelector('.countdown-timer');
      const cancelButton = bubble.querySelector('.cancel-button');
  
      // Countdown interval
      const intervalId = setInterval(() => {
        secondsRemaining--;
        if (timerSpan) { // Check if element still exists
           timerSpan.textContent = secondsRemaining;
        }
        if (secondsRemaining <= 0) {
          clearInterval(intervalId);
          // Don't remove the bubble here, background script will tell us when
        }
      }, 1000);
  
      // Cancel button listener
      cancelButton.addEventListener('click', () => {
        console.log('Cancel clicked for ID:', id);
        // Send message to background to cancel the actual upload timer
        chrome.runtime.sendMessage({ action: 'cancelUpload', uploadId: id });
        // Immediately remove this bubble
        removeBubble(id);
      });
  
      // Store references for later removal/clearing
      activeBubbles[id] = {
        element: bubble,
        intervalId: intervalId
      };
    }
  
    // Function to remove a bubble and clear its interval
    function removeBubble(id) {
      if (activeBubbles[id]) {
        clearInterval(activeBubbles[id].intervalId);
        activeBubbles[id].element.remove();
        delete activeBubbles[id];
        console.log('Removed bubble for ID:', id);
      }
    }
  
    // Function to show the final status (success/error)
    function showStatusBubble(status, message) {
        const bubble = document.createElement('div');
        bubble.className = `webdav-saver-status-bubble ${status}`; // 'success' or 'error'
        bubble.textContent = message;
  
        document.body.appendChild(bubble);
  
        // Automatically remove after animation completes (approx 4s based on CSS)
        setTimeout(() => {
            bubble.remove();
        }, 4000);
    }
  
  
    // Listen for messages from the background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('Content script received message:', message);
      if (message.action === 'showCountdownBubble') {
        showCountdownBubble(message.uploadId, message.serverName, message.countdownSeconds);
      } else if (message.action === 'removeCountdownBubble') {
        removeBubble(message.uploadId);
      } else if (message.action === 'showStatusBubble') {
         removeBubble(message.uploadId); // Ensure countdown bubble is gone first
         showStatusBubble(message.status, message.message);
      }
      // Indicate that the response function will not be called (or will be called asynchronously)
      // For simplicity here, we don't send responses back from most actions.
      return false;
    });
  
    // Helper to escape HTML (basic protection)
    function escapeHTML(str) {
      const div = document.createElement('div');
      div.appendChild(document.createTextNode(str));
      return div.innerHTML;
    }
  
    console.log('WebDAV Saver Content Script Loaded.');
  
  })(); // IIFE to avoid polluting global scope