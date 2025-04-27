let timerBubble = null;
let countdownInterval = null;
let currentSendId = null;

// Function to create or update the timer bubble
function showTimerBubble(sendId, countdownSeconds) {
  currentSendId = sendId; // Store the current send ID

  // Remove existing bubble if any
  if (timerBubble) {
    timerBubble.remove();
    clearInterval(countdownInterval);
  }

  // Create bubble element
  timerBubble = document.createElement('div');
  timerBubble.id = `webdav-timer-bubble-${sendId}`;
  timerBubble.style.position = 'fixed';
  timerBubble.style.top = '20px';
  timerBubble.style.right = '20px';
  timerBubble.style.padding = '10px 15px';
  timerBubble.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  timerBubble.style.color = 'white';
  timerBubble.style.borderRadius = '5px';
  timerBubble.style.zIndex = '999999'; // Ensure it's on top
  timerBubble.style.fontSize = '14px';
  timerBubble.style.fontFamily = 'sans-serif';
  timerBubble.style.display = 'flex';
  timerBubble.style.alignItems = 'center';
  timerBubble.style.gap = '10px'; // Space between text and button

  let remainingTime = countdownSeconds;

  // Initial text
  const textSpan = document.createElement('span');
  textSpan.textContent = `Sending in ${remainingTime}s... `;
  timerBubble.appendChild(textSpan);

  // Cancel button
  const cancelButton = document.createElement('button');
  cancelButton.textContent = 'Cancel';
  cancelButton.style.padding = '3px 8px';
  cancelButton.style.fontSize = '12px';
  cancelButton.style.cursor = 'pointer';
  cancelButton.style.border = '1px solid white';
  cancelButton.style.background = 'transparent';
  cancelButton.style.color = 'white';
  cancelButton.onclick = () => {
    // Send cancel message to background script
    chrome.runtime.sendMessage({ action: "cancelSend", sendId: currentSendId });
    // Hide immediately on click
    hideTimerBubble(currentSendId, true); // Indicate cancellation
  };
  timerBubble.appendChild(cancelButton);


  document.body.appendChild(timerBubble);

  // Start countdown interval
  countdownInterval = setInterval(() => {
    remainingTime--;
    if (remainingTime > 0) {
      textSpan.textContent = `Sending in ${remainingTime}s... `;
    } else {
      // Countdown finished, background will handle hiding after send attempt
      textSpan.textContent = 'Sending...';
      cancelButton.disabled = true; // Disable cancel button when sending starts
      cancelButton.style.opacity = '0.5';
      clearInterval(countdownInterval);
    }
  }, 1000);
}

// Function to hide the timer bubble
function hideTimerBubble(sendId, wasCancelled) {
  // Only hide if the ID matches the currently displayed bubble's ID
  if (timerBubble && timerBubble.id === `webdav-timer-bubble-${sendId}`) {
    if (wasCancelled) {
      timerBubble.textContent = 'Cancelled.';
      // Keep cancelled message visible for a short time
      setTimeout(() => {
          if (timerBubble) timerBubble.remove();
          timerBubble = null;
      }, 1500);
    } else {
      // If not cancelled, remove immediately (or show status message briefly)
      if (timerBubble) timerBubble.remove();
       timerBubble = null;
    }
    clearInterval(countdownInterval);
    countdownInterval = null;
    currentSendId = null;
  }
}

// Function to show upload status message
function showStatusMessage(sendId, success, message) {
    // Try to reuse the bubble if it's still relevant (e.g., replacing 'Sending...')
    let statusBubble = document.getElementById(`webdav-timer-bubble-${sendId}`);

    if (!statusBubble) { // If bubble was removed, create a temporary one for status
        statusBubble = document.createElement('div');
        statusBubble.id = `webdav-status-bubble-${sendId}`;
        // Apply similar styles as the timer bubble
        statusBubble.style.position = 'fixed';
        statusBubble.style.top = '20px';
        statusBubble.style.right = '20px';
        statusBubble.style.padding = '10px 15px';
        statusBubble.style.backgroundColor = success ? 'rgba(40, 167, 69, 0.8)' : 'rgba(220, 53, 69, 0.8)'; // Green for success, Red for failure
        statusBubble.style.color = 'white';
        statusBubble.style.borderRadius = '5px';
        statusBubble.style.zIndex = '999999';
        statusBubble.style.fontSize = '14px';
        statusBubble.style.fontFamily = 'sans-serif';
        document.body.appendChild(statusBubble);
    } else {
        // Update existing bubble style
        statusBubble.style.backgroundColor = success ? 'rgba(40, 167, 69, 0.8)' : 'rgba(220, 53, 69, 0.8)';
        // Remove cancel button if it exists
        const cancelButton = statusBubble.querySelector('button');
        if (cancelButton) cancelButton.remove();
    }

    statusBubble.textContent = message;


    // Remove the status message after a few seconds
    setTimeout(() => {
        if(statusBubble) statusBubble.remove();
         // Clean up timer bubble reference if it was used for status
         if (timerBubble && timerBubble.id === `webdav-timer-bubble-${sendId}`) {
            timerBubble = null;
         }
    }, 3000); // Show status for 3 seconds
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showTimer") {
    showTimerBubble(request.sendId, request.countdown);
  } else if (request.action === "hideTimer") {
    hideTimerBubble(request.sendId, request.cancelled);
  } else if (request.action === "uploadStatus") {
      // Hide the timer bubble if it's still showing 'Sending...'
      hideTimerBubble(request.sendId, false);
      // Show the status message
      showStatusMessage(request.sendId, request.success, request.message);
  }
});

console.log("WebDAV Image Saver content script loaded."); // For debugging