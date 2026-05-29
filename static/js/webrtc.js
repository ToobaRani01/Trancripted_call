// WebRTC Configuration
const peerConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' }
    ]
};

let localStream = null;
let remoteStream = null;
let peerConnection = null;
let socket = null;

// Device check states
let deviceCheckState = {
    camera: false,
    microphone: false,
    cameraTested: false,
    micTested: false
};

// Check actual device availability
async function checkAndTestDevice(kind) {
    try {
        console.log('Testing device:', kind);
        const constraints = kind === 'video' ? 
            { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false } :
            { audio: { echoCancellation: true, noiseSuppression: true }, video: false };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Stop the stream immediately
        stream.getTracks().forEach(track => track.stop());
        
        console.log(kind, 'device available and working');
        return true;
    } catch (error) {
        console.error('Device test failed for', kind, ':', error);
        return false;
    }
}

// Initialize WebRTC with proper error handling
async function initializeWebRTC() {
    try {
        console.log('Initializing WebRTC...');

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showNotification('Your browser does not support video calls', 'error');
            return false;
        }

        // Get local media stream with proper constraints
        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000
            }
        };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('Media stream obtained successfully');

        // Set local video
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.play().catch(err => console.warn('Auto-play prevented:', err));
        }

        return true;
    } catch (error) {
        console.error('Error accessing media devices:', error);
        
        let errorMessage = 'Cannot access camera/microphone. Please check permissions.';
        
        if (error.name === 'NotAllowedError') {
            errorMessage = 'Permission denied. Please allow camera and microphone access in browser settings.';
        } else if (error.name === 'NotFoundError') {
            errorMessage = 'Camera or microphone not found. Please check your devices.';
        } else if (error.name === 'NotReadableError') {
            errorMessage = 'Could not access camera/microphone. They may be in use by another application.';
        }
        
        showNotification(errorMessage, 'error');
        return false;
    }
}

// Create peer connection
function createPeerConnection(callId, participantId) {
    try {
        console.log('Creating peer connection...');
        peerConnection = new RTCPeerConnection({ iceServers: peerConfig.iceServers });

        // Add local tracks
        if (localStream) {
            localStream.getTracks().forEach(track => {
                console.log('Adding local track:', track.kind);
                peerConnection.addTrack(track, localStream);
            });
        }

        // Handle remote stream
        peerConnection.ontrack = (event) => {
            console.log('Received remote track:', event.track.kind);
            remoteStream = event.streams[0];
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo) {
                remoteVideo.srcObject = remoteStream;
                remoteVideo.play().catch(err => console.warn('Remote autoplay prevented:', err));
            }
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('Sending ICE candidate');
                if (socket) {
                    socket.emit('ice-candidate', {
                        call_id: callId,
                        participant_id: participantId,
                        candidate: event.candidate
                    });
                }
            }
        };

        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'failed') {
                showNotification('Connection lost. Attempting to reconnect...', 'error');
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE Connection state:', peerConnection.iceConnectionState);
        };

        peerConnection.onsignalingstatechange = () => {
            console.log('Signaling state:', peerConnection.signalingState);
        };

        return true;
    } catch (error) {
        console.error('Error creating peer connection:', error);
        showNotification('Error creating connection: ' + error.message, 'error');
        return false;
    }
}

// Create and send offer
async function createAndSendOffer(callId, participantId) {
    try {
        if (!peerConnection) {
            console.error('Peer connection not initialized');
            return false;
        }

        console.log('Creating offer...');
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });

        await peerConnection.setLocalDescription(offer);
        console.log('Sending offer');

        if (socket) {
            socket.emit('offer', {
                call_id: callId,
                participant_id: participantId,
                offer: offer
            });
        }
        return true;
    } catch (error) {
        console.error('Error creating offer:', error);
        showNotification('Error creating call offer: ' + error.message, 'error');
        return false;
    }
}

// Handle incoming offer
async function handleOffer(offer) {
    try {
        if (!peerConnection) {
            console.error('Peer connection not initialized');
            return false;
        }

        console.log('Handling offer, signaling state:', peerConnection.signalingState);

        if (peerConnection.signalingState !== 'stable') {
            console.warn('Ignoring offer, signalingState not stable');
            return false;
        }

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        // Create answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        if (socket) {
            socket.emit('answer', {
                call_id: window.currentCallId,
                participant_id: window.currentParticipantId,
                answer: answer
            });
        }
        return true;
    } catch (error) {
        console.error('Error handling offer:', error);
        showNotification('Error handling call offer: ' + error.message, 'error');
        return false;
    }
}

// Handle incoming answer
async function handleAnswer(answer) {
    try {
        if (!peerConnection) {
            console.error('Peer connection not initialized');
            return false;
        }

        console.log('Handling answer, signaling state:', peerConnection.signalingState);

        if (peerConnection.signalingState !== 'have-local-offer') {
            console.warn('Ignoring answer, signalingState not have-local-offer');
            return false;
        }

        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('Remote answer set successfully');
        return true;
    } catch (error) {
        console.error('Error handling answer:', error);
        showNotification('Error handling call answer: ' + error.message, 'error');
        return false;
    }
}

// Handle ICE candidate
async function handleIceCandidate(candidate) {
    try {
        if (!peerConnection) {
            console.error('Peer connection not initialized');
            return false;
        }

        if (candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
        return true;
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
        return false;
    }
}

// Toggle audio
function toggleAudio() {
    if (!localStream) {
        showNotification('Media stream not available', 'error');
        return;
    }

    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) {
        showNotification('No audio track available', 'error');
        return;
    }

    const isEnabled = audioTracks[0].enabled;
    audioTracks.forEach(track => {
        track.enabled = !isEnabled;
    });

    const btn = document.getElementById('toggleAudio');
    if (btn) {
        btn.classList.toggle('muted', !audioTracks[0].enabled);
        showNotification(audioTracks[0].enabled ? '🎤 Microphone On' : '🔇 Microphone Off', 'success');
    }

    console.log('Audio tracks toggled:', audioTracks[0].enabled);
}

// Toggle video
function toggleVideo() {
    if (!localStream) {
        showNotification('Media stream not available', 'error');
        return;
    }

    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length === 0) {
        showNotification('No video track available', 'error');
        return;
    }

    const isEnabled = videoTracks[0].enabled;
    videoTracks.forEach(track => {
        track.enabled = !isEnabled;
    });

    const btn = document.getElementById('toggleVideo');
    if (btn) {
        btn.classList.toggle('muted', !videoTracks[0].enabled);
        showNotification(videoTracks[0].enabled ? '📹 Camera On' : '📹 Camera Off', 'success');
    }

    console.log('Video tracks toggled:', videoTracks[0].enabled);
}

// Toggle screen share
async function toggleScreen() {
    try {
        if (!peerConnection || !localStream) {
            showNotification('Call not active', 'error');
            return;
        }

        const videoTrack = localStream.getVideoTracks()[0];
        if (!videoTrack) {
            showNotification('No video track available', 'error');
            return;
        }

        const isScreenShare = videoTrack.label.includes('screen');

        if (isScreenShare) {
            // Switch back to camera
            console.log('Switching from screen to camera');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            });

            const cameraTrack = stream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                await sender.replaceTrack(cameraTrack);
                videoTrack.stop();
                localStream.removeTrack(videoTrack);
                localStream.addTrack(cameraTrack);
                showNotification('Switched to camera', 'success');
            }
        } else {
            // Share screen
            console.log('Starting screen share');
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: false
            });

            const screenTrack = screenStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                await sender.replaceTrack(screenTrack);

                // Handle screen share stop
                screenTrack.onended = async () => {
                    console.log('Screen share ended');
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({
                            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                            audio: false
                        });
                        const cameraTrack = stream.getVideoTracks()[0];
                        await sender.replaceTrack(cameraTrack);
                        localStream.removeTrack(screenTrack);
                        localStream.addTrack(cameraTrack);
                        showNotification('Switched back to camera', 'success');
                    } catch (err) {
                        console.error('Error switching back:', err);
                    }
                };
                showNotification('Screen sharing started', 'success');
            }
        }
    } catch (error) {
        console.error('Screen share error:', error);
        if (error.name === 'NotAllowedError') {
            showNotification('Screen share cancelled', 'warning');
        } else {
            showNotification('Screen share error: ' + error.message, 'error');
        }
    }
}

// Cleanup WebRTC
function cleanupWebRTC() {
    try {
        console.log('Cleaning up WebRTC...');

        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }

        if (localStream) {
            localStream.getTracks().forEach(track => {
                console.log('Stopping track:', track.kind);
                track.stop();
            });
            localStream = null;
        }

        remoteStream = null;

        const localVideo = document.getElementById('localVideo');
        const remoteVideo = document.getElementById('remoteVideo');
        if (localVideo) localVideo.srcObject = null;
        if (remoteVideo) remoteVideo.srcObject = null;

        console.log('WebRTC cleanup complete');
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
}

// Global exports
window.toggleAudio = toggleAudio;
window.toggleVideo = toggleVideo;
window.toggleScreen = toggleScreen;
window.cleanupWebRTC = cleanupWebRTC;
window.checkAndTestDevice = checkAndTestDevice;
