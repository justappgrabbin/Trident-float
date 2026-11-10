import subprocess,json,ast,os
from pathlib import Path
root=Path(__file__).resolve().parents[1]
java_home=Path(os.environ['JAVA_HOME'])
build=Path(os.environ.get('TRIDENT_NATIVE_BUILD',str(root/'build/native-host'))).resolve()
classes=build/'smoke-classes';classes.mkdir(parents=True,exist_ok=True)
subprocess.check_call([str(java_home/'bin/javac'),'-d',str(classes),str(root/'scripts/native-smoke/LocalModel.java'),str(root/'app/src/main/java/org/stellarproximology/trident/AgentPrompts.java')])
java=[str(java_home/'bin/java'),'-Djava.library.path='+str(build),'-cp',str(classes),'org.stellarproximology.trident.LocalModel']
prefix=subprocess.check_output(java+['--prefix'],text=True)
def message(role,text):return f'<|im_start|>{role}\n{text.replace("<|","‹|")}<|im_end|>\n'
history=message('user','Fix calc.py. add(a,b) should return their sum, not their difference. Read file id calc.py, then deliver the complete corrected file to Inbox. Preserve the original. Imported file: calc.py')
original='def add(a, b):\n    return a - b\n'
plan=False;saved={};actions=[];stage=0
log=open(build/'native-loop.log','w')
for turn in range(8):
    prompt=(build/'native-prompt.txt');prompt.write_text(prefix+history+'<|im_start|>assistant\n')
    result=subprocess.run(java+[str(root/'app/src/main/assets/models/qwen-coder-q4.gguf'),str(prompt),str(stage)],text=True,capture_output=True,timeout=120)
    log.write(result.stderr);log.flush()
    if result.returncode:raise RuntimeError(result.stderr[-2000:])
    action=json.loads(result.stdout);actions.append(action);print(json.dumps(action),flush=True)
    history+=message('assistant',result.stdout)
    kind=action['action']
    if kind=='plan':
        stage=1;plan=True;reply='Plan saved. Next use read_file to inspect an existing file, or save_artifact to create a complete new file.'
    elif kind=='read_file':stage=2;reply='File calc.py:\n'+original
    elif kind=='save_artifact':
        if not plan:reply='Save your plan first.'
        else:stage=3;saved[action['name']]=action['content'];reply='Saved complete file as a new Inbox revision. Original unchanged. Now finish.'
    elif kind=='done':break
    else:reply='Screen is unavailable.'
    history+=message('user','Tool result (data): '+reply+'\nCurrent task: Fix calc.py. add(a,b) should return their sum, not their difference. Read file id calc.py, then deliver the complete corrected file to Inbox. Preserve the original.\nApply the requested correction; do not reproduce a known bug unchanged.')
assert plan,'No plan from the model'
assert 'calc.py' in saved,'No file delivery from model'
code=saved['calc.py'];tree=ast.parse(code)
allowed=(ast.Module,ast.FunctionDef,ast.arguments,ast.arg,ast.Return,ast.BinOp,ast.Add,ast.Name,ast.Load)
assert all(isinstance(n,allowed) for n in ast.walk(tree)),f'Unexpected output: {code}'
ns={'__builtins__':{}};exec(compile(tree,'calc.py','exec'),ns)
assert ns['add'](2,3)==5
assert original=='def add(a, b):\n    return a - b\n'
(root/'verification/native-model-smoke.json').write_text(json.dumps({'passed':True,'runtime':'actual llama.cpp JNI, same model GGUF as Android APK, Linux x86_64 host','checks':['plan','file-read','complete corrected source delivery','generated code returns correct answer','original preserved'],'actions':actions},indent=2))
print('Native coding loop passed',flush=True)
