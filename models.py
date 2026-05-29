from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import uuid
import hashlib

db = SQLAlchemy()

class Call(db.Model):
    __tablename__ = 'calls'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    call_code = db.Column(db.String(20), unique=True, nullable=False, index=True)
    creator_name = db.Column(db.String(255), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    started_at = db.Column(db.DateTime)
    ended_at = db.Column(db.DateTime)
    status = db.Column(db.String(20), default='waiting')  # waiting, active, ended
    
    # Relationships
    participants = db.relationship('Participant', back_populates='call', cascade='all, delete-orphan')
    transcript = db.relationship('Transcript', back_populates='call', uselist=False, cascade='all, delete-orphan')
    summary = db.relationship('Summary', back_populates='call', uselist=False, cascade='all, delete-orphan')
    
    def set_password(self, password):
        """Hash and set the password"""
        self.password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    def check_password(self, password):
        """Check if the provided password matches the hash"""
        return self.password_hash == hashlib.sha256(password.encode()).hexdigest()
    
    def to_dict(self):
        return {
            'id': self.id,
            'call_code': self.call_code,
            'creator_name': self.creator_name,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'status': self.status,
            'participant_count': len(self.participants)
        }

class Participant(db.Model):
    __tablename__ = 'participants'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    call_id = db.Column(db.String(36), db.ForeignKey('calls.id'), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    session_id = db.Column(db.String(255), nullable=False)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)
    left_at = db.Column(db.DateTime)
    
    # Relationships
    call = db.relationship('Call', back_populates='participants')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'joined_at': self.joined_at.isoformat() if self.joined_at else None
        }

class Transcript(db.Model):
    __tablename__ = 'transcripts'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    call_id = db.Column(db.String(36), db.ForeignKey('calls.id'), nullable=False, unique=True)
    full_transcript = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    call = db.relationship('Call', back_populates='transcript')
    messages = db.relationship('TranscriptMessage', back_populates='transcript', cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'call_id': self.call_id,
            'full_transcript': self.full_transcript,
            'message_count': len(self.messages),
            'messages': [m.to_dict() for m in sorted(self.messages, key=lambda x: x.sequence or 0)]
        }

class TranscriptMessage(db.Model):
    __tablename__ = 'transcript_messages'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    transcript_id = db.Column(db.String(36), db.ForeignKey('transcripts.id'), nullable=False)
    speaker_name = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    sequence = db.Column(db.Integer)
    
    # Relationships
    transcript = db.relationship('Transcript', back_populates='messages')
    
    def to_dict(self):
        return {
            'id': self.id,
            'speaker_name': self.speaker_name,
            'message': self.message,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None
        }

class Summary(db.Model):
    __tablename__ = 'summaries'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    call_id = db.Column(db.String(36), db.ForeignKey('calls.id'), nullable=False, unique=True)
    summary_text = db.Column(db.Text)
    key_points = db.Column(db.JSON)  # Store as JSON array
    action_items = db.Column(db.JSON)
    notes_text = db.Column(db.Text)
    notes_items = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    call = db.relationship('Call', back_populates='summary')
    
    def to_dict(self):
        return {
            'id': self.id,
            'call_id': self.call_id,
            'summary_text': self.summary_text,
            'key_points': self.key_points,
            'action_items': self.action_items,
            'notes_text': self.notes_text,
            'notes_items': self.notes_items
        }
