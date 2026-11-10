from playwright.sync_api import sync_playwright
from pathlib import Path
import json
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread

root=Path(__file__).resolve().parents[1]
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(root/'app/src/main/assets')))
Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':420,'height':840},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{server.server_port}/index.html')
    page.screenshot(path=str(root/'verification/trident-chat.png'),full_page=True)
    assert page.locator('h1').first.inner_text()=='A little direction.\nA lot of progress.'
    for name in ['Inbox','Preview','Workspace','Computer','Chat']:
        page.get_by_role('navigation').get_by_role('button',name=name,exact=True).click()
        assert page.locator('#'+name.lower()).is_visible()
    page.get_by_role('button',name='Settings',exact=True).click()
    assert page.get_by_role('dialog').is_visible()
    page.get_by_role('button',name='Close settings').click()
    page.get_by_label('Message Trident',exact=True).fill('Fix my file')
    page.get_by_role('button',name='Send message').click()
    assert 'interface preview' in page.locator('#toast').inner_text()
    page.evaluate('''() => {
      window.calls=[];
      window.fixture={messages:[],jobs:[],inbox:[],attachments:[],config:{}};
      window.TridentAndroid={snapshot:()=>JSON.stringify(window.fixture),send:(text)=>{
        calls.push(['send',text]);fixture.messages.push({id:'m1',role:'user',text,job:'j1'});
        fixture.jobs.push({id:'j1',prompt:text,status:'queued',plan:'Inspect source, save corrected copy.'});return 'j1';
      },preview:id=>calls.push(['preview',id]),export:id=>calls.push(['export',id]),stop:id=>calls.push(['stop',id]),saveConfig:x=>calls.push(['saveConfig',x])};
    }''')
    page.get_by_role('button',name='Send message').click()
    assert page.locator('#message').input_value()==''
    assert page.locator('.bubble.user').inner_text()=='Fix my file'
    page.get_by_role('navigation').get_by_role('button',name='Inbox',exact=True).click()
    page.get_by_role('button',name='Stop job').click()
    assert page.evaluate('calls.at(-1)')==['stop','j1']
    page.evaluate('''() => {fixture.inbox.push({id:'f1',job:'j1',name:'fixed.html',time:Date.now(),content:'<script>window.pwned=true</script><h1>Fixed</h1>'});fixture.jobs[0].status='done';refresh();}''')
    page.locator('#deliveries').get_by_role('button',name='Preview',exact=True).click()
    assert '<script>' in page.locator('.source').inner_text()
    assert page.evaluate('window.pwned') is None
    page.get_by_role('button',name='Open safe preview').click()
    assert page.evaluate('calls.at(-1)')==['preview','f1']
    page.get_by_role('button',name='Ask for a fix',exact=True).click()
    assert 'file id f1' in page.locator('#message').input_value()
    page.get_by_role('navigation').get_by_role('button',name='Inbox',exact=True).click()
    page.screenshot(path=str(root/'verification/trident-inbox.png'),full_page=True)
    for width in [320,360,768]:
        page.set_viewport_size({'width':width,'height':840})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors,errors
    browser.close()
server.shutdown(); server.server_close()
print(json.dumps({'passed':True,'checks':['navigation','settings','native-required state','send/queue','stop','revision preview','HTML escaping','revision feedback','responsive widths','no browser exceptions']}))
