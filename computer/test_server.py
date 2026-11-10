import json
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from pathlib import Path
from http.server import ThreadingHTTPServer
from server import handler, safe_file, execute

class Boundaries(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name).resolve()
        (self.root/'app.py').write_text('print("original")')
    def tearDown(self): self.tmp.cleanup()
    def test_read_preserves_source(self):
        self.assertIn('original',execute(self.root,'workspace_read',{'path':'app.py'})['content'][0]['text'])
        self.assertEqual((self.root/'app.py').read_text(),'print("original")')
    def test_no_destructive_capabilities(self):
        for name in ('delete_file','workspace_delete','execute','shell','tap','workspace_write'):
            with self.assertRaises(ValueError): execute(self.root,name,{'path':'app.py'})
        self.assertTrue((self.root/'app.py').exists())
    def test_traversal_and_symlink(self):
        for path in ('../other','/etc/passwd','sub/../../other'):
            with self.assertRaises(ValueError): safe_file(self.root,path)
        (self.root/'escape').symlink_to('/etc/passwd')
        with self.assertRaises(ValueError): safe_file(self.root,'escape')
    def test_authenticated_mcp(self):
        token='test-secret-at-least-24-characters'
        server=ThreadingHTTPServer(('127.0.0.1',0),handler(self.root,token))
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        url=f'http://127.0.0.1:{server.server_port}/mcp'
        data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/list'}).encode()
        try:
            with self.assertRaises(urllib.error.HTTPError) as err: urllib.request.urlopen(urllib.request.Request(url,data=data))
            self.assertEqual(err.exception.code,401)
            req=urllib.request.Request(url,data=data,headers={'Authorization':'Bearer '+token})
            with urllib.request.urlopen(req) as r: names=[x['name'] for x in json.load(r)['result']['tools']]
            self.assertEqual(set(names),{'workspace_list','workspace_read','computer_screenshot'})
        finally: server.shutdown();server.server_close();thread.join()
if __name__=='__main__': unittest.main()
