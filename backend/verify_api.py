import json
import urllib.request

root = urllib.request.urlopen('http://localhost:8001/', timeout=10)
print(root.read().decode())

payload = json.dumps({
    'email': 'ananya@pulse.edu',
    'password': 'PulseStu-1001!',
}).encode()
request = urllib.request.Request(
    'http://localhost:8001/auth/login',
    data=payload,
    headers={'Content-Type': 'application/json'},
    method='POST',
)
response = urllib.request.urlopen(request, timeout=10)
print(response.read().decode())
