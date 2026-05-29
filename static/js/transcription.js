// Live speech-to-text for calls

let speechRecognition = null;
let isTranscribing = false;
let activeSpeakerName = 'You';
let lastTranscriptIndex = 0;
let lastSentTranscript = '';

function getSpeechRecognitionClass() {
    return window.SpeechRecognition || window.webkitSpeechRecognition;
}

function createRecognitionInstance() {
    const SpeechRecognition = getSpeechRecognitionClass();
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;  // Changed to false to avoid repetition
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        console.log('[Transcription] Recognition started.');
        lastTranscriptIndex = 0;
    };

    recognition.onresult = (event) => {
        let interimText = '';
        let finalText = '';

        // Process results starting from where we left off
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const transcript = result[0].transcript.trim();

            if (result.isFinal) {
                finalText += transcript + ' ';
            } else {
                interimText += transcript + ' ';
            }
        }

        // Send only new final results to server (avoid duplicates)
        finalText = finalText.trim();
        if (finalText && finalText !== lastSentTranscript) {
            if (typeof sendTranscriptToServer === 'function') {
                sendTranscriptToServer(activeSpeakerName, finalText);
            }
            lastSentTranscript = finalText;
        }

        // Update interim display
        if (typeof updateInterimTranscript === 'function') {
            updateInterimTranscript(activeSpeakerName, interimText.trim());
        }
    };

    recognition.onerror = (event) => {
        console.warn('[Transcription] Error:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            showNotification('Microphone permission is required for transcription.', 'error');
            stopLiveTranscription();
        } else if (event.error === 'no-speech') {
            // Don't restart on no-speech, just wait for user to continue
            console.log('[Transcription] No speech detected, waiting...');
            if (isTranscribing) {
                setTimeout(() => {
                    if (isTranscribing && speechRecognition) {
                        try {
                            speechRecognition.start();
                        } catch (e) {
                            console.warn('[Transcription] Could not restart:', e);
                        }
                    }
                }, 1000);
            }
        } else if (isTranscribing) {
            restartLiveTranscription();
        }
    };

    recognition.onend = () => {
        if (isTranscribing) {
            console.log('[Transcription] Recognition ended, restarting...');
            // Small delay before restart to prevent rapid cycling
            setTimeout(() => {
                if (isTranscribing) {
                    restartLiveTranscription();
                }
            }, 100);
        }
    };

    return recognition;
}

function startLiveTranscription(speakerName) {
    const SpeechRecognition = getSpeechRecognitionClass();
    if (!SpeechRecognition) {
        showNotification('Speech recognition is not supported in this browser.', 'warning');
        return;
    }

    if (isTranscribing) return;
    activeSpeakerName = speakerName || 'You';
    isTranscribing = true;
    lastSentTranscript = '';

    if (speechRecognition) {
        try {
            speechRecognition.stop();
        } catch (err) {
            console.warn('[Transcription] Stopping old instance:', err);
        }
        speechRecognition = null;
    }

    speechRecognition = createRecognitionInstance();
    if (speechRecognition) {
        try {
            speechRecognition.start();
        } catch (err) {
            console.warn('[Transcription] Could not start recognition:', err);
            isTranscribing = false;
        }
    } else {
        isTranscribing = false;
    }
}

function stopLiveTranscription() {
    isTranscribing = false;
    lastSentTranscript = '';
    if (speechRecognition) {
        try {
            speechRecognition.stop();
        } catch (err) {
            console.warn('[Transcription] stop error:', err);
        }
        speechRecognition = null;
    }
    // Clear interim display
    const interim = document.getElementById('interimTranscript');
    if (interim) interim.textContent = '';
}

function restartLiveTranscription() {
    if (!isTranscribing) return;
    console.log('[Transcription] Restarting recognition...');
    
    try {
        if (speechRecognition) {
            speechRecognition.stop();
        }
    } catch (err) {
        console.warn('[Transcription] restart stop error:', err);
    }
    
    speechRecognition = null;
    
    // Wait a moment then create and start a fresh instance
    setTimeout(() => {
        if (isTranscribing) {
            console.log('[Transcription] Creating fresh recognition instance...');
            lastSentTranscript = '';  // Reset tracking
            speechRecognition = createRecognitionInstance();
            if (speechRecognition) {
                try {
                    speechRecognition.start();
                    console.log('[Transcription] Fresh instance started successfully');
                } catch (err) {
                    console.warn('[Transcription] Could not start fresh instance:', err);
                }
            }
        }
    }, 300);
}

function startCallTranscription(speakerName) {
    startLiveTranscription(speakerName);
}

window.startCallTranscription = startCallTranscription;
window.stopLiveTranscription = stopLiveTranscription;

