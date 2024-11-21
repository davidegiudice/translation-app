let recognition;
let isRecording = false;
let transcriptionHistory = [];
let lastPhraseTimestamp = 0;
let interimTimeout = null;
const PAUSE_THRESHOLD = 1000;

// Initialize socket connection
const socket = io({
    path: '/socket.io',
    transports: ['websocket'],
    upgrade: false
});
const room_id = document.getElementById('room_id').value;

document.addEventListener('DOMContentLoaded', function() {
    initializeAudioDevices();
    socket.emit('join_room', { room: room_id });
    initializeEventListeners();
});

async function initializeAudioDevices() {
    try {
        // First request microphone permission
        await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Then enumerate devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        
        const audioSelect = document.getElementById('audioSource');
        audioSelect.innerHTML = ''; // Clear existing options
        
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = 'default';
        defaultOption.text = 'Default Microphone';
        audioSelect.appendChild(defaultOption);
        
        // Add all available microphones
        audioInputs.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Microphone ${audioSelect.length + 1}`;
            audioSelect.appendChild(option);
        });

        console.log('Audio devices initialized:', audioInputs.length, 'devices found');
    } catch (error) {
        console.error('Error initializing audio devices:', error);
        const audioSelect = document.getElementById('audioSource');
        const errorOption = document.createElement('option');
        errorOption.text = 'Error accessing microphone';
        audioSelect.appendChild(errorOption);
        audioSelect.disabled = true;
    }
}

function initializeEventListeners() {
    // Toggle view listeners
    document.querySelectorAll('.toggle-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.toggle-option').forEach(opt => 
                opt.classList.remove('active'));
            this.classList.add('active');

            const viewToShow = this.getAttribute('data-view');
            document.getElementById('transcriptView').style.display = 
                viewToShow === 'transcript' ? 'block' : 'none';
            document.getElementById('translationView').style.display = 
                viewToShow === 'translation' ? 'block' : 'none';
        });
    });

    // Recording control listeners
    document.getElementById('startButton').addEventListener('click', startRecording);
    document.getElementById('stopButton').addEventListener('click', stopRecording);
    
    // Language selection listener
    document.getElementById('languageSelect').addEventListener('change', updateHistoryDisplay);

    // Device change listener
    navigator.mediaDevices.addEventListener('devicechange', initializeAudioDevices);
}

async function startRecording() {
    console.log('Start recording clicked');
    if (isRecording) return;

    try {
        const audioSource = document.getElementById('audioSource').value;
        const sourceLanguage = document.getElementById('sourceLanguage').dataset.sourceLanguage;
        
        const constraints = {
            audio: {
                deviceId: audioSource !== 'default' ? { exact: audioSource } : undefined,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        };

        console.log('Starting recording with constraints:', constraints);
        await navigator.mediaDevices.getUserMedia(constraints);

        recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = sourceLanguage;

        recognition.onresult = handleRecognitionResult;
        recognition.onend = handleRecognitionEnd;
        recognition.onerror = handleRecognitionError;

        recognition.start();
        isRecording = true;
        updateButtonsVisibility(true);
        console.log('Recording started successfully');

    } catch (error) {
        console.error('Error starting recording:', error);
        alert('Error accessing microphone. Please ensure you have granted microphone permissions.');
    }
}

function handleRecognitionResult(event) {
    clearTimeout(interimTimeout);
    let interimTranscript = '';
    let finalTranscript = '';
    
    const currentTime = Date.now();
    const timeSinceLastPhrase = currentTime - lastPhraseTimestamp;

    for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
            finalTranscript += transcript;
        } else {
            interimTranscript += transcript;
        }
    }

    updateInterimText(interimTranscript);
    
    if (interimTranscript) {
        interimTimeout = setTimeout(() => {
            if (interimTranscript.trim()) {
                handleFinalTranscript(interimTranscript);
                updateInterimText('');
            }
        }, PAUSE_THRESHOLD);
    }

    if (finalTranscript) {
        handleFinalTranscript(finalTranscript);
    }

    lastPhraseTimestamp = currentTime;
}

function handleRecognitionEnd() {
    if (isRecording) {
        setTimeout(() => {
            recognition.start();
        }, 200);
    }
}

function handleRecognitionError(event) {
    console.error('Recognition error:', event.error);
}

function stopRecording() {
    console.log('Stop recording clicked');
    if (!isRecording) return;

    if (recognition) {
        recognition.stop();
    }
    
    isRecording = false;
    updateButtonsVisibility(false);
    console.log('Recording stopped');
}

function updateButtonsVisibility(isRecording) {
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    
    if (startButton && stopButton) {
        startButton.style.display = isRecording ? 'none' : 'block';
        stopButton.style.display = isRecording ? 'block' : 'none';
    }
}

function handleFinalTranscript(transcript) {
    if (transcript.trim().length < 2) return;

    let cleanTranscript = transcript.trim();
    cleanTranscript = cleanTranscript.charAt(0).toUpperCase() + cleanTranscript.slice(1);
    if (!cleanTranscript.match(/[.!?]$/)) {
        cleanTranscript += '.';
    }

    socket.emit('transcript', {
        room: room_id,
        text: cleanTranscript,
        isInterim: false
    });
}

function updateHistoryDisplay() {
    const transcriptHistory = document.querySelector('#transcript .history');
    const translationHistory = document.querySelector('#translation .history');
    const selectedLanguage = document.getElementById('languageSelect').value;
    
    if (transcriptHistory && translationHistory) {
        const transcriptHTML = transcriptionHistory
            .map(item => `
                <div class="history-item">
                    <span class="timestamp">${item.timestamp}</span>
                    <span class="text">${item.text}</span>
                </div>
            `)
            .join('');
        
        const translationHTML = transcriptionHistory
            .map(item => {
                const translation = item.translations?.[selectedLanguage];
                return translation ? `
                    <div class="history-item">
                        <span class="timestamp">${item.timestamp}</span>
                        <span class="text">${translation}</span>
                    </div>
                ` : '';
            })
            .join('');

        transcriptHistory.innerHTML = transcriptHTML;
        translationHistory.innerHTML = translationHTML;
    }
}

function updateInterimText(text, isTranslation = false) {
    const container = isTranslation ? 
        document.querySelector('#translation .interim') :
        document.querySelector('#transcript .interim');
    
    if (container) {
        container.textContent = text || '';
    }
}

// Socket event handlers
socket.on('room_history', (data) => {
    console.log('Received room history:', data.history);
    transcriptionHistory = data.history.map(item => ({
        timestamp: item.timestamp,
        text: item.original,
        translations: item.translations
    }));
    updateHistoryDisplay();
});

socket.on('transcript_update', (data) => {
    const selectedLanguage = document.getElementById('languageSelect').value;
    
    if (data.translations && data.translations[selectedLanguage]) {
        const translatedText = decodeHtml(data.translations[selectedLanguage]);
        
        if (data.isInterim) {
            updateInterimText(data.original);
            updateInterimText(translatedText, true);
        } else {
            updateInterimText('');
            updateInterimText('', true);
            
            transcriptionHistory.unshift({
                timestamp: data.timestamp,
                text: data.original,
                translations: data.translations
            });
            updateHistoryDisplay();
        }
    }
});

socket.on('translation', function(data) {
    const messagesDiv = document.getElementById('messages');
    const messageHtml = `
        <div class="message">
            <div class="original-text">${data.original}</div>
            <div class="translated-text">${data.translated}</div>
            <small class="timestamp">${data.timestamp}</small>
        </div>
    `;
    messagesDiv.innerHTML += messageHtml;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

// Utility function
function decodeHtml(html) {
    const txt = document.createElement('textarea');
    txt.innerHTML = html;
    return txt.value;
} 