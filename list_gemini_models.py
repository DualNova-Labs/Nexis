"""
List available Gemini models
"""
import os
import sys
import requests

output_file = "gemini_models_list.txt"

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

log("=" * 70)
log("📋 LISTING AVAILABLE GEMINI MODELS")
log("=" * 70)
log("")

script_dir = os.path.dirname(os.path.abspath(__file__))
env_file = os.path.join(script_dir, 'backend', '.env')

env_vars = load_env_file(env_file)
api_key = env_vars.get('GEMINI_API_KEY')

if not api_key:
    log("❌ No API key found")
    sys.exit(1)

log(f"🔑 Using API Key: {api_key[:10]}...{api_key[-4:]}")
log("")

# Try listing models from v1beta
log("🔍 Fetching available models from v1beta API...")
log("")

try:
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
    response = requests.get(url, timeout=30)
    
    if response.status_code == 200:
        data = response.json()
        
        if 'models' in data:
            log(f"✅ Found {len(data['models'])} models!")
            log("")
            log("📋 AVAILABLE MODELS:")
            log("-" * 70)
            
            for model in data['models']:
                name = model.get('name', 'Unknown')
                display_name = model.get('displayName', 'N/A')
                supported_methods = model.get('supportedGenerationMethods', [])
                
                # Extract just the model ID from the full name
                model_id = name.split('/')[-1] if '/' in name else name
                
                log(f"")
                log(f"Model ID: {model_id}")
                log(f"  Full Name: {name}")
                log(f"  Display Name: {display_name}")
                log(f"  Supports: {', '.join(supported_methods)}")
                
                # Check if it supports generateContent
                if 'generateContent' in supported_methods:
                    log(f"  ✅ CAN USE FOR CHAT")
            
            log("")
            log("=" * 70)
            log("💡 TIP: Use the 'Model ID' in your Node.js code")
            log("=" * 70)
        else:
            log("❌ No models found in response")
    else:
        log(f"❌ HTTP {response.status_code}: {response.text[:300]}")
        
except Exception as e:
    log(f"❌ Error: {str(e)}")

log("")
log(f"📄 Results saved to: {os.path.abspath(output_file)}")
