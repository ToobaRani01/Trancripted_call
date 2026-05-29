import os
import random
import string
import json
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()

# Initialize Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

gemini_model = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",   # free tier supported
    api_key=GEMINI_API_KEY,
    temperature=0.9
)


def generate_call_summary(transcript_text):
    """Generate a call summary using Gemini with a structured prompt."""
    summary_prompt = f"""Analyze the following call transcript and provide a structured response with these exact sections:

SUMMARY:
(Write 2-3 sentences summarizing the main discussion)

KEY POINTS:
(List 3-5 main points, one per line, each starting with a dash)

ACTION ITEMS:
(List any tasks or follow-ups needed, one per line, each starting with a dash. If none, write "None")

Transcript:
{transcript_text}

Make sure to use the exact section headers and format."""
    
    try:
        response = gemini_model.invoke(summary_prompt)
        parsed = parse_gemini_response(response.content)
        return parsed
    except Exception as e:
        print(f"Error parsing Gemini response: {e}")
        raise


def parse_gemini_response(response_text):
    """Parse the structured response from Gemini."""
    sections = {
        'summary': '',
        'key_points': [],
        'action_items': [],
        'notes_text': response_text,
        'notes_items': []
    }
    
    # Split by section headers
    text = response_text.strip()
    
    # Extract SUMMARY
    if 'SUMMARY:' in text:
        summary_start = text.find('SUMMARY:') + len('SUMMARY:')
        summary_end = text.find('KEY POINTS:') if 'KEY POINTS:' in text else len(text)
        sections['summary'] = text[summary_start:summary_end].strip()
    
    # Extract KEY POINTS
    if 'KEY POINTS:' in text:
        kp_start = text.find('KEY POINTS:') + len('KEY POINTS:')
        kp_end = text.find('ACTION ITEMS:') if 'ACTION ITEMS:' in text else len(text)
        kp_text = text[kp_start:kp_end].strip()
        sections['key_points'] = [line.strip().lstrip('- •*').strip() for line in kp_text.split('\n') if line.strip()]
    
    # Extract ACTION ITEMS
    if 'ACTION ITEMS:' in text:
        ai_start = text.find('ACTION ITEMS:') + len('ACTION ITEMS:')
        ai_text = text[ai_start:].strip()
        sections['action_items'] = [line.strip().lstrip('- •*').strip() for line in ai_text.split('\n') if line.strip() and line.strip().lower() != 'none']
    
    # Store notes items (all key points as notes)
    sections['notes_items'] = sections['key_points'] + sections['action_items']
    
    return sections


def generate_simple_summary(transcript_text):
    """Generate a simple summary from transcript without API."""
    lines = [line.strip() for line in transcript_text.strip().split('\n') if line.strip()]
    speakers = set()
    key_points = []
    
    for line in lines:
        if ':' in line:
            speaker, message = line.split(':', 1)
            speaker = speaker.strip()
            message = message.strip()
            speakers.add(speaker)
            # Include all messages, not just long ones
            if message:
                key_points.append(message[:150])
        else:
            # Handle lines without speaker
            if line:
                key_points.append(line[:150])
    
    summary = f"Call between {', '.join(sorted(speakers)) if speakers else 'participants'}. {len(lines)} statements recorded."
    
    return {
        'summary': summary,
        'key_points': key_points,
        'action_items': [],
        'notes_text': '\n'.join(lines),
        'notes_items': lines
    }


def generate_call_code(length=8):
    """Generate a random call code."""
    characters = string.ascii_letters + string.digits
    return ''.join(random.choice(characters) for _ in range(length))


def generate_unique_call_code(existing_codes, length=8):
    """Generate a unique call code that doesn't exist yet."""
    while True:
        code = generate_call_code(length)
        if code not in existing_codes:
            return code


def build_conversation_insights(transcript_text):
    """Build conversation insights using Gemini, fallback to simple summary."""
    if not transcript_text or not transcript_text.strip():
        return {
            'summary': 'No conversation yet...',
            'key_points': [],
            'action_items': [],
            'notes_text': '',
            'notes_items': []
        }
    
    try:
        # Try to use Gemini API first
        result = generate_call_summary(transcript_text)
        # Result is already a dictionary, return it directly
        return result
    except Exception as e:
        print(f'Gemini API failed: {e}')
        # Fallback to simple summary
        return generate_simple_summary(transcript_text)

