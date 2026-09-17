export type Profile = {
 id:string; email:string; nombre_completo:string; cargo:string|null;
 nro_colegiatura:string|null; updated_at:string;
};
export type ProfileEdit = Pick<Profile,'nombre_completo'|'cargo'|'nro_colegiatura'>;
export type Pending = {id:string; owner:string; base:string; edit:ProfileEdit};
export type LocalState = {profile:Profile|null; pending:Pending|null};
export class ConflictError extends Error { constructor(){super('El perfil cambió en otro dispositivo. Revisa ambas versiones.')} }
export function validateProfile(edit:ProfileEdit):ProfileEdit {
 const nombre=edit.nombre_completo.trim();
 if(nombre.length<2 || nombre.length>160) throw new Error('Escribe un nombre de 2 a 160 caracteres.');
 if((edit.cargo?.length??0)>160 || (edit.nro_colegiatura?.length??0)>40) throw new Error('Revisa la longitud del cargo y la colegiatura.');
 return {nombre_completo:nombre,cargo:edit.cargo?.trim()||null,nro_colegiatura:edit.nro_colegiatura?.trim()||null};
}
