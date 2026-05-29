import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'bsai-2024-043')
    SQLALCHEMY_DATABASE_URI = 'sqlite:///callsummary.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # SocketIO
    SOCKETIO_MESSAGE_QUEUE = None
    
    # Session
    PERMANENT_SESSION_LIFETIME = 86400  # 24 hours
