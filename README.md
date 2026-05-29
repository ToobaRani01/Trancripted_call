# 📞 Call Summary - Video Call Application

A web-based call application with live browser transcription and llm summary generation. Uses WebRTC for video, Socket.IO for real-time signaling, and built-in transcript analysis in `utils.py`.

## ✨ Key Features

- **Video call** with WebRTC peer-to-peer streaming
- **Secure calls** with unique call codes and passwords
- **Live transcription** from browser microphone input
- **llm summary generation** from transcript data
- **Key points and action items** extracted from conversation
- **Downloadable** transcript and summary output

## 🚀 Quick Start

1. Open a terminal in the project folder:
   
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Add a secret key and  a Gemini API key to `.env` file  and .env file you have to create in root Dir:
   ```bash
   SECRET_KEY=your-secure-secret-key
   GOOGLE_API_KEY=your-google-generative-ai-key
   ```
5. Run the app:
   ```bash
   python app.py
   ```
6. Open your browser at:
   ```
   http://localhost:5000
   ```

## 🔧 How to Use

### Create a Call

- Click **Create Call**
- Enter a name and password
- Share the generated call code with another user

### Join a Call

- Click **Join Call**
- Enter the call code, name, and password
- Allow camera and microphone access

### During the Call

- Toggle camera and microphone controls
- Share your screen
- Watch the live transcript panel
- Click **End Call** to finish

### After the Call

- View the generated summary
- Review key points and action items
- Download transcript and summary text

## 🧠 Summary Generation

If `GOOGLE_API_KEY` is configured, the app uses LangChain Gemini to generate the final summary, key points, action items, and notes from the transcript. Otherwise the app falls back to local transcript summarization.

- `utils.py` analyzes the transcript text
- If configured, it uses Gemini via LangChain for structured output
- Otherwise it generates a local summary and notes
- Stores the results in the database

## 📁 Project Files

- `app.py` — Flask backend and Socket.IO handlers
- `config.py` — application settings
- `models.py` — database models
- `utils.py` — transcript summary logic
- `requirements.txt` — Python dependencies
- `static/` — frontend CSS and JS
- `templates/index.html` — UI template

## 📦 Dependencies

- Flask
- Flask-SocketIO
- Flask-SQLAlchemy
- python-dotenv

## Notes

- No external AI key is required.
- The app uses browser speech recognition for transcription.

---

**Built with ❤️ using Flask, WebRTC, and llm transcript summarization**
