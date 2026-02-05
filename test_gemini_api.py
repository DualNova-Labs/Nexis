"""
Gemini API Tester - Using v1beta API
"""

import os
import sys
import requests
import json

output_file = "gemini_test_results.txt"

def log(message):
    print(message)
    with open(output_file, 'a', encoding='utf-8') as f:
        f.write(message + '\n')

with open(output_file, 'w', encoding='utf-8') as f:
    f.write("")

def load_env_file(env_path):
    env_vars = {}
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key.strip()] = value.strip()
    return env_vars

def test_api_v1beta(api_key, model_name):
    """Test using v1beta API"""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
    
    headers = {"Content-Type": "application/json"}
    
    data = {
        "contents": [{
            "parts": [{"text": "Say hello"}]
        }]
    }
    
    try:
        response = requests.post(
            f"{url}?key={api_key}",
            headers=headers,
            json=data,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            if 'candidates' in result:
                text = result['candidates'][0]['content']['parts'][0]['text']
                return True, text
            return False, "No response"
        else:
            return False, f"HTTP {response.status_code}: {response.text[:200]}"
    except Exception as e:
        return False, str(e)[:200]

log("=" * 70)
log("🔍 GEMINI API TESTER (v1beta API)")
log("=" * 70)
log("")

script_dir = os.path.dirname(os.path.abspath(__file__))
env_file = os.path.join(script_dir, 'backend', '.env')

log(f"📂 .env file: {env_file}")

if not os.path.exists(env_file):
    log("❌ .env not found")
    sys.exit(1)

log("✅ .env found!")
log("")

env_vars = load_env_file(env_file)
api_key = env_vars.get('GEMINI_API_KEY')

if not api_key:
    log("❌ No API key")
    sys.exit(1)

log(f"🔑 API Key: {api_key[:10]}...{api_key[-4:]}")
log("")
log("🧪 Testing with v1beta API...")
log("")

models = [
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-pro"
]

working = []

for model in models:
    log(f"   • {model}")
    success, result = test_api_v1beta(api_key, model)
    
    if success:
        log(f"     ✅ SUCCESS!")
        log(f"     Response: {result[:80]}")
        working.append(model)
    else:
        log(f"     ❌ {result[:120]}")
    log("")

log("=" * 70)

if working:
    log("🎉 API KEY WORKS!")
    log("")
    log("✅ Working models:")
    for m in working:
        log(f"   • {m}")
    log("")
    log("📋 UPDATE YOUR CODE:")
    log(f"   Use model: {working[0]}")
    log("=" * 70)
    sys.exit(0)
else:
    log("❌ NO WORKING MODELS")
    log("")
    log("This API key might need:")
    log("  1. API enablement in Google Cloud Console")
    log("  2. Billing enabled")
    log("  3. Wait a few minutes after creation")
    log("=" * 70)
    sys.exit(1)
