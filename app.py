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
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '/path/to/your/google-credentials.json'

app = Flask(__name__, static_url_path='/static')
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key')  # Use environment variable

# PostgreSQL configuration
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://translator:L4p0can397@localhost:5432/translation_app'
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
        username = request.form.get('username')
        password = request.form.get('password')
        
        user = User.query.filter_by(username=username).first()
        
        if user and check_password_hash(user.password, password):
            login_user(user)
            return redirect(url_for('admin'))
        else:
            flash('Invalid username or password', 'error')
    
    return render_template('login.html')

@app.route('/admin')
@login_required
def admin():
    rooms = Room.query.all()
    return render_template('admin.html', rooms=rooms, languages=LANGUAGES)

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
    history = TranscriptionHistory.query.filter_by(room_id=room_id).order_by(TranscriptionHistory.timestamp.desc()).all()
    languages = {
        'en': 'English',
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German',
        'it': 'Italian',
        'pt': 'Portuguese',
        'nl': 'Dutch',
        'pl': 'Polish',
        'ru': 'Russian',
        'ja': 'Japanese',
        'ko': 'Korean',
        'zh': 'Chinese',
        'ar': 'Arabic',
        'hi': 'Hindi',
        'tr': 'Turkish'
    }
    return render_template('room.html', room=room, history=history, languages=languages)

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

@socketio.on('translate_text')
def handle_translation(data):
    room_id = data.get('room_id')
    original_text = data.get('text')
    source_lang = data.get('source_lang', 'auto')
    target_lang = data.get('target_lang', 'en')

    # Perform translation
    translation = translate_text(original_text, target_lang)

    # Save to database
    with app.app_context():
        history = TranscriptionHistory(
            room_id=room_id,
            original_text=original_text,
            translated_text=translation,
            source_language=source_lang,
            target_language=target_lang
        )
        db.session.add(history)
        db.session.commit()

    # Emit the translation
    emit('translation', {
        'original': original_text,
        'translated': translation,
        'timestamp': datetime.now().strftime('%H:%M:%S')
    }, room=room_id)

@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You have been logged out successfully.', 'success')
    return redirect(url_for('login'))

@app.route('/api/rooms/<room_id>', methods=['DELETE'])
@login_required
def delete_room(room_id):
    try:
        room = Room.query.get_or_404(room_id)
        
        # Delete associated transcription history first
        TranscriptionHistory.query.filter_by(room_id=room.id).delete()
        
        # Delete the room
        db.session.delete(room)
        db.session.commit()
        
        return jsonify({'message': 'Room deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

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