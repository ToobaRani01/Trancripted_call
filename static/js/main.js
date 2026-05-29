// Global variables
let currentCallId = null;
let currentParticipantId = null;
let currentCallCode = null;
let currentSpeakerName = 'You';
let callEnded = false;
let transcriptMessages = [];
let sidePanelVisible = false;
let seenTranscriptKeys = new Set();

// Initialize Socket.IO (socket declared in webrtc.js)
function initializeSocket() {
    if (typeof io === 'undefined') {
        console.error('Socket.IO client failed to load');
        showNotification('Could not load app scripts. Hard refresh (Ctrl+Shift+R) and restart the server.', 'error');
        return;
    }
    socket = io({
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: 10
    });

    socket.on('connect', () => {
        console.log('Connected to server');
    });

    socket.on('connect_error', (err) => {
        console.error('Socket connect error:', err);
        showNotification('Cannot connect to server. Is python app.py running?', 'error');
    });

    socket.on('connection_response', (data) => {
        console.log('Connection response:', data);
    });

    socket.on('offer', (data) => {
        console.log('Received offer');
        if (!peerConnection) {
            createPeerConnection(currentCallId, currentParticipantId);
        }
        handleOffer(data.offer);
    });

    socket.on('answer', (data) => {
        console.log('Received answer');
        handleAnswer(data.answer);
    });

    socket.on('ice-candidate', (data) => {
        console.log('Received ICE candidate');
        handleIceCandidate(data.candidate);
    });

    socket.on('user_joined', (data) => {
        console.log('User joined:', data);
        updateParticipantCount();
        showNotification(data.message, 'success');
        
        // If we're the first person, we need to create offer when second person joins
        if (peerConnection === null) {
            createPeerConnection(currentCallId, currentParticipantId);
            createAndSendOffer(currentCallId, currentParticipantId);
        }
    });

    socket.on('user_left', (data) => {
        console.log('User left:', data);
        updateParticipantCount();
        if (document.getElementById('remoteVideo')) {
            document.getElementById('remoteVideo').srcObject = null;
        }
    });

    socket.on('transcript_updated', (data) => {
        console.log('Transcript updated:', data);
        displayTranscriptMessage(data.speaker, data.message);
    });

    socket.on('live_summary', (data) => {
        console.log('Live summary received:', data);
        updateLiveSummary(data);
        updateLiveNotes(data);
    });

    socket.on('live_notes', (data) => {
        updateLiveNotes(data);
    });

    socket.on('error', (data) => {
        console.error('Socket error:', data);
        showNotification('Error: ' + data.message, 'error');
    });
}

// Screen Navigation
function showHome() {
    switchScreen('homeScreen');
    if (typeof stopLiveTranscription === 'function') stopLiveTranscription();
    sidePanelVisible = false;
    cleanupWebRTC();
    if (socket) {
        socket.emit('leave_call', {
            call_id: currentCallId,
            participant_id: currentParticipantId
        });
    }
    resetFormData();
}

function showCreateCall() {
    checkDevicesAndProceed('create');
}

function showJoinCall() {
    checkDevicesAndProceed('join');
}

function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// Device Check Functions
async function checkDevicesAndProceed(action) {
    console.log('Checking devices for action:', action);
    switchScreen('deviceCheckScreen');
    
    // Store the action for later
    window.pendingAction = action;
    
    // Check devices
    await checkDevices();
}

async function checkDevices() {
    try {
        // Check camera
        const cameraStatus = document.getElementById('cameraStatus');
        try {
            const cameraOk = await checkAndTestDevice('video');
            updateDeviceStatus('camera', cameraOk);
            deviceCheckState.camera = cameraOk;
        } catch (error) {
            console.error('Error checking camera:', error);
            updateDeviceStatus('camera', false);
            deviceCheckState.camera = false;
        }

        // Check microphone
        const micStatus = document.getElementById('microphoneStatus');
        try {
            const micOk = await checkAndTestDevice('audio');
            updateDeviceStatus('microphone', micOk);
            deviceCheckState.microphone = micOk;
        } catch (error) {
            console.error('Error checking microphone:', error);
            updateDeviceStatus('microphone', false);
            deviceCheckState.microphone = false;
        }

        // Update proceed button
        const proceedBtn = document.getElementById('proceedButton');
        const bothOk = deviceCheckState.camera && deviceCheckState.microphone;
        proceedBtn.disabled = !bothOk;

        if (!bothOk) {
            showNotification('Please enable both camera and microphone to proceed', 'warning');
        }

    } catch (error) {
        console.error('Error during device check:', error);
        showNotification('Error checking devices: ' + error.message, 'error');
    }
}

function updateDeviceStatus(device, isOk) {
    const statusId = device === 'camera' ? 'cameraStatus' : 'microphoneStatus';
    const element = document.getElementById(statusId);
    
    if (isOk) {
        element.className = 'device-status ok';
        element.innerHTML = `
            <div class="device-status-icon">✓</div>
            <div class="device-status-text">
                <div class="device-status-label">${device === 'camera' ? 'Camera' : 'Microphone'}</div>
                <div class="device-status-detail">Working perfectly</div>
            </div>
        `;
    } else {
        element.className = 'device-status error';
        element.innerHTML = `
            <div class="device-status-icon">✗</div>
            <div class="device-status-text">
                <div class="device-status-label">${device === 'camera' ? 'Camera' : 'Microphone'}</div>
                <div class="device-status-detail">Not available or blocked</div>
            </div>
        `;
    }
}

function checkDevicesAgain() {
    checkDevices();
}

function proceedWithCall() {
    const action = window.pendingAction || 'create';
    switchScreen(action === 'create' ? 'createCallScreen' : 'joinCallScreen');
}

// Create Call
async function createCall(event) {
    event.preventDefault();

    const creatorName = document.getElementById('creatorName').value.trim();
    currentSpeakerName = creatorName;
    const password = document.getElementById('creatorPassword').value.trim();

    if (!creatorName || !password) {
        showNotification('Please enter name and password', 'error');
        return;
    }

    showLoading(true, 'Creating call...');

    try {
        const response = await fetch('/api/create-call', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                creator_name: creatorName,
                password: password
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create call');
        }

        const data = await response.json();
        currentCallId = data.call_id;
        currentCallCode = data.call_code;

        showNotification('Call created! Code: ' + data.call_code, 'success');

        // Initialize WebRTC
        if (await initializeWebRTC()) {
            window.currentCallId = currentCallId;
            window.currentParticipantId = 'creator';

            if (!socket || !socket.connected) {
                throw new Error('Not connected to server. Refresh the page and try again.');
            }

            socket.emit('join_call_room', {
                call_id: currentCallId,
                participant_id: 'creator'
            });

            switchScreen('callScreen');
            document.getElementById('displayCallCode').textContent = currentCallCode;
            updateParticipantCount();
            onCallScreenReady();
        }

    } catch (error) {
        console.error('Error creating call:', error);
        showNotification(error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Join Call
async function joinCall(event) {
    event.preventDefault();

    const callCode = document.getElementById('callCode').value.trim().toUpperCase();
    const guestName = document.getElementById('guestName').value.trim();
    const password = document.getElementById('joinPassword').value.trim();

    if (!callCode || !guestName || !password) {
        showNotification('Please fill all fields', 'error');
        return;
    }

    showLoading(true, 'Joining call...');

    try {
        const response = await fetch('/api/join-call', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                call_code: callCode,
                participant_name: guestName,
                password: password
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to join call');
        }

        const data = await response.json();
        currentCallId = data.call_id;
        currentParticipantId = data.participant_id;
        currentCallCode = callCode;
        currentSpeakerName = guestName;

        showNotification('Joined call successfully!', 'success');

        // Initialize WebRTC
        if (await initializeWebRTC()) {
            window.currentCallId = currentCallId;
            window.currentParticipantId = currentParticipantId;

            if (!socket || !socket.connected) {
                throw new Error('Not connected to server. Refresh the page and try again.');
            }

            socket.emit('join_call_room', {
                call_id: currentCallId,
                participant_id: currentParticipantId
            });

            // Create peer connection
            createPeerConnection(currentCallId, currentParticipantId);

            switchScreen('callScreen');
            document.getElementById('displayCallCode').textContent = currentCallCode;
            updateParticipantCount();
            onCallScreenReady();
        }

    } catch (error) {
        console.error('Error joining call:', error);
        showNotification(error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Copy Call Code
function copyCallCode() {
    const code = currentCallCode;
    navigator.clipboard.writeText(code).then(() => {
        showNotification('Call code copied to clipboard!', 'success');
    });
}

// Update Participant Count
async function updateParticipantCount() {
    try {
        const response = await fetch(`/api/call/${currentCallId}`);
        const data = await response.json();
        document.getElementById('participantCount').textContent = data.participants.length;
    } catch (error) {
        console.error('Error updating participant count:', error);
    }
}

function onCallScreenReady() {
    loadExistingTranscript();
    if (typeof startCallTranscription === 'function') {
        startCallTranscription(currentSpeakerName);
    }
}

async function loadExistingTranscript() {
    if (!currentCallId) return;
    try {
        const response = await fetch(`/api/transcript/${currentCallId}`);
        if (!response.ok) return;
        const data = await response.json();
        if (data.messages && data.messages.length) {
            data.messages.forEach((m) => displayTranscriptMessage(m.speaker_name, m.message, true));
        }
    } catch (e) {
        console.warn('Could not load transcript:', e);
    }
}

function transcriptKey(speaker, message) {
    return `${speaker}::${message}`;
}

function displayTranscriptMessage(speaker, message, skipDedup) {
    if (!skipDedup && transcriptMessages.length > 0) {
        const lastMsg = transcriptMessages[transcriptMessages.length - 1];
        if (lastMsg.speaker === speaker && lastMsg.message === message) {
            return; // Skip consecutive exact duplicates
        }
    }
    
    // Add to seenTranscriptKeys for compatibility, but don't filter with it
    const key = transcriptKey(speaker, message);
    seenTranscriptKeys.add(key);
    
    transcriptMessages.push({ speaker, message });

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.innerHTML = `
        <div class="speaker">${escapeHtml(speaker)}:</div>
        <div>${escapeHtml(message)}</div>
    `;

    const container = document.getElementById('transcriptMessages');
    if (container.querySelector('.placeholder')) {
        container.innerHTML = '';
    }
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;

    const interim = document.getElementById('interimTranscript');
    if (interim) interim.textContent = '';
}


function sendTranscriptToServer(speaker, message) {
    if (!socket || !currentCallId || !message.trim()) return;
    socket.emit('add_transcript_message', {
        call_id: currentCallId,
        speaker_name: speaker,
        message: message.trim()
    });
}

function updateInterimTranscript(speaker, text) {
    const el = document.getElementById('interimTranscript');
    if (el) {
        el.textContent = text ? `${speaker}: ${text}` : '';
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showSidePanel(tab) {
    const panel = document.getElementById('sidePanel');
    const container = document.getElementById('callContainer');
    if (!panel) return;
    panel.classList.remove('side-panel-hidden');
    if (container) container.classList.add('with-side-panel');
    sidePanelVisible = true;
    const btn = document.getElementById('toggleInsightsPanel');
    if (btn) btn.classList.add('active');
    if (tab) switchSidePanelTab(tab);
}

function hideSidePanel() {
    const panel = document.getElementById('sidePanel');
    const container = document.getElementById('callContainer');
    if (!panel || !document.getElementById('callScreen')?.classList.contains('active')) {
        sidePanelVisible = false;
        return;
    }
    panel.classList.add('side-panel-hidden');
    if (container) container.classList.remove('with-side-panel');
    sidePanelVisible = false;
    const btn = document.getElementById('toggleInsightsPanel');
    if (btn) btn.classList.remove('active');
}

function toggleSidePanel() {
    if (sidePanelVisible) {
        hideSidePanel();
    } else {
        showSidePanel('transcript');
    }
}

function switchSidePanelTab(tabName) {
    document.querySelectorAll('.panel-tab').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.panel-tab-content').forEach((el) => {
        el.classList.toggle('active', el.id === `tab-${tabName}`);
    });
    if (tabName === 'summary') refreshSummary();
    if (tabName === 'notes') refreshNotes();
}

function refreshSummary() {
    if (!socket || !currentCallId) return;
    document.getElementById('summaryText').textContent = 'Generating summary...';
    socket.emit('get_live_summary', { call_id: currentCallId });
}

function refreshNotes() {
    if (!socket || !currentCallId) return;
    document.getElementById('notesText').textContent = 'Generating notes...';
    socket.emit('get_live_notes', { call_id: currentCallId });
}

function refreshAllInsights() {
    refreshSummary();
    refreshNotes();
}

function updateLiveNotes(data) {
    const notesText = document.getElementById('notesText');
    const notesList = document.getElementById('notesList');
    if (!notesText || !notesList) return;

    notesText.textContent = data.notes_text || 'No notes yet. Keep talking or refresh.';

    notesList.innerHTML = '';
    const items = data.notes_items || [];
    if (Array.isArray(items) && items.length) {
        items.forEach((point) => {
            const li = document.createElement('li');
            li.textContent = point;
            notesList.appendChild(li);
        });
    }
}

function updateLiveSummary(data) {
    document.getElementById('summaryText').textContent = data.summary || 'Generating summary...';

    const keyPointsList = document.getElementById('keyPointsList');
    keyPointsList.innerHTML = '';
    if (data.key_points && Array.isArray(data.key_points)) {
        data.key_points.forEach((point) => {
            const li = document.createElement('li');
            li.textContent = point;
            keyPointsList.appendChild(li);
        });
    }

    const actionList = document.getElementById('actionItemsList');
    if (actionList) {
        actionList.innerHTML = '';
        if (data.action_items && Array.isArray(data.action_items)) {
            data.action_items.forEach((item) => {
                const li = document.createElement('li');
                li.textContent = item;
                actionList.appendChild(li);
            });
        }
    }

    if (data.notes_text || data.notes_items) {
        updateLiveNotes(data);
    }
}

// End Call
async function endCall() {
    if (!confirm('Are you sure you want to end this call?')) {
        return;
    }

    callEnded = true;

    // Immediately stop streams, transcription & close WebRTC to turn off camera/microphone instantly!
    if (typeof stopLiveTranscription === 'function') stopLiveTranscription();
    cleanupWebRTC();

    // Immediately go to the Call Ended Screen so the user feels the call ended INSTANTLY!
    switchScreen('callEndedScreen');

    // Display beautiful animated loading pulses on the Call Ended screen
    document.getElementById('finalNotesText').innerHTML = '<div class="loading-pulse">⏳ AI is analyzing your meeting notes...</div>';
    document.getElementById('finalNotesList').innerHTML = '';
    document.getElementById('finalSummaryText').innerHTML = '<div class="loading-pulse">⚡ Generating summary and key points...</div>';
    document.getElementById('finalKeyPointsList').innerHTML = '';

    // Show the transcript immediately so the user can read it instantly!
    const finalTranscript = document.getElementById('finalTranscript');
    finalTranscript.innerHTML = '';
    
    if (transcriptMessages.length) {
        transcriptMessages.forEach((msg) => {
            const div = document.createElement('div');
            div.className = 'message';
            div.innerHTML = `<div class="speaker">${escapeHtml(msg.speaker)}:</div><div>${escapeHtml(msg.message)}</div>`;
            finalTranscript.appendChild(div);
        });
    } else {
        finalTranscript.innerHTML = '<p class="placeholder">No transcript recorded for this call.</p>';
    }

    const callIdToPoll = currentCallId;
    
    // Fire API request in background to end call on server
    fetch(`/api/end-call/${callIdToPoll}`, {
        method: 'POST'
    }).then(async (response) => {
        if (!response.ok) {
            console.error('Failed to report call end to server');
        }
    }).catch(err => {
        console.error('Error reporting call end:', err);
    });

    // Start background polling for summary
    pollForSummary(callIdToPoll);
}

// Poll for summary from the server
function isSummaryReady(summaryData) {
    if (!summaryData || !summaryData.summary_text) return false;
    const text = summaryData.summary_text.toString().toLowerCase();
    return !(/pending|generating|please wait|is being generated|try again later/i.test(text) && !/quota exceeded/i.test(text));
}

async function pollForSummary(callId, attempts = 0) {
    if (callEnded && currentCallId !== callId) return; // Prevent polling if active call session changes
    
    if (attempts >= 60) { // 120 seconds max (60 attempts * 2 seconds)
        document.getElementById('finalNotesText').innerHTML = 'Summary generation timed out. You can still download the full transcript below.';
        document.getElementById('finalSummaryText').innerHTML = 'Could not generate summary at this time.';
        return;
    }

    try {
        const response = await fetch(`/api/summary/${callId}`);
        if (response.ok) {
            const summaryData = await response.json();
            const ready = isSummaryReady(summaryData);
            
            // Notes Text & Items
            document.getElementById('finalNotesText').textContent = summaryData.notes_text || 'No notes available';
            const finalNotesList = document.getElementById('finalNotesList');
            finalNotesList.innerHTML = '';
            if (summaryData.notes_items && Array.isArray(summaryData.notes_items)) {
                summaryData.notes_items.forEach((point) => {
                    const li = document.createElement('li');
                    li.textContent = point;
                    finalNotesList.appendChild(li);
                });
            }

            // Summary Text & Key Points
            document.getElementById('finalSummaryText').textContent = summaryData.summary_text || 'No summary available';
            const keyPointsList = document.getElementById('finalKeyPointsList');
            keyPointsList.innerHTML = '';
            if (summaryData.key_points && Array.isArray(summaryData.key_points)) {
                summaryData.key_points.forEach((point) => {
                    const li = document.createElement('li');
                    li.textContent = point;
                    keyPointsList.appendChild(li);
                });
            }

            if (ready) {
                showNotification('AI summary and notes loaded successfully!', 'success');
                return; // Finished polling!
            }

            console.log('Summary not ready yet, polling again...');
        }
    } catch (error) {
        console.warn('Error polling summary:', error);
    }

    // Try again after 2 seconds
    setTimeout(() => {
        pollForSummary(callId, attempts + 1);
    }, 2000);
}


// Download Transcript
function downloadTranscript() {
    let content = 'CALL TRANSCRIPT\n';
    content += '===============\n\n';

    transcriptMessages.forEach(msg => {
        content += `${msg.speaker}: ${msg.message}\n\n`;
    });

    downloadFile(content, `transcript-${currentCallCode}.txt`);
}

// Download Summary
async function downloadSummary() {
    try {
        const response = await fetch(`/api/summary/${currentCallId}`);
        const data = await response.json();

        let content = 'CALL SUMMARY\n';
        content += '============\n\n';
        content += `Call Code: ${currentCallCode}\n\n`;
        content += 'Summary:\n';
        content += (data.summary_text || 'No summary available') + '\n\n';

        if (data.key_points && Array.isArray(data.key_points)) {
            content += 'Key Points:\n';
            data.key_points.forEach(point => {
                content += `• ${point}\n`;
            });
        }

        downloadFile(content, `summary-${currentCallCode}.txt`);
    } catch (error) {
        console.error('Error downloading summary:', error);
        showNotification('Failed to download summary', 'error');
    }
}

// Download File Helper
function downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
}

// UI Helpers
function showLoading(show, text = 'Loading...') {
    const spinner = document.getElementById('loadingSpinner');
    const loadingText = document.getElementById('loadingText');

    if (show) {
        spinner.style.display = 'flex';
        loadingText.textContent = text;
    } else {
        spinner.style.display = 'none';
    }
}

function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification show ${type}`;

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function resetFormData() {
    document.getElementById('createCallForm').reset();
    document.getElementById('joinCallForm').reset();
    transcriptMessages = [];
    seenTranscriptKeys.clear();
    document.getElementById('transcriptMessages').innerHTML =
        '<p class="placeholder">Conversation will appear here...</p>';
    const interim = document.getElementById('interimTranscript');
    if (interim) interim.textContent = '';
    document.getElementById('summaryText').innerHTML =
        '<p class="placeholder">Say "show summary" or tap Summary tab...</p>';
    document.getElementById('notesText').innerHTML =
        '<p class="placeholder">Say "show notes" or tap Notes tab to generate...</p>';
    document.getElementById('keyPointsList').innerHTML = '';
    document.getElementById('notesList').innerHTML = '';
    hideSidePanel();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeSocket();
});

// Global variables for WebRTC access in HTML
window.toggleAudio = toggleAudio;
window.toggleVideo = toggleVideo;
window.toggleScreen = toggleScreen;
window.endCall = endCall;
window.showHome = showHome;
window.showCreateCall = showCreateCall;
window.showJoinCall = showJoinCall;
window.copyCallCode = copyCallCode;
window.refreshSummary = refreshSummary;
window.refreshNotes = refreshNotes;
window.refreshAllInsights = refreshAllInsights;
window.showSidePanel = showSidePanel;
window.hideSidePanel = hideSidePanel;
window.toggleSidePanel = toggleSidePanel;
window.switchSidePanelTab = switchSidePanelTab;
window.sendTranscriptToServer = sendTranscriptToServer;
window.updateInterimTranscript = updateInterimTranscript;
window.downloadTranscript = downloadTranscript;
window.downloadSummary = downloadSummary;
window.createCall = createCall;
window.joinCall = joinCall;
window.checkDevicesAgain = checkDevicesAgain;
window.proceedWithCall = proceedWithCall;
