export type Product = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  created_at: string;
  updated_at: string;
};

export type ProductInput = Pick<Product, 'name' | 'category' | 'quantity'>;
