from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from flask_login import LoginManager, login_user, login_required, logout_user, current_user
from flask_migrate import Migrate
from google.cloud import speech, translate
import os
from datetime import datetime
from flask_socketio import SocketIO, emit, join_room, leave_room
from google.cloud import speech_v1
from google.cloud import translate_v2 as translate
from werkzeug.security import generate_password_hash, check_password_hash
import uuid
from models import db, User, Room, TranscriptionHistory

# Set Google Cloud credentials
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '/Users/davidegiudice/Downloads/works-273717-7ff9fd2d7ef4.json'

app = Flask(__name__, static_url_path='/static')
app.config['SECRET_KEY'] = 'your-secret-key'  # Change this to a secure key

# PostgreSQL configuration
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://username:password@localhost:5432/translation_app'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize extensions
db.init_app(app)
migrate = Migrate(app, db)
socketio = SocketIO(app, cors_allowed_origins="*")
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# Available languages
LANGUAGES = {
    'en': 'English',
    'es': 'Spanish',
    'it': 'Italian',
    'fr': 'French',
    'de': 'German'
}

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@app.route('/')
def index():
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        user = User.query.filter_by(username=request.form['username']).first()
        if user and check_password_hash(user.password, request.form['password']):
            login_user(user)
            return redirect(url_for('admin'))
        flash('Invalid username or password', 'error')
    return render_template('login.html')

@app.route('/admin')
@login_required
def admin():
    rooms = Room.query.filter_by(owner_id=current_user.id).order_by(Room.created_at.desc()).all()
    return render_template('admin.html', languages=LANGUAGES, rooms=rooms)

@app.route('/api/rooms', methods=['POST'])
@login_required
def create_room():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        room = Room(
            id=str(uuid.uuid4()),
            name=data['room_name'],
            source_language=data['source_language'],
            owner_id=current_user.id
        )
        
        db.session.add(room)
        db.session.commit()

        return jsonify({
            'room_id': room.id,
            'success': True
        })

    except Exception as e:
        db.session.rollback()
        print(f"Error creating room: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/room/<room_id>')
@login_required
def room(room_id):
    room = Room.query.get_or_404(room_id)
    if room.owner_id != current_user.id:
        flash('Unauthorized', 'error')
        return redirect(url_for('admin'))
    
    return render_template('room.html', 
                         room=room,
                         room_id=room_id,
                         languages=LANGUAGES)

@app.route('/view/<room_id>')
def view_room(room_id):
    room = Room.query.get_or_404(room_id)
    return render_template('viewer.html', 
                         room=room,
                         room_id=room_id,
                         languages=LANGUAGES)

@socketio.on('join_room')
def on_join_room(data):
    room_id = data['room']
    join_room(room_id)
    room = Room.query.get(room_id)
    if room:
        history = [{
            'timestamp': h.timestamp.strftime('%H:%M:%S'),
            'original': h.original_text,
            'translations': h.translations
        } for h in room.history]
        emit('room_history', {'history': history})

@socketio.on('transcript')
def handle_transcript(data):
    room_id = data['room']
    text = data['text']
    is_interim = data.get('isInterim', False)
    
    room = Room.query.get(room_id)
    if not room:
        return
    
    try:
        # Initialize translation client
        translate_client = translate.Client()
        
        # Translate to all supported languages
        translations = {}
        for target_language in LANGUAGES.keys():
            if target_language != room.source_language:
                result = translate_client.translate(
                    text,
                    target_language=target_language,
                    source_language=room.source_language
                )
                translations[target_language] = result['translatedText']
        
        current_time = datetime.utcnow()
        
        # Store in history if it's a final transcript
        if not is_interim:
            history = TranscriptionHistory(
                room_id=room_id,
                original_text=text,
                translations=translations,
                timestamp=current_time
            )
            db.session.add(history)
            db.session.commit()
        
        # Emit updates to all clients in the room
        emit('transcript_update', {
            'original': text,
            'translations': translations,
            'isInterim': is_interim,
            'timestamp': current_time.strftime('%H:%M:%S')
        }, room=room_id)
        
    except Exception as e:
        print(f"Translation error: {str(e)}")
        db.session.rollback()

@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You have been logged out successfully.', 'success')
    return redirect(url_for('login'))

# Create initial admin user
def create_admin_user():
    with app.app_context():
        db.create_all()
        if not User.query.filter_by(username="admin").first():
            admin = User(
                username="admin",
                password=generate_password_hash("L1n3check2024")
            )
            db.session.add(admin)
            db.session.commit()

if __name__ == '__main__':
    create_admin_user()
    socketio.run(app, debug=True)