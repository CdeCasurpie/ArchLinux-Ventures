import {Capacitor} from '@capacitor/core';
import {createTimedFetch} from './features/timed-fetch';
import {IndexedRepository,SQLiteRepository,IndexedWorkspaceRepository,SQLiteWorkspaceRepository,SQLiteMediaOutboxRepository,IndexedMediaOutboxRepository} from '@archforms/data-local';
import type {MediaOutboxRepository} from '@archforms/application';
import {createClient} from '@archforms/data-supabase';
import type {Database} from '@archforms/contracts';
const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured=Boolean(url&&key);
export const supabase=createClient<Database>(url||'http://127.0.0.1:54321',key||'not-configured',{
 global:{fetch:createTimedFetch(fetch.bind(globalThis))},
 auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
export const local=Capacitor.isNativePlatform()?new SQLiteRepository():new IndexedRepository();
export const workspaceLocal=Capacitor.isNativePlatform()?new SQLiteWorkspaceRepository():new IndexedWorkspaceRepository();
/** Media outbox: SQLite on native, IndexedDB on web. Same contract, same engine. */
export const mediaOutbox: MediaOutboxRepository=Capacitor.isNativePlatform()?new SQLiteMediaOutboxRepository():new IndexedMediaOutboxRepository();
export type OutboxRepoType=MediaOutboxRepository;
