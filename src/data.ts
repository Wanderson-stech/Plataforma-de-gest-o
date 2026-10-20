import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Product, ProductInput } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
const localKey = 'orbe-stock-products-v1';

function ensureStorageConfigured() {
  if (!supabase && !import.meta.env.DEV) {
    throw new Error('O Supabase não foi configurado para este ambiente.');
  }
}

function readLocal(): Product[] {
  try { return JSON.parse(localStorage.getItem(localKey) ?? '[]') as Product[]; }
  catch { return []; }
}

function writeLocal(products: Product[]) { localStorage.setItem(localKey, JSON.stringify(products)); }

export async function getProducts(): Promise<Product[]> {
  ensureStorageConfigured();
  if (!supabase) return readLocal().sort((a, b) => a.name.localeCompare(b.name));
  const { data, error } = await supabase.from('products').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as Product[];
}

export async function addProduct(input: ProductInput): Promise<Product> {
  ensureStorageConfigured();
  if (!supabase) {
    const now = new Date().toISOString();
    const product: Product = { ...input, id: crypto.randomUUID(), created_at: now, updated_at: now };
    writeLocal([...readLocal(), product]);
    return product;
  }
  const { data, error } = await supabase.from('products').insert(input).select().single();
  if (error) throw error;
  return data as Product;
}

export async function updateQuantity(id: string, quantity: number): Promise<void> {
  ensureStorageConfigured();
  if (!supabase) {
    writeLocal(readLocal().map((item) => item.id === id ? { ...item, quantity, updated_at: new Date().toISOString() } : item));
    return;
  }
  const { error } = await supabase.from('products').update({ quantity, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteProduct(id: string): Promise<void> {
  ensureStorageConfigured();
  if (!supabase) { writeLocal(readLocal().filter((item) => item.id !== id)); return; }
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}
