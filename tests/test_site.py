from pathlib import Path
from html.parser import HTMLParser
import unittest, re
ROOT=Path(__file__).resolve().parents[1]
class Audit(HTMLParser):
    def __init__(self):
        super().__init__();self.tags=[]
    def handle_starttag(self, tag, attrs):self.tags.append((tag,dict(attrs)))
class BrandTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html=(ROOT/'index.html').read_text(encoding='utf-8');cls.css=(ROOT/'styles.css').read_text(encoding='utf-8');cls.js=(ROOT/'script.js').read_text(encoding='utf-8');cls.doc=Audit();cls.doc.feed(cls.html)
    def test_language_and_access(self):
        self.assertIn('lang="es-MX"',self.html);self.assertIn('href="#contenido"',self.html)
        self.assertIn('aria-controls="site-menu"',self.html);self.assertIn('aria-expanded="false"',self.html)
    def test_single_h1(self):
        self.assertEqual(len([t for t,a in self.doc.tags if t=='h1']),1)
    def test_assets_exist(self):
        refs=re.findall(r'(?:src|href)="(\./(?:assets/)?[^"#?]+)"',self.html)
        for ref in refs:self.assertTrue((ROOT/ref.removeprefix('./')).is_file(),ref)
    def test_both_mascots(self):
        self.assertGreaterEqual(self.html.count('ama-mascota-mono.webp'),2)
        self.assertGreaterEqual(self.html.count('ama-mascota-clasica.webp'),2)
    def test_image_dimensions_and_alt(self):
        for tag,attrs in self.doc.tags:
            if tag=='img':
                self.assertIn('alt',attrs);self.assertIn('width',attrs);self.assertIn('height',attrs)
    def test_responsive_and_reduced_motion(self):
        self.assertIn('max-width:740px',self.css);self.assertIn('prefers-reduced-motion:reduce',self.css)
        self.assertIn("e.key==='Escape'",self.js)
    def test_no_financial_secrets_or_fake_payment(self):
        self.assertNotRegex(self.html,r'(?i)(sk_live_|api[_ -]?key|client_secret|secret_key)')
        self.assertIn('dependen de la disponibilidad y verificación',self.html)
if __name__=='__main__':unittest.main()
