/** Navigation may only discard a form after its local persistence has settled. */
export class SaveBarrier {
  private writers=new Set<()=>Promise<void>>();
  register(flush:()=>Promise<void>){this.writers.add(flush);return()=>{this.writers.delete(flush)}}
  async flush(){await Promise.all([...this.writers].map(flush=>flush()))}
}
