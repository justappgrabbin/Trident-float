// Adapts existing tools' outputs without assigning predefined field relationships.
export const RECOGNITION_TOOLS = Object.freeze(['autoling', 'diseminer', 'computational-grammar-coder', 'klein-analogy', 'morph-mir']);
const copy = value => structuredClone(value);
export function recognitionText(subject) {
  if (typeof subject === 'string') return subject;
  if (typeof subject?.text === 'string') return subject.text;
  const input = subject?.input ?? subject ?? {};
  return [input.title, input.question, input.query, input.text, input.page?.title, input.page?.text].filter(v=>typeof v==='string').join(' ');
}

export function recognizeStructure(subject, invoke) {
  const text = recognitionText(subject), runs = [], issues = [], nodes = [], relations = [];
  const run = (toolId, input) => {
    try {
      const result = invoke(toolId, input);
      const derivation = result.derivation;
      const ok = derivation.evaluation?.accepted !== false && derivation.output?.ok !== false;
      runs.push({toolId, operation:input.operation ?? 'solve-analogy', status:ok?'executed':'rejected',
        derivationId:derivation.id, kleinEvaluationId:derivation.kleinEvaluation?.evaluationId ?? null,
        rootEventId:result.rootEventId, trainingRecordId:result.trainingRecordId, output:copy(derivation.output)});
      if (!ok) issues.push({toolId, reason:derivation.output?.reason ?? 'tool rejected input'});
      return ok ? derivation.output : null;
    } catch(error) {
      issues.push({toolId, reason:String(error.message ?? error)});
      runs.push({toolId,operation:input.operation ?? 'solve-analogy',status:'failed'});
      return null;
    }
  };
  if (text.trim()) {
    const autoling=run('autoling',{operation:'pipeline',text});
    run('computational-grammar-coder',{text});
    run('diseminer',{operation:'observe',text});
    const extraction=run('diseminer',{operation:'extract',text,source:'structural-input'});
    const tree=autoling?.pipeline?.parseTree;
    for(const node of tree?.nodes ?? [])nodes.push({...copy(node),id:`autoling:${node.id}`,source:'autoling'});
    for(const edge of tree?.edges ?? [])relations.push({...copy(edge),from:`autoling:${edge.from}`,to:`autoling:${edge.to}`,source:'autoling',kind:'tool-reported-syntax'});
    for(const claim of extraction?.claims ?? []){
      const from=`diseminer:${claim.id}:subject`,to=`diseminer:${claim.id}:object`;
      nodes.push({id:from,surface:claim.subject,source:'diseminer'},{id:to,surface:claim.object,source:'diseminer'});
      relations.push({from,to,label:claim.predicate,source:'diseminer',kind:'tool-extracted-claim',claim:copy(claim)});
    }
  }
  if(subject?.analogy){
    const a=subject.analogy;
    if(['vocab','A','B','C'].every(k=>Array.isArray(a[k])&&a[k].every(v=>typeof v==='string'))){
      run('klein-analogy',{vocab:a.vocab,A:a.A,B:a.B,C:a.C,mode:a.mode??'xor'});
    }else issues.push({toolId:'klein-analogy',reason:'ATO requires explicit named-feature arrays vocab, A, B, C; no features fabricated'});
  }
  const artifactId=subject?.artifactId??subject?.input?.artifactId;
  if(artifactId)run('morph-mir',{operation:'analyze',artifactId});
  return {status:issues.length?'incomplete':runs.length?'executed':'no-applicable-input',runs,issues,
    graph:{nodes,relations},
    policy:'consume existing tool outputs; syntax and extracted claims are evidence, not predefined field couplings or verified facts; ATO/artifact analysis run only for applicable inputs'};
}

