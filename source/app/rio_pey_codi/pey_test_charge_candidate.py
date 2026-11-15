"""One-cent pey test helper. Caller must reserve durably and authorize owner."""
import base64
import json
import re
import urllib.request
from dataclasses import dataclass

class ChargeUncertain(Exception):
    pass

@dataclass(frozen=True)
class TestQR:
    provider_id: str
    qr_string: str
    image_png: bytes | None

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def issue_one_cent(api_key, account_id, reference, *, transport=None):
    if not isinstance(api_key, str) or not re.fullmatch(r'[A-Za-z0-9._~+/-]{16,512}={0,2}', api_key):
        raise ValueError('Invalid provider key')
    if not isinstance(account_id, str) or (account_id and not re.fullmatch(r'[0-7][0-9A-HJKMNP-TV-Z]{25}', account_id)):
        raise ValueError('Invalid account identifier')
    if not isinstance(reference, str) or not re.fullmatch(r'[0-9]{1,7}', reference):
        raise ValueError('Invalid reference')
    body = {'amount': 0.01, 'concept': 'Prueba Rio', 'expiration': 600,
            'numRef': reference, 'generateImage': True}
    if account_id:
        body['bankAccountId'] = account_id
    req = urllib.request.Request('https://api.pey.mx/codi/qr', method='POST',
          data=json.dumps(body).encode(), headers={'Content-Type': 'application/json',
          'Accept': 'application/json', 'Authorization': 'Bearer ' + api_key})
    opener = transport or urllib.request.build_opener(NoRedirect()).open
    try:
        with opener(req, timeout=15) as response:
            if response.status != 201:
                raise ValueError()
            raw = response.read(262145)
            if len(raw) > 262144:
                raise ValueError()
        data = json.loads(raw)
        provider_id, qr_string = data['id'], data['qrString']
        if not isinstance(provider_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,140}', provider_id):
            raise ValueError()
        if not isinstance(qr_string, str) or not qr_string or len(qr_string) > 32768:
            raise ValueError()
        image = None
        if isinstance(data.get('qrImage'), str):
            try:
                decoded = base64.b64decode(data['qrImage'], validate=True)
                if len(decoded) <= 150000 and decoded.startswith(b'\x89PNG\r\n\x1a\n'):
                    image = decoded
            except (ValueError, TypeError):
                pass
        return TestQR(provider_id, qr_string, image)
    except Exception:
        raise ChargeUncertain('Provider result uncertain; check pey before any retry') from None
