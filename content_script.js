// content_script.js

(() => {
    // Use an object to keep track of active countdowns/bubbles by their unique ID
    const activeBubbles = {};
    const activeFormatChoosers = {};

    function sendRuntimeMessage(message, onFailure) {
      chrome.runtime.sendMessage(message).catch(error => {
        console.error(`Failed to send ${message.action}:`, error);
        onFailure?.(error);
      });
    }

    function showFormatChooser(id, serverName) {
      removeFormatChooser(id);
      const previousFocus = document.activeElement;

      const chooser = document.createElement('section');
      chooser.id = `webdav-format-chooser-${id}`;
      chooser.className = 'webdav-format-chooser';
      chooser.setAttribute('role', 'dialog');
      chooser.setAttribute('aria-modal', 'false');
      chooser.setAttribute('aria-labelledby', `webdav-format-title-${id}`);

      const title = document.createElement('p');
      title.id = `webdav-format-title-${id}`;
      title.className = 'webdav-format-chooser-title';
      title.textContent = `Save image to “${serverName}” as`;
      chooser.appendChild(title);

      const options = document.createElement('div');
      options.className = 'webdav-format-options';
      [
        ['original', 'Original'],
        ['png', 'PNG'],
        ['jpg', 'JPG'],
        ['webp', 'WebP']
      ].forEach(([format, label]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'webdav-format-option';
        button.dataset.format = format;
        button.textContent = label;
        button.addEventListener('click', () => {
          removeFormatChooser(id);
          sendRuntimeMessage(
            { action: 'formatSelected', uploadId: id, format },
            () => showStatusBubble('error', 'Could not start the upload. Please try again.')
          );
        });
        options.appendChild(button);
      });
      chooser.appendChild(options);

      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'webdav-format-cancel';
      cancelButton.textContent = 'Cancel';
      chooser.appendChild(cancelButton);

      const cancelSelection = () => {
        removeFormatChooser(id);
        sendRuntimeMessage({ action: 'cancelFormatSelection', uploadId: id });
      };
      const handleKeydown = (event) => {
        if (event.key === 'Escape') {
          cancelSelection();
          return;
        }

        if (event.key !== 'Tab') return;
        const focusableElements = [...chooser.querySelectorAll('button:not(:disabled)')];
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      };

      cancelButton.addEventListener('click', cancelSelection);
      document.addEventListener('keydown', handleKeydown);
      document.body.appendChild(chooser);

      activeFormatChoosers[id] = {
        element: chooser,
        handleKeydown,
        previousFocus
      };
      chooser.querySelector('.webdav-format-option')?.focus();
    }

    function removeFormatChooser(id) {
      const chooser = activeFormatChoosers[id];
      if (!chooser) return;

      document.removeEventListener('keydown', chooser.handleKeydown);
      chooser.element.remove();
      delete activeFormatChoosers[id];
      if (chooser.previousFocus instanceof HTMLElement && chooser.previousFocus.isConnected) {
        chooser.previousFocus.focus();
      }
    }
  
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
          cancelButton.disabled = true;
          cancelButton.textContent = 'Uploading...';
          sendRuntimeMessage(
            { action: 'uploadCountdownComplete', uploadId: id },
            () => {
              removeBubble(id);
              showStatusBubble('error', 'Could not start the upload. Please try again.');
            }
          );
        }
      }, 1000);
  
      // Cancel button listener
      cancelButton.addEventListener('click', () => {
        console.log('Cancel clicked for ID:', id);
        sendRuntimeMessage({ action: 'cancelUpload', uploadId: id });
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
      if (message.action === 'ping') {
        // Respond to ping to indicate script is present
        sendResponse({ pong: true });
        return true;
      } else if (message.action === 'showCountdownBubble') {
        showCountdownBubble(message.uploadId, message.serverName, message.countdownSeconds);
      } else if (message.action === 'showFormatChooser') {
        showFormatChooser(message.uploadId, message.serverName);
      } else if (message.action === 'removeCountdownBubble') {
        removeBubble(message.uploadId);
      } else if (message.action === 'showStatusBubble') {
         removeBubble(message.uploadId); // Ensure countdown bubble is gone first
         removeFormatChooser(message.uploadId);
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