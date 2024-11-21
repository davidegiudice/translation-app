document.addEventListener('DOMContentLoaded', function() {
    initializeAdminInterface();
    checkEmptyRooms();
});

function initializeAdminInterface() {
    // Handle room creation form
    const createRoomForm = document.getElementById('createRoomForm');
    if (createRoomForm) {
        createRoomForm.addEventListener('submit', handleRoomCreation);
    }

    // Initialize tooltips if using Bootstrap
    if (typeof bootstrap !== 'undefined') {
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });
    }
}

async function handleRoomCreation(e) {
    e.preventDefault();
    
    try {
        const formData = {
            room_name: document.getElementById('room_name').value,
            source_language: document.getElementById('source_language').value
        };

        console.log('Creating room with data:', formData); // Debug log

        const response = await fetch('/api/rooms', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();
        console.log('Server response:', data); // Debug log
        
        if (data.success) {
            showNotification('Room created successfully!', 'success');
            // Force a complete page reload from the server
            window.location.href = window.location.href;
        } else {
            showNotification(data.error || 'Failed to create room', 'error');
        }
    } catch (error) {
        console.error('Error creating room:', error);
        showNotification('Error creating room: ' + error.message, 'error');
    }
}

function deleteRoom(roomId) {
    if (confirm('Are you sure you want to delete this room?')) {
        fetch(`/api/rooms/${roomId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'same-origin'
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            // Remove the room element from the DOM
            const roomElement = document.querySelector(`[data-room-id="${roomId}"]`);
            if (roomElement) {
                roomElement.remove();
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Failed to delete room. Please try again.');
        });
    }
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} notification`;
    notification.role = 'alert';
    notification.textContent = message;

    // Add to document
    const container = document.querySelector('.container');
    container.insertBefore(notification, container.firstChild);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Add some CSS for notifications
const style = document.createElement('style');
style.textContent = `
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
        min-width: 250px;
    }

    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);

// Add this function to check if rooms exist and display a message if none
function checkEmptyRooms() {
    const roomsGrid = document.querySelector('.rooms-grid');
    if (roomsGrid && !roomsGrid.children.length) {
        roomsGrid.innerHTML = `
            <div class="no-rooms-message">
                <p>No rooms created yet. Create your first room using the form on the left.</p>
            </div>
        `;
    }
} 