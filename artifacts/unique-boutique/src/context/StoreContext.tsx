import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { categories as defaultCategories, isProduct, products as sampleProducts } from '@/lib/catalog';
import type { Product } from '@/lib/catalog';

type StoreContextType = {
  products: Product[];
  categories: string[];
  catalogLoading: boolean;
  catalogError: string;
  catalogManaged: boolean;
  cart: Record<string, number>; wishlist: string[];
  addToCart: (id: string, quantity?: number) => void;
  setQuantity: (id: string, quantity: number) => void;
  removeFromCart: (id: string) => void;
  toggleWishlist: (id: string) => void;
  isWishlisted: (id: string) => boolean;
  cartProducts: { product: Product; quantity: number }[];
  subtotal: number; cartCount: number;
};
const StoreContext = createContext<StoreContextType | null>(null);
const readValue = <T,>(key: string, fallback: T): T => {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; }
  catch { return fallback; }
};
export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Record<string, number>>(() => readValue('unique-cart', {}));
  const [wishlist, setWishlist] = useState<string[]>(() => readValue('unique-wishlist', []));
  const [remoteProducts, setRemoteProducts] = useState<Product[]>([]);
  const [remoteCategories, setRemoteCategories] = useState<string[]>([]);
  const [catalogManaged, setCatalogManaged] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');

  useEffect(() => {
    let ready = 0;
    const markReady = () => {
      ready += 1;
      if (ready === 3) setCatalogLoading(false);
    };
    const handleError = (error: Error) => {
      console.error('Store catalogue sync failed', error);
      setCatalogError('Live catalogue could not be loaded. Showing the sample catalogue instead.');
      markReady();
    };
    const unsubscribers = [
      onSnapshot(collection(firestore, 'products'), (snapshot) => {
        const parsedProducts = snapshot.docs.map((item) => ({
          ...item.data(),
          id: item.id,
        }));
        const validProducts = parsedProducts.filter(isProduct);
        if (validProducts.length !== parsedProducts.length) {
          console.error('Some Firestore products have invalid catalogue fields.');
          setCatalogError('Some live products have invalid data and were hidden from the storefront.');
        }
        setRemoteProducts(validProducts);
        markReady();
      }, handleError),
      onSnapshot(collection(firestore, 'categories'), (snapshot) => {
        setRemoteCategories(snapshot.docs
          .map((item) => item.data().name)
          .filter((name): name is string => typeof name === 'string' && name.length > 0));
        markReady();
      }, handleError),
      onSnapshot(doc(firestore, 'settings', 'catalog'), (snapshot) => {
        setCatalogManaged(snapshot.exists());
        markReady();
      }, handleError),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const products = remoteProducts.length > 0 || catalogManaged
    ? remoteProducts
    : sampleProducts;
  const categories = remoteCategories.length > 0 || catalogManaged
    ? remoteCategories
    : defaultCategories;

  useEffect(() => { localStorage.setItem('unique-cart', JSON.stringify(cart)); }, [cart]);
  useEffect(() => { localStorage.setItem('unique-wishlist', JSON.stringify(wishlist)); }, [wishlist]);
  const addToCart = useCallback((id: string, quantity = 1) => setCart(old => ({ ...old, [id]: (old[id] || 0) + quantity })), []);
  const setQuantity = useCallback((id: string, quantity: number) => setCart(old => {
    if (quantity < 1) { const next = { ...old }; delete next[id]; return next; }
    return { ...old, [id]: Math.min(12, quantity) };
  }), []);
  const removeFromCart = useCallback((id: string) => setCart(old => { const next = { ...old }; delete next[id]; return next; }), []);
  const toggleWishlist = useCallback((id: string) => setWishlist(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]), []);
  const value = useMemo(() => {
    const cartProducts = products.filter(p => cart[p.id]).map(product => ({ product, quantity: cart[product.id] }));
    return { products, categories, catalogLoading, catalogError, catalogManaged, cart, wishlist, addToCart, setQuantity, removeFromCart, toggleWishlist, isWishlisted: (id: string) => wishlist.includes(id), cartProducts, subtotal: cartProducts.reduce((sum, item) => sum + item.product.priceDzd * item.quantity, 0), cartCount: Object.values(cart).reduce((n, q) => n + q, 0) };
  }, [products, categories, catalogLoading, catalogError, catalogManaged, cart, wishlist, addToCart, setQuantity, removeFromCart, toggleWishlist]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
export function useStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside StoreProvider');
  return value;
}

export function CatalogSyncNotice() {
  const { catalogError } = useStore();
  if (!catalogError) return null;
  return (
    <div role="status" className="bg-amber-50 px-5 py-3 text-center text-sm text-amber-900">
      {catalogError}
    </div>
  );
}
