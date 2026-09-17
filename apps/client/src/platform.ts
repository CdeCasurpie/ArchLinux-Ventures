import {Capacitor} from '@capacitor/core';
import {IndexedRepository,SQLiteRepository,IndexedWorkspaceRepository,SQLiteWorkspaceRepository} from '@archforms/data-local';
import {createClient} from '@archforms/data-supabase';
import type {Database} from '@archforms/contracts';
const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured=Boolean(url&&key);
export const supabase=createClient<Database>(url||'http://127.0.0.1:54321',key||'not-configured',{
 auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
export const local=Capacitor.isNativePlatform()?new SQLiteRepository():new IndexedRepository();
export const workspaceLocal=Capacitor.isNativePlatform()?new SQLiteWorkspaceRepository():new IndexedWorkspaceRepository();
