import { StateRegistry } from './registration.mjs';
import { BookIngestBridge } from './book-ingest-bridge.mjs';
import { SentenceMesh } from './sentence-mesh.mjs';
import { ScientistLoop } from './scientist-loop.mjs';
import { TrainingJournal } from './training-journal.mjs';

export class PureSynthiaLearningCore {
  constructor({extractors={}}={}){
    this.registry=new StateRegistry();
    this.books=new BookIngestBridge({registry:this.registry,extractors});
    this.sentences=new SentenceMesh();
    this.scientist=new ScientistLoop();
    this.training=new TrainingJournal();
  }
  snapshot(){return {registry:this.registry.snapshot(),science:this.scientist.dashboard(),routes:this.training.rankRoutes()};}
}

