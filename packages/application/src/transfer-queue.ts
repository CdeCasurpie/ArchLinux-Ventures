export interface TransferJob {
  id:string; priority:number; state:'pending'|'running'|'done'|'error'; error:string|null;
  done:number; total:number; rerun?:boolean;
}
export interface TransferJournal { read():Promise<TransferJob[]>; write(jobs:TransferJob[]):Promise<void> }
type Worker=(id:string,signal:AbortSignal,progress:(done:number,total:number)=>void)=>Promise<void>;

/** Durable scheduling; binaries themselves remain in the platform filesystem. */
export class TransferQueue {
  private jobs:TransferJob[]=[];
  private ready:Promise<void>;
  private tail:Promise<unknown>=Promise.resolve();
  private active:Promise<void>|null=null;
  private abort:AbortController|null=null;
  private current:TransferJob|null=null;
  private stopped=false;
  private listeners=new Set<(jobs:TransferJob[])=>void>();
  constructor(private journal:TransferJournal,private worker:Worker,private connected:()=>boolean){
    this.ready=journal.read().then(jobs=>{this.jobs=jobs.map(job=>({...job,state:job.state==='running'?'pending':job.state}));});
  }
  private serial<T>(action:()=>Promise<T>):Promise<T>{const next=this.tail.then(action);this.tail=next.catch(()=>{});return next}
  private async persist(){await this.journal.write(this.jobs.map(job=>({...job})));for(const listener of this.listeners)listener(this.jobs.map(job=>({...job})))}
  subscribe(listener:(jobs:TransferJob[])=>void){this.listeners.add(listener);void this.ready.then(()=>{if(this.listeners.has(listener))listener(this.jobs.map(job=>({...job})))}).catch(console.error);return()=>{this.listeners.delete(listener)}}
  async request(id:string,priority=10){
    await this.ready;
    await this.serial(async()=>{
      if(this.current&&this.current.id!==id&&priority>=this.current.priority){
        this.current.priority=priority-1;this.abort?.abort();
      }
      const found=this.jobs.find(job=>job.id===id);
      if(found){found.priority=priority;if(found.state!=='running'){found.state='pending';found.error=null}else found.rerun=true}
      else this.jobs.push({id,priority,state:'pending',error:null,done:0,total:0});
      await this.persist();
    });
    return this.run();
  }
  start(){this.stopped=false;return this.run()}
  stop(){this.stopped=true;this.abort?.abort()}
  run():Promise<void>{
    if(this.active)return this.active;
    this.active=this.perform().finally(()=>{this.active=null});return this.active;
  }
  private async perform(){
    await this.ready;
    const failed=new Set<string>();
    const errors:string[]=[];
    while(!this.stopped&&this.connected()){
      const job=await this.serial(async()=>{
        const next=this.jobs.filter(job=>!failed.has(job.id)&&(job.state==='pending'||job.state==='error')).sort((a,b)=>b.priority-a.priority)[0];
        if(!next)return null;
        next.state='running';next.error=null;await this.persist();return next;
      });
      if(!job)break;
      this.abort=new AbortController();
      this.current=job;
      try{
        await this.worker(job.id,this.abort.signal,(done,total)=>{
          job.done=done;job.total=total;
          for(const listener of this.listeners)listener(this.jobs.map(job=>({...job})));
        });
        job.state=job.rerun?'pending':'done';job.rerun=false;
      }catch(error){
        const interrupted=this.stopped||this.abort.signal.aborted;
        job.state=interrupted?'pending':'error';
        job.error=interrupted?null:error instanceof Error?error.message:String(error);
        if(!interrupted){failed.add(job.id);errors.push(`${job.id}: ${job.error}`)}
      }
      await this.serial(()=>this.persist());
      this.current=null;
    }
    if(errors.length&&!this.stopped)throw new Error(errors.join('\n'));
  }
}
