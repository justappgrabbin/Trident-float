import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootTridentComputer } from '../../computer/TridentHost.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..');
const publicDir = path.join(rootDir, 'public-generative');
const host = await bootTridentComputer();
const { synthia } = host;

const json = (res, status, value) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(value, null, 2));
};
const readBody = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', chunk => { data += chunk; if (data.length > 5_000_000) req.destroy(); });
  req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
  req.on('error', reject);
});

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' });
      return res.end();
    }
    if (req.method === 'GET' && req.url === '/api/audit') return json(res, 200, host.audit());
    if (req.method === 'GET' && req.url === '/api/state') return json(res, 200, synthia.snapshot());
    if (req.method === 'GET' && req.url === '/api/tools') return json(res,200,{catalog:synthia.kleinToolCatalog,audit:synthia.wiringAudit().morphology.allTools,stateSpace:synthia.toolState.snapshot()});
    if (req.method === 'POST' && req.url === '/api/tools/run') {
      const body=await readBody(req);return json(res,200,await host.runTools({steps:body.steps??[],context:body.context??{}}));
    }
    if (req.method === 'GET' && req.url === '/api/structure/views') return json(res, 200, {views:synthia.generativeMorphology.structuralViews()});
    if (req.method === 'POST' && req.url === '/api/structure') {
      const body = await readBody(req);
      return json(res, 200, synthia.structure(body.subject ?? null, body.context ?? {}));
    }
    if (req.method === 'POST' && req.url === '/api/structure/address') {
      const body = await readBody(req);
      return json(res, 200, synthia.generativeMorphology.structuralAddress(body.index ?? '0', {depth:body.depth ?? 1}));
    }
    if (req.method === 'POST' && req.url === '/api/structure/trace') {
      return json(res, 200, synthia.generativeMorphology.traceStructure(await readBody(req)));
    }
    if (req.method === 'POST' && req.url === '/api/structure/step') {
      return json(res, 200, synthia.generativeMorphology.stepStructure(await readBody(req)));
    }
    if (req.method === 'POST' && req.url === '/api/addresses') {
      const body = await readBody(req);
      const count = synthia.setMorphologyAddresses(body.addresses ?? []);
      const morph = count ? synthia.morphology('compile', { addresses: body.addresses }).derivation.output : null;
      return json(res, 200, { ok: true, count, morphology: morph });
    }
    if (req.method === 'POST' && req.url === '/api/morphology') {
      const body = await readBody(req);
      return json(res, 200, synthia.morphology(body.operation ?? 'compile', {
        addresses: body.addresses ?? null,
        subject: body.subject ?? null,
        context: body.context ?? {},
        surface: body.surface ?? null,
      }));
    }
    if (req.method === 'POST' && req.url === '/api/chat') {
      const body = await readBody(req);
      const mode = String(body.mode ?? 'morph').toLowerCase();
      const context = { ...(body.context ?? {}), addresses: body.addresses ?? body.context?.addresses, processingMode: mode };
      if (mode === 'klein') {
        const out = await host.chat({message:body.message,mode:'klein',context});
        return json(res, 200, { ...out, processingMode: 'klein' });
      }
      if (mode === 'morph') {
        const out = await host.chat({message:body.message,mode:'morph',context});
        return json(res, 200, { ...out, processingMode: 'morph' });
      }
      if (mode === 'communication') {
        return json(res, 409, {
          ok: false,
          mode,
          error: 'communication-mode-is-owned-by-the-existing-v14-chat-route',
          detail: 'Use the v14 Communication selector to preserve its current direct model/transport behavior unchanged.',
        });
      }
      return json(res, 400, { ok: false, error: 'unknown-chat-mode', mode, allowed: ['communication', 'klein', 'morph'] });
    }
    if (req.method === 'POST' && req.url === '/api/research') {
      const body = await readBody(req);
      return json(res, 200, synthia.research(body.input ?? body, { ...(body.context ?? {}), addresses: body.addresses ?? body.context?.addresses }));
    }
    if (req.method === 'POST' && req.url === '/api/browser') {
      const body = await readBody(req);
      return json(res, 200, synthia.browser(body.input ?? body, { ...(body.context ?? {}), addresses: body.addresses ?? body.context?.addresses }));
    }

    const rel = req.url === '/' ? 'index.html' : req.url.replace(/^\//, '');
    const file = path.normalize(path.join(publicDir, rel));
    if (!file.startsWith(publicDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return json(res, 404, { error: 'not found' });
    const ext = path.extname(file);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
    res.writeHead(200, { 'content-type': types[ext] ?? 'text/plain; charset=utf-8' });
    res.end(fs.readFileSync(file));
  } catch (error) {
    json(res, error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError ? 400 : 500, { error: String(error?.message ?? error) });
  }
});

const port = Number(process.env.PORT ?? 8765);
server.listen(port, '127.0.0.1', () => console.log(`Synthia Generative Assembly: http://127.0.0.1:${server.address().port}`));


