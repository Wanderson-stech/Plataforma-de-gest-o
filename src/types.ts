export type Product = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  expiration_date?: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductInput = Pick<Product, 'name' | 'category' | 'quantity' | 'expiration_date'>;
