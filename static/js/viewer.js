const room_id = document.currentScript.getAttribute('data-room-id');
let transcriptionHistory = [];

// Initialize socket connection
const socket = io();
socket.emit('join_room', { room: room_id });

// Handle toggle between views
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

// Handle room history
socket.on('room_history', (data) => {
    console.log('Received room history:', data.history);
    transcriptionHistory = data.history.map(item => ({
        timestamp: item.timestamp,
        text: item.original,
        translations: item.translations
    }));
    updateHistoryDisplay();
});

// Handle live updates
socket.on('transcript_update', (data) => {
    const selectedLanguage = document.getElementById('languageSelect').value;
    
    if (data.isInterim) {
        updateInterimText(data.original);
        if (data.translations && data.translations[selectedLanguage]) {
            updateInterimText(data.translations[selectedLanguage], true);
        }
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
});

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

// Handle language selection changes
document.getElementById('languageSelect').addEventListener('change', updateHistoryDisplay); 