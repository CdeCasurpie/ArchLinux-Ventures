/** Bound stalled requests; transport failure must return control to the retry queue. */
export function createTimedFetch(transport:typeof fetch,timeoutMs=15000):typeof fetch{
  return (input,init)=>{
    const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    const timeout=AbortSignal.timeout(url.includes('/storage/v1/')?Math.max(timeoutMs,120000):timeoutMs);
    const supplied=init?.signal??(input instanceof Request?input.signal:undefined);
    const signal=supplied?AbortSignal.any([supplied,timeout]):timeout;
    return transport(input,{...init,signal});
  };
}
