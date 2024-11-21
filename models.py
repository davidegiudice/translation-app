from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin

db = SQLAlchemy()

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(500), nullable=False)
    rooms = db.relationship('Room', backref='owner', lazy=True)

    def get_id(self):
        return str(self.id)

class Room(db.Model):
    id = db.Column(db.String(36), primary_key=True)  # UUID
    name = db.Column(db.String(100), nullable=False)
    source_language = db.Column(db.String(10), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    history = db.relationship('TranscriptionHistory', backref='room', lazy=True, 
                            cascade='all, delete-orphan')

class TranscriptionHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.String(36), db.ForeignKey('room.id', ondelete='CASCADE'), nullable=False)
    original_text = db.Column(db.Text, nullable=False)
    translations = db.Column(db.JSON)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow) 