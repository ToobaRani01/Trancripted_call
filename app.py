from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO, emit, join_room, leave_room
from config import Config
from models import db, Call, Participant, Transcript, TranscriptMessage, Summary
from utils import generate_unique_call_code, build_conversation_insights
from datetime import datetime
import json
import uuid

app = Flask(__name__)
app.config.from_object(Config)
app.secret_key = Config.SECRET_KEY

# Initialize extensions
db.init_app(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading', engineio_logger=False, socketio_logger=False)


def save_insights_to_summary(call_id, insights):
    """Persist summary and notes for a call."""
    summary = Summary.query.filter_by(call_id=call_id).first()
    if not summary:
        summary = Summary(call_id=call_id)
        db.session.add(summary)
    summary.summary_text = insights.get('summary', '')
    summary.key_points = insights.get('key_points', [])
    summary.action_items = insights.get('action_items', [])
    summary.notes_text = insights.get('notes_text', '')
    summary.notes_items = insights.get('notes_items', [])
    return summary


@app.before_request
def before_request():
    session.permanent = True
    app.permanent_session_lifetime = Config.PERMANENT_SESSION_LIFETIME

@app.after_request
def after_request(response):
    """Add CORS headers to response"""
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

@app.route('/')
def index():
    """Home page"""
    return render_template('index.html')

@app.route('/favicon.ico')
def favicon():
    return '', 204

@app.route('/api/create-call', methods=['POST'])
def create_call():
    """Create a new call"""
    try:
        data = request.json
        creator_name = data.get('creator_name', 'Anonymous')
        password = data.get('password', '')
        
        if not creator_name or not password:
            return jsonify({'error': 'Creator name and password required'}), 400
        
        # Generate unique call code
        existing_calls = Call.query.all()
        existing_codes = [c.call_code for c in existing_calls]
        call_code = generate_unique_call_code(existing_codes)
        
        # Create call
        call = Call(
            call_code=call_code,
            creator_name=creator_name,
            status='waiting'
        )
        call.set_password(password)
        
        db.session.add(call)
        db.session.commit()
        
        # Add creator as participant
        participant = Participant(
            call_id=call.id,
            name=creator_name,
            session_id=str(uuid.uuid4())
        )
        db.session.add(participant)
        
        # Create transcript for this call
        transcript = Transcript(call_id=call.id)
        db.session.add(transcript)
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'call_id': call.id,
            'call_code': call_code,
            'message': f'Call created successfully. Share code: {call_code}'
        }), 201
    except Exception as e:
        print(f"Error creating call: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/join-call', methods=['POST'])
def join_call():
    """Join an existing call"""
    try:
        data = request.json
        call_code = data.get('call_code', '').strip()
        participant_name = data.get('participant_name', 'Guest')
        password = data.get('password', '')
        
        if not call_code or not password:
            return jsonify({'error': 'Call code and password required'}), 400
        
        # Find call by code
        call = Call.query.filter_by(call_code=call_code).first()
        
        if not call:
            return jsonify({'error': 'Call not found'}), 404
        
        # Check password
        if not call.check_password(password):
            return jsonify({'error': 'Incorrect password'}), 401
        
        if call.status == 'ended':
            return jsonify({'error': 'This call has ended'}), 400
        
        # Add participant
        participant = Participant(
            call_id=call.id,
            name=participant_name,
            session_id=str(uuid.uuid4())
        )
        db.session.add(participant)
        
        # Update call status if not active
        if call.status == 'waiting' and len(call.participants) >= 1:
            call.status = 'active'
            call.started_at = datetime.utcnow()
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'call_id': call.id,
            'participant_id': participant.id,
            'call_info': call.to_dict()
        }), 200
    except Exception as e:
        print(f"Error joining call: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/call/<call_id>', methods=['GET'])
def get_call_info(call_id):
    """Get call information"""
    try:
        call = db.session.get(Call, call_id)
        if not call:
            return jsonify({'error': 'Call not found'}), 404
        
        transcript = Transcript.query.filter_by(call_id=call_id).first()
        summary = Summary.query.filter_by(call_id=call_id).first()
        
        return jsonify({
            'call': call.to_dict(),
            'participants': [p.to_dict() for p in call.participants],
            'transcript': transcript.to_dict() if transcript else None,
            'summary': summary.to_dict() if summary else None
        }), 200
    except Exception as e:
        print(f"Error getting call info: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/end-call/<call_id>', methods=['POST'])
def end_call(call_id):
    """End a call and generate summary synchronously."""
    try:
        call = db.session.get(Call, call_id)
        if not call:
            return jsonify({'error': 'Call not found'}), 404
        
        call.status = 'ended'
        call.ended_at = datetime.utcnow()
        
        transcript = Transcript.query.filter_by(call_id=call_id).first()
        transcript_text = transcript.full_transcript if transcript else ""
        
        insights = build_conversation_insights(transcript_text)
        summary = Summary.query.filter_by(call_id=call_id).first()
        if not summary:
            summary = Summary(call_id=call_id)
            db.session.add(summary)
        summary.summary_text = insights.get('summary', '')
        summary.key_points = insights.get('key_points', [])
        summary.action_items = insights.get('action_items', [])
        summary.notes_text = insights.get('notes_text', '')
        summary.notes_items = insights.get('notes_items', [])
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Call ended and summary is ready'
        }), 200
    except Exception as e:
        print(f"Error ending call: {e}")
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/api/transcript/<call_id>', methods=['GET'])
def get_transcript(call_id):
    """Get transcript for a call"""
    try:
        transcript = Transcript.query.filter_by(call_id=call_id).first()
        if not transcript:
            return jsonify({'error': 'Transcript not found'}), 404
        
        return jsonify(transcript.to_dict()), 200
    except Exception as e:
        print(f"Error getting transcript: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/summary/<call_id>', methods=['GET'])
def get_summary(call_id):
    """Get summary for a call"""
    try:
        summary = Summary.query.filter_by(call_id=call_id).first()
        if not summary:
            # If call exists but summary is not yet created, return a pending placeholder instead of 404.
            call = db.session.get(Call, call_id)
            if call:
                return jsonify({
                    'call_id': call_id,
                    'summary_text': 'Summary pending. Please wait while AI generates insights.',
                    'key_points': [],
                    'action_items': [],
                    'notes_text': 'Summary is being generated. Refresh after a few moments.',
                    'notes_items': []
                }), 200
            return jsonify({'error': 'Summary not found'}), 404
        
        return jsonify(summary.to_dict()), 200
    except Exception as e:
        print(f"Error getting summary: {e}")
        return jsonify({'error': str(e)}), 500

# ============ SocketIO Events ============

@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    print(f"Client connected: {request.sid}")
    emit('connection_response', {
        'data': 'Connected to server',
        'session_id': request.sid
    })

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    print(f"Client disconnected: {request.sid}")

@socketio.on('join_call_room')
def on_join_call_room(data):
    """Join a call room for real-time communication"""
    call_id = data.get('call_id')
    participant_id = data.get('participant_id')
    
    if call_id:
        join_room(call_id)
        print(f"Participant {participant_id} joined room {call_id}")
        
        emit('user_joined', {
            'participant_id': participant_id,
            'message': f'User joined the call'
        }, room=call_id)

@socketio.on('offer')
def handle_offer(data):
    """Handle WebRTC offer"""
    call_id = data.get('call_id')
    offer = data.get('offer')
    from_participant = data.get('participant_id')
    
    emit('offer', {
        'offer': offer,
        'from': from_participant
    }, room=call_id, skip_sid=request.sid)

@socketio.on('answer')
def handle_answer(data):
    """Handle WebRTC answer"""
    call_id = data.get('call_id')
    answer = data.get('answer')
    from_participant = data.get('participant_id')
    
    emit('answer', {
        'answer': answer,
        'from': from_participant
    }, room=call_id, skip_sid=request.sid)

@socketio.on('ice-candidate')
def handle_ice_candidate(data):
    """Handle ICE candidate"""
    call_id = data.get('call_id')
    candidate = data.get('candidate')
    
    emit('ice-candidate', {
        'candidate': candidate
    }, room=call_id, skip_sid=request.sid)

@socketio.on('add_transcript_message')
def handle_transcript_message(data):
    """Add a message to the transcript"""
    try:
        call_id = data.get('call_id')
        speaker_name = data.get('speaker_name', 'Unknown')
        message = data.get('message', '')
        
        call = db.session.get(Call, call_id)
        if not call:
            emit('error', {'message': 'Call not found'})
            return
        
        # Get or create transcript
        transcript = Transcript.query.filter_by(call_id=call_id).first()
        if not transcript:
            transcript = Transcript(call_id=call_id)
            db.session.add(transcript)
            db.session.commit()
        
        # Add message to transcript
        trans_msg = TranscriptMessage(
            transcript_id=transcript.id,
            speaker_name=speaker_name,
            message=message,
            sequence=len(transcript.messages)
        )
        db.session.add(trans_msg)
        
        # Update full transcript
        transcript.full_transcript += f"\n{speaker_name}: {message}"
        
        db.session.commit()
        
        # Emit to all users in the call
        emit('transcript_updated', {
            'speaker': speaker_name,
            'message': message,
            'timestamp': trans_msg.timestamp.isoformat()
        }, room=call_id)
        
    except Exception as e:
        print(f"Error adding transcript message: {e}")
        emit('error', {'message': str(e)})

@socketio.on('get_live_summary')
def handle_get_live_summary(data):
    """Get live summary and notes of current transcript"""
    try:
        call_id = data.get('call_id')
        transcript = Transcript.query.filter_by(call_id=call_id).first()
        if not transcript or not transcript.full_transcript:
            emit('live_summary', {
                'summary': 'No conversation yet...',
                'key_points': [],
                'action_items': [],
                'notes_text': '',
                'notes_items': []
            })
            return

        insights = build_conversation_insights(transcript.full_transcript)
        emit('live_summary', insights)

    except Exception as e:
        print(f"Error getting live summary: {e}")
        emit('error', {'message': str(e)})


@socketio.on('get_live_notes')
def handle_get_live_notes(data):
    """Get live notes only."""
    try:
        call_id = data.get('call_id')
        transcript = Transcript.query.filter_by(call_id=call_id).first()
        if not transcript or not transcript.full_transcript:
            emit('live_notes', {'notes_text': '', 'notes_items': []})
            return

        insights = build_conversation_insights(transcript.full_transcript)
        emit('live_notes', {
            'notes_text': insights.get('notes_text', ''),
            'notes_items': insights.get('notes_items', [])
        })
    except Exception as e:
        print(f"Error getting live notes: {e}")
        emit('error', {'message': str(e)})

@socketio.on('leave_call')
def handle_leave_call(data):
    """Handle user leaving call"""
    call_id = data.get('call_id')
    participant_id = data.get('participant_id')
    
    try:
        participant = db.session.get(Participant, participant_id)
        if participant:
            participant.left_at = datetime.utcnow()
            db.session.commit()
        
        leave_room(call_id)
        emit('user_left', {
            'participant_id': participant_id,
            'message': 'User left the call'
        }, room=call_id)
        
    except Exception as e:
        print(f"Error in leave_call: {e}")

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def server_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    print("Starting Call Summary Application...")
    # Run without SSL for development - only use http://127.0.0.1:5000
    # For production, configure proper SSL certificates
    socketio.run(app, debug=True, host='127.0.0.1', port=5000)
