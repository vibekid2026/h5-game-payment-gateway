import hmac
import hashlib
import json
import urllib.request
import urllib.parse

class H5PaymentClient:
    """Python Client SDK for H5 Game Payment Gateway"""

    def __init__(self, gateway_url: str = "http://localhost:3001", secret_key: str = "", timeout: int = 10):
        self.gateway_url = gateway_url.rstrip("/")
        self.secret_key = secret_key
        self.timeout = timeout

    def create_order(self, params: dict) -> dict:
        url = f"{self.gateway_url}/api/v1/orders/create"
        data = json.dumps(params).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def get_order(self, order_code: str) -> dict:
        url = f"{self.gateway_url}/api/v1/orders/{urllib.parse.quote(order_code)}"
        with urllib.request.urlopen(url, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def verify_callback(self, payload: dict, signature_header: str = None) -> bool:
        received_sig = signature_header or payload.get("signature")
        if not received_sig or not self.secret_key:
            return False

        data_to_sign = {k: v for k, v in payload.items() if k != "signature"}
        sorted_str = json.dumps(data_to_sign, sort_keys=True, separators=(',', ':'))
        expected_sig = hmac.new(
            self.secret_key.encode("utf-8"),
            sorted_str.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(expected_sig, received_sig)
