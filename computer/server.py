#!/usr/bin/env python3
"""Trident's optional computer companion: read-only workspace + screenshot MCP.
No shell, keyboard, pointer, delete, overwrite, install or filesystem mutation tools.
"""
import argparse
import base64
import hmac
import json
import os
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BYTES = 256_000

def safe_file(root, supplied):
    if not isinstance(supplied, str) or not supplied or Path(supplied).is_absolute():
        raise ValueError('Use a relative workspace path')
    if any(p in ('..', '.') for p in supplied.replace('\\', '/').split('/')):
        raise ValueError('Path traversal is not allowed')
    path = (root / supplied).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError('Not a file inside the selected workspace')
    if path.stat().st_size > MAX_BYTES:
        raise ValueError('File exceeds the 256 KB text limit')
    return path

def list_files(root):
    results = []
    for current, dirs, names in os.walk(root, followlinks=False):
        dirs[:] = sorted(d for d in dirs if not d.startswith('.') and d not in ('node_modules','vendor','build','dist') and not (Path(current)/d).is_symlink())
        for name in sorted(names):
            path = Path(current) / name
            if not name.startswith('.') and not path.is_symlink():
                results.append(str(path.relative_to(root)))
            if len(results) >= 200:
                return results
    return results

def text_result(value):
    return {'content': [{'type': 'text', 'text': value}]}

TOOLS = [
    {'name': 'workspace_list', 'description': 'List up to 200 files in the explicitly selected read-only computer workspace.', 'inputSchema': {'type': 'object', 'properties': {}}},
    {'name': 'workspace_read', 'description': 'Read a UTF-8 source file in the selected workspace; does not modify it.', 'inputSchema': {'type': 'object', 'properties': {'path': {'type': 'string'}}, 'required': ['path']}},
    {'name': 'computer_screenshot', 'description': 'Read a screenshot of the computer screen. No screen control.', 'inputSchema': {'type': 'object', 'properties': {}}},
]

def execute(root, name, args):
    if name == 'workspace_list':
        return text_result('\n'.join(list_files(root)))
    if name == 'workspace_read':
        text = safe_file(root, args.get('path')).read_text(encoding='utf-8')
        if '\0' in text:
            raise ValueError('Binary files are unsupported')
        return text_result(text)
    if name == 'computer_screenshot':
        try:
            import mss
            import mss.tools
        except ImportError:
            raise ValueError('Install the optional mss package on this computer for screen snapshots')
        with mss.mss() as screen:
            shot = screen.grab(screen.monitors[1])
            data = mss.tools.to_png(shot.rgb, shot.size)
        if len(data) > 2_000_000:
            raise ValueError('Screen image is too large. Reduce display resolution first')
        return {'content': [{'type':'image','mimeType':'image/png','data':base64.b64encode(data).decode()}]}
    raise ValueError('Tool is not permitted by the read-only policy')

def handler(root, token):
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(15)
        def log_message(self, *_):
            pass
        def respond(self, status, value):
            body = b'' if value is None else json.dumps(value, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type','application/json')
            self.send_header('Content-Length',str(len(body)))
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.end_headers()
            self.wfile.write(body)
        def do_POST(self):
            if self.path != '/mcp':
                return self.respond(404, {'error':'Not found'})
            auth = self.headers.get('Authorization','')
            if not hmac.compare_digest(auth.encode(), ('Bearer '+token).encode()):
                return self.respond(401, {'error':'Bearer token required'})
            if self.headers.get('Origin'):
                return self.respond(403, {'error':'Browser origins are not accepted'})
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 1_000_000:
                    return self.respond(413, {'error':'Request body limit'})
                request = json.loads(self.rfile.read(length))
                if not isinstance(request, dict) or request.get('jsonrpc') != '2.0':
                    raise ValueError('Expected JSON-RPC 2.0')
                if 'id' not in request:
                    return self.respond(202, None)
                response = {'jsonrpc':'2.0','id':request['id']}
                method = request.get('method')
                if method == 'initialize':
                    result = {'protocolVersion':'2025-03-26','capabilities':{'tools':{}},'serverInfo':{'name':'trident-computer','version':'0.4'}}
                elif method == 'ping':
                    result = {}
                elif method == 'tools/list':
                    result = {'tools':TOOLS}
                elif method == 'tools/call':
                    params = request.get('params',{})
                    try:
                        result = execute(root, params.get('name'), params.get('arguments',{}))
                    except Exception as error:
                        result = text_result(str(error)); result['isError'] = True
                else:
                    response['error'] = {'code':-32601,'message':'Unknown method'}
                    return self.respond(200,response)
                response['result'] = result
                self.respond(200,response)
            except (ValueError, TypeError, KeyError):
                self.respond(400, {'error':'Invalid JSON-RPC request'})
    return Handler

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True, type=Path)
    parser.add_argument('--host',default='127.0.0.1',help='Use a private LAN IP explicitly to connect your phone')
    parser.add_argument('--port',type=int,default=8766)
    args=parser.parse_args()
    root=args.root.resolve(strict=True)
    if not root.is_dir():
        parser.error('--root must be a directory')
    token=os.environ.get('TRIDENT_MCP_TOKEN','')
    if len(token)<24:
        parser.error('Set TRIDENT_MCP_TOKEN to a random secret of at least 24 characters')
    server=ThreadingHTTPServer((args.host,args.port),handler(root,token))
    print(f'Trident MCP: http://{args.host}:{args.port}/mcp | read-only root: {root}',flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__=='__main__':
    main()
