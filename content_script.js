// content_script.js

(() => {
    // Use an object to keep track of active countdowns/bubbles by their unique ID
    const activeBubbles = {};
    const activeFormatChoosers = {};
    const batchStatusTimers = {};

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

    function batchStatusId(batchId) {
      return `webdav-batch-status-${String(batchId || '')}`;
    }

    function getOrCreateBatchStatus(batchId) {
      const id = batchStatusId(batchId);
      let bubble = document.getElementById(id);
      if (bubble) return bubble;

      bubble = document.createElement('section');
      bubble.id = id;
      bubble.className = 'webdav-batch-status';
      bubble.setAttribute('role', 'status');
      bubble.setAttribute('aria-live', 'polite');
      document.body.appendChild(bubble);
      return bubble;
    }

    function showBatchProgress(batch) {
      if (!batch?.batchId || !batch.summary) return;
      const bubble = getOrCreateBatchStatus(batch.batchId);
      bubble.className = 'webdav-batch-status running';
      bubble.textContent = '';

      const label = document.createElement('p');
      label.textContent = `Saving ${batch.summary.completed} of ${batch.summary.total} to “${batch.serverName || 'WebDAV'}”`;
      const track = document.createElement('div');
      track.className = 'webdav-batch-progress';
      const fill = document.createElement('span');
      const percent = batch.summary.total > 0
        ? Math.round((batch.summary.completed / batch.summary.total) * 100)
        : 0;
      fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
      track.appendChild(fill);
      bubble.append(label, track);
    }

    function showBatchSummary(batch) {
      if (!batch?.batchId || !batch.summary) return;
      const bubble = getOrCreateBatchStatus(batch.batchId);
      const saved = (batch.summary.success || 0) + (batch.summary.warning || 0);
      const failed = batch.summary.failed || 0;
      const cancelled = batch.summary.cancelled || 0;
      const details = [failed ? `${failed} failed` : '', cancelled ? `${cancelled} cancelled` : '']
        .filter(Boolean)
        .join('; ');
      bubble.className = `webdav-batch-status complete${failed ? ' has-errors' : ''}`;
      bubble.textContent = `Saved ${saved} of ${batch.summary.total}${details ? `; ${details}` : ''}.`;

      clearTimeout(batchStatusTimers[batch.batchId]);
      batchStatusTimers[batch.batchId] = setTimeout(() => {
        bubble.remove();
        delete batchStatusTimers[batch.batchId];
      }, 8000);
    }
  
  
    // Listen for messages from the background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('Content script received message:', message);
      if (message.action === 'ping') {
        // Respond to ping to indicate script is present
        sendResponse({
          pong: true,
          batchDiscovery: typeof ImageDiscovery !== 'undefined'
        });
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
      } else if (message.action === 'batchPage:collectImages') {
         try {
           const records = ImageDiscovery.collectImageRecords(document, window.matchMedia.bind(window));
           sendResponse({
             success: true,
             pageUrl: location.href,
             pageTitle: document.title,
             images: ImageDiscovery.discoverImages(records, document.baseURI)
           });
         } catch (error) {
           sendResponse({ success: false, error: error.message || String(error) });
         }
      } else if (message.action === 'batchPage:showProgress') {
         showBatchProgress(message.batch);
      } else if (message.action === 'batchPage:showSummary') {
         showBatchSummary(message.batch);
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
