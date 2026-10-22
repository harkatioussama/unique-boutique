import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import {
  onAuthStateChanged,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
} from 'firebase/firestore';
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Box,
  Boxes,
  CirclePlus,
  Gem,
  LayoutDashboard,
  LogOut,
  Package,
  Pencil,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { auth, checkStoreAdmin, firestore } from '@/lib/firebase';
import {
  formatDzd,
  isProduct,
  type Product,
} from '@/lib/catalog';
import {
  importSampleCatalog,
  removeCategory,
  removeProduct,
  saveCategory,
  saveProduct,
  toDocumentId,
  type ProductInput,
} from '@/lib/firestore-catalog';

type Section = 'overview' | 'products' | 'categories';

type CategoryRecord = { id: string; name: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function AdminGate() {
  const [, navigate] = useLocation();
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        if (active) navigate('/admin/login');
        return;
      }
      try {
        const result = await checkStoreAdmin(currentUser);
        if (!result.authorized) {
          await signOut(auth);
          if (active) navigate('/admin/login');
          return;
        }
        if (active) setUser(currentUser);
      } catch (cause) {
        console.error('Could not verify dashboard access', cause);
        if (active) setError('We could not verify administrator access. Check your connection and Firestore rules.');
      } finally {
        if (active) setChecking(false);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [navigate]);

  if (checking) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f6f5f2] text-sm text-slate-500">Loading your workspace...</div>;
  }
  if (!user) {
    return <div role="alert" className="flex min-h-screen items-center justify-center bg-[#f6f5f2] p-6 text-center text-sm text-red-700">{error || 'Redirecting to sign in...'}</div>;
  }
  return <AdminWorkspace user={user} />;
}

function AdminWorkspace({ user }: { user: User }) {
  const [, navigate] = useLocation();
  const [section, setSection] = useState<Section>('overview');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [catalogManaged, setCatalogManaged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let readyCount = 0;
    const markReady = () => {
      readyCount += 1;
      if (readyCount >= 3) setLoading(false);
    };
    const reportError = (error: Error) => {
      console.error('Admin catalogue subscription failed', error);
      setLoadError('Could not load the catalogue. Confirm Firestore is created and its security rules are published.');
      markReady();
    };
    const unsubscribers = [
      onSnapshot(collection(firestore, 'products'), (snapshot) => {
        const rows = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
        const validRows = rows.filter(isProduct);
        if (validRows.length !== rows.length) {
          console.error('Some product documents have invalid fields and were excluded.');
          setLoadError('Some product records have invalid data. Edit or remove those records in Firestore.');
        } else {
          setLoadError('');
        }
        setProducts(validRows);
        markReady();
      }, reportError),
      onSnapshot(collection(firestore, 'categories'), (snapshot) => {
        setCategories(snapshot.docs.map((item) => ({
          id: item.id,
          name: typeof item.data().name === 'string' ? item.data().name : '',
        })).filter((item) => item.name));
        markReady();
      }, reportError),
      onSnapshot(doc(firestore, 'settings', 'catalog'), (snapshot) => {
        setCatalogManaged(snapshot.exists());
        markReady();
      }, reportError),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) =>
      `${product.name} ${product.category} ${product.collection}`.toLowerCase().includes(query),
    );
  }, [products, search]);
  const featuredCount = products.filter((product) => product.featured).length;
  const madeToOrderCount = products.filter((product) => product.stockStatus === 'Made to order').length;

  async function logout() {
    try {
      await signOut(auth);
      navigate('/admin/login');
    } catch (error) {
      console.error('Admin sign-out failed', error);
      setNotice(errorMessage(error));
    }
  }

  async function seedSampleCatalog() {
    if (!window.confirm('Add the 12 sample jewellery products and their categories to Firestore?')) return;
    setSaving(true);
    setNotice('');
    try {
      await importSampleCatalog();
      setNotice('Starter catalogue published. Your storefront is now using Firestore products.');
    } catch (error) {
      console.error('Starter catalogue import failed', error);
      setNotice(`Could not publish the starter catalogue: ${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const slug = toDocumentId(String(form.get('slug') || name));
    const imageUrls = String(form.get('images') || '')
      .split('\n')
      .map((image) => image.trim())
      .filter(Boolean);
    const variants = String(form.get('variants') || '')
      .split(',')
      .map((variant) => variant.trim())
      .filter(Boolean);
    const priceDzd = Number(form.get('priceDzd'));
    if (!slug || imageUrls.length === 0 || variants.length === 0 || !Number.isFinite(priceDzd) || priceDzd < 0) {
      setNotice('Enter a valid name, non-negative price, at least one image URL and one variant.');
      return;
    }
    const product: ProductInput = {
      slug,
      name,
      category: String(form.get('category') || '').trim(),
      collection: String(form.get('collection') || '').trim(),
      priceDzd,
      images: imageUrls.map((src) => ({ src, alt: `${name} jewellery` })),
      description: String(form.get('description') || '').trim(),
      material: String(form.get('material') || '').trim(),
      variants,
      stockStatus: String(form.get('stockStatus')) as Product['stockStatus'],
      featured: form.get('featured') === 'on',
      bestseller: form.get('bestseller') === 'on',
    };
    setSaving(true);
    setNotice('');
    try {
      await saveProduct(editingProduct?.id, product);
      setProductFormOpen(false);
      setEditingProduct(null);
      setNotice(editingProduct ? 'Product updated.' : 'Product added to your catalogue.');
    } catch (error) {
      console.error('Product save failed', error);
      setNotice(`Could not save product: ${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`Delete ${product.name}? This cannot be undone.`)) return;
    try {
      await removeProduct(product.id);
      setNotice(`${product.name} was deleted.`);
    } catch (error) {
      console.error('Product deletion failed', error);
      setNotice(`Could not delete product: ${errorMessage(error)}`);
    }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('categoryName') || '').trim();
    if (!name) return;
    if (categories.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
      setNotice('That category already exists.');
      return;
    }
    setSaving(true);
    try {
      await saveCategory(name);
      setCategoryFormOpen(false);
      setNotice(`${name} category added.`);
    } catch (error) {
      console.error('Category save failed', error);
      setNotice(`Could not add category: ${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(category: CategoryRecord) {
    if (!window.confirm(`Delete the ${category.name} category?`)) return;
    try {
      await removeCategory(category.name);
      setNotice(`${category.name} category deleted.`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f6f5f2] text-sm text-slate-500">Loading your catalogue...</div>;
  }

  const navItems: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'categories', label: 'Categories', icon: Boxes },
  ];

  return (
    <div className="min-h-screen bg-[#f6f5f2] text-[#22221f] lg:flex">
      <aside className="flex w-full flex-col justify-between border-b border-[#e8e5de] bg-white px-5 py-5 lg:fixed lg:inset-y-0 lg:w-64 lg:border-b-0 lg:border-r lg:px-6 lg:py-7">
        <div>
          <Link href="/" className="inline-flex items-center gap-3 text-xl font-semibold tracking-[0.28em]">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#173c3b] text-white"><Gem size={18} /></span>
            UNIQUE
          </Link>
          <p className="mb-7 ml-[52px] mt-1 text-[9px] tracking-[0.25em] text-slate-400">OWNER STUDIO</p>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Workspace</p>
          <nav className="flex gap-2 overflow-x-auto lg:flex-col">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setSection(id)}
                className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${section === id ? 'bg-[#eaf0ed] font-medium text-[#173c3b]' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
              >
                <Icon size={17} strokeWidth={1.7} />{label}
                {id === 'products' && <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">{products.length}</span>}
              </button>
            ))}
          </nav>
        </div>
        <div className="hidden rounded-xl bg-[#f6f5f2] p-4 lg:block">
          <div className="flex items-center gap-2 text-xs font-medium"><ShieldCheck size={15} className="text-[#32615b]" /> Secure workspace</div>
          <p className="mt-2 truncate text-xs text-slate-500">{user.email}</p>
          <button onClick={logout} className="mt-4 flex items-center gap-2 text-xs text-slate-500 hover:text-red-700"><LogOut size={14} /> Sign out</button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-7 lg:ml-64 lg:px-10 lg:py-9">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-[#e3e0d9] pb-6">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#648078]">UNIQUE · ALGIERS</p>
            <h1 className="mt-2 text-2xl font-medium tracking-tight sm:text-3xl">
              {section === 'overview' ? 'Good to see you.' : section === 'products' ? 'Your products' : 'Your categories'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {section === 'overview' ? 'A clear view of your jewellery store.' : section === 'products' ? 'Create, update and publish your catalogue.' : 'Keep your collection organised.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="rounded-lg border border-[#dedbd4] bg-white px-3 py-2 text-sm hover:bg-slate-50">View store</Link>
            {section !== 'categories' && (
              <button onClick={() => { setEditingProduct(null); setProductFormOpen(true); }} className="inline-flex items-center gap-2 rounded-lg bg-[#173c3b] px-3 py-2 text-sm text-white hover:bg-[#24524e]">
                <CirclePlus size={16} /> Add product
              </button>
            )}
            <button onClick={logout} aria-label="Sign out" className="rounded-lg border border-[#dedbd4] bg-white p-2 text-slate-600 hover:text-red-700 lg:hidden"><LogOut size={17} /></button>
          </div>
        </header>

        {!catalogManaged && (
          <section className="mb-6 flex flex-col justify-between gap-4 rounded-xl border border-[#d9e4de] bg-[#edf4ef] p-5 sm:flex-row sm:items-center">
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#32615b]"><Sparkles size={18} /></span>
              <div>
                <h2 className="text-sm font-semibold">Your live catalogue is ready to set up</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-600">The shop is showing its sample products. Publish them to Firestore to manage the live catalogue here; you can then edit, add or remove pieces.</p>
              </div>
            </div>
            <button disabled={saving} onClick={seedSampleCatalog} className="shrink-0 rounded-lg bg-[#173c3b] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
              {saving ? 'Publishing...' : 'Publish starter catalogue'}
            </button>
          </section>
        )}

        {loadError && <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</div>}
        {notice && <div role="status" className="mb-5 flex items-start justify-between gap-3 rounded-lg border border-[#d9e4de] bg-white px-4 py-3 text-sm text-slate-700"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={16} /></button></div>}

        {section === 'overview' && (
          <Overview
            products={products}
            categories={categories}
            featuredCount={featuredCount}
            madeToOrderCount={madeToOrderCount}
            setSection={setSection}
            beginAdd={() => { setEditingProduct(null); setProductFormOpen(true); }}
          />
        )}
        {section === 'products' && (
          <ProductsSection
            products={visibleProducts}
            totalCount={products.length}
            search={search}
            setSearch={setSearch}
            onEdit={(product) => { setEditingProduct(product); setProductFormOpen(true); }}
            onDelete={deleteProduct}
            onAdd={() => { setEditingProduct(null); setProductFormOpen(true); }}
          />
        )}
        {section === 'categories' && (
          <CategoriesSection
            categories={categories}
            products={products}
            onAdd={() => setCategoryFormOpen(true)}
            onDelete={deleteCategory}
          />
        )}
      </main>

      {productFormOpen && (
        <ProductForm
          key={editingProduct?.id || 'new'}
          product={editingProduct}
          categories={categories.map((category) => category.name)}
          saving={saving}
          onClose={() => { setProductFormOpen(false); setEditingProduct(null); }}
          onSubmit={submitProduct}
        />
      )}
      {categoryFormOpen && (
        <CategoryForm
          saving={saving}
          onClose={() => setCategoryFormOpen(false)}
          onSubmit={addCategory}
        />
      )}
    </div>
  );
}

function Overview({
  products,
  categories,
  featuredCount,
  madeToOrderCount,
  setSection,
  beginAdd,
}: {
  products: Product[];
  categories: CategoryRecord[];
  featuredCount: number;
  madeToOrderCount: number;
  setSection: (section: Section) => void;
  beginAdd: () => void;
}) {
  const latest = [...products].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 5);
  const cards = [
    { title: 'Total products', value: products.length, detail: 'Pieces in your catalogue', icon: Package },
    { title: 'Categories', value: categories.length, detail: 'Ways to explore your edit', icon: Boxes },
    { title: 'Featured pieces', value: featuredCount, detail: 'Highlighted in the shop', icon: Sparkles },
    { title: 'Made to order', value: madeToOrderCount, detail: 'Crafted when requested', icon: BadgeCheck },
  ];
  return (
    <div className="space-y-7">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ title, value, detail, icon: Icon }, index) => (
          <article key={title} className="rounded-xl border border-[#e8e5de] bg-white p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{title}</span>
              <Icon size={17} className={index === 0 ? 'text-[#32615b]' : 'text-slate-400'} />
            </div>
            <p className="mt-5 text-3xl font-medium tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-slate-400">{detail}</p>
          </article>
        ))}
      </section>
      <section className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="rounded-xl border border-[#e8e5de] bg-white">
          <div className="flex items-center justify-between border-b border-[#efede8] px-5 py-4">
            <div><h2 className="font-medium">Catalogue overview</h2><p className="mt-1 text-xs text-slate-500">A quick look at your products</p></div>
            <button onClick={() => setSection('products')} className="text-sm text-[#32615b] hover:underline">View all</button>
          </div>
          {latest.length === 0 ? (
            <div className="p-8 text-center">
              <Package size={25} className="mx-auto text-slate-300" />
              <p className="mt-3 text-sm font-medium">Your catalogue is empty</p>
              <button onClick={beginAdd} className="mt-3 text-sm text-[#32615b] hover:underline">Add your first product</button>
            </div>
          ) : (
            <div className="divide-y divide-[#efede8]">
              {latest.map((product) => (
                <div key={product.id} className="flex items-center gap-3 px-5 py-3">
                  <img src={product.images[0].src} alt="" className="h-11 w-11 rounded-lg bg-[#f5f3ee] object-cover" />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{product.name}</p><p className="mt-0.5 text-xs text-slate-500">{product.category} · {product.stockStatus}</p></div>
                  <span className="text-sm tabular-nums">{formatDzd(product.priceDzd)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-[#e8e5de] bg-white p-5">
          <h2 className="font-medium">Quick actions</h2>
          <p className="mt-1 text-xs text-slate-500">Common catalogue tasks</p>
          <div className="mt-5 space-y-3">
            <button onClick={beginAdd} className="flex w-full items-center gap-3 rounded-lg border border-[#efede8] p-3 text-left hover:bg-[#faf9f6]"><span className="rounded-lg bg-[#edf4ef] p-2 text-[#32615b]"><CirclePlus size={17} /></span><span><b className="block text-sm font-medium">Add a product</b><small className="text-xs text-slate-500">Create a new piece in your shop</small></span><ArrowUpRight size={15} className="ml-auto text-slate-400" /></button>
            <button onClick={() => setSection('categories')} className="flex w-full items-center gap-3 rounded-lg border border-[#efede8] p-3 text-left hover:bg-[#faf9f6]"><span className="rounded-lg bg-[#f5f2eb] p-2 text-[#806941]"><Boxes size={17} /></span><span><b className="block text-sm font-medium">Organise categories</b><small className="text-xs text-slate-500">Manage how products are grouped</small></span><ArrowUpRight size={15} className="ml-auto text-slate-400" /></button>
            <button onClick={() => setSection('products')} className="flex w-full items-center gap-3 rounded-lg border border-[#efede8] p-3 text-left hover:bg-[#faf9f6]"><span className="rounded-lg bg-[#f3eef0] p-2 text-[#805b6b]"><Box size={17} /></span><span><b className="block text-sm font-medium">Review your products</b><small className="text-xs text-slate-500">Search and update the catalogue</small></span><ArrowUpRight size={15} className="ml-auto text-slate-400" /></button>
          </div>
        </div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e8e5de] bg-white px-5 py-4">
        <div className="flex items-center gap-3"><span className="rounded-full bg-[#edf4ef] p-2 text-[#32615b]"><ShieldCheck size={17} /></span><div><p className="text-sm font-medium">Storefront catalogue connected</p><p className="text-xs text-slate-500">Changes saved here appear on the public shop.</p></div></div>
        <span className="inline-flex items-center gap-1.5 text-xs text-[#32615b]"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Live sync <ArrowDownRight size={14} /></span>
      </div>
    </div>
  );
}

function ProductsSection({
  products,
  totalCount,
  search,
  setSearch,
  onEdit,
  onDelete,
  onAdd,
}: {
  products: Product[];
  totalCount: number;
  search: string;
  setSearch: (value: string) => void;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onAdd: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#e8e5de] bg-white">
      <div className="flex flex-col justify-between gap-3 border-b border-[#efede8] p-4 sm:flex-row sm:items-center">
        <div><h2 className="font-medium">All products <span className="ml-1 text-sm font-normal text-slate-400">{totalCount}</span></h2><p className="mt-1 text-xs text-slate-500">Your live jewellery catalogue</p></div>
        <label className="relative block sm:w-64"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products" className="w-full rounded-lg border border-[#e8e5de] bg-[#fcfbf9] py-2 pl-9 pr-3 text-sm outline-none focus:border-[#648078]" /></label>
      </div>
      {products.length === 0 ? (
        <div className="p-12 text-center"><Package size={28} className="mx-auto text-slate-300" /><h3 className="mt-3 font-medium">{totalCount ? 'No products match your search' : 'No products yet'}</h3><p className="mt-1 text-sm text-slate-500">Add a product to start building your catalogue.</p><button onClick={onAdd} className="mt-4 rounded-lg bg-[#173c3b] px-4 py-2 text-sm text-white">Add product</button></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[#faf9f6] text-xs font-medium text-slate-500"><tr><th className="px-5 py-3">Product</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Availability</th><th className="px-4 py-3">Featured</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-[#efede8]">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-[#fcfbf9]">
                  <td className="px-5 py-3"><div className="flex items-center gap-3"><img src={product.images[0].src} alt="" className="h-12 w-12 rounded-lg bg-[#f5f3ee] object-cover" /><div><p className="font-medium">{product.name}</p><p className="mt-0.5 text-xs text-slate-400">{product.collection}</p></div></div></td>
                  <td className="px-4 py-3 text-slate-600">{product.category}</td>
                  <td className="px-4 py-3 tabular-nums">{formatDzd(product.priceDzd)}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs ${product.stockStatus === 'Sold out' ? 'bg-red-50 text-red-700' : product.stockStatus === 'Made to order' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>{product.stockStatus}</span></td>
                  <td className="px-4 py-3 text-slate-500">{product.featured ? 'Yes' : '—'}</td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-1"><button onClick={() => onEdit(product)} aria-label={`Edit ${product.name}`} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Pencil size={15} /></button><button onClick={() => onDelete(product)} aria-label={`Delete ${product.name}`} className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-700"><Trash2 size={15} /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CategoriesSection({
  categories,
  products,
  onAdd,
  onDelete,
}: {
  categories: CategoryRecord[];
  products: Product[];
  onAdd: () => void;
  onDelete: (category: CategoryRecord) => void;
}) {
  return (
    <section className="rounded-xl border border-[#e8e5de] bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#efede8] p-5">
        <div><h2 className="font-medium">Product categories</h2><p className="mt-1 text-xs text-slate-500">Categories are used by your shop filters.</p></div>
        <button onClick={onAdd} className="inline-flex items-center gap-2 rounded-lg bg-[#173c3b] px-3 py-2 text-sm text-white"><CirclePlus size={15} /> Add category</button>
      </header>
      {categories.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No Firestore categories yet. Publish the starter catalogue or add a category.</div> : (
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {categories.map((category) => {
            const count = products.filter((product) => product.category === category.name).length;
            return <article key={category.id} className="flex items-center gap-3 rounded-lg border border-[#efede8] p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#edf4ef] text-[#32615b]"><Boxes size={17} /></span>
              <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-medium">{category.name}</h3><p className="mt-1 text-xs text-slate-500">{count} {count === 1 ? 'product' : 'products'}</p></div>
              <button onClick={() => onDelete(category)} aria-label={`Delete ${category.name} category`} className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-700"><Trash2 size={15} /></button>
            </article>;
          })}
        </div>
      )}
    </section>
  );
}

function ProductForm({
  product,
  categories,
  saving,
  onClose,
  onSubmit,
}: {
  product: Product | null;
  categories: string[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const fieldClass = 'mt-1.5 w-full rounded-lg border border-[#e5e2da] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#648078]';
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form onSubmit={onSubmit} className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-[#fbfaf7] p-5 shadow-2xl sm:rounded-2xl sm:p-7">
        <header className="mb-6 flex items-start justify-between"><div><p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#648078]">CATALOGUE</p><h2 className="mt-1 text-xl font-medium">{product ? 'Edit product' : 'Add a product'}</h2><p className="mt-1 text-sm text-slate-500">Product details update the live storefront.</p></div><button type="button" onClick={onClose} disabled={saving} aria-label="Close form" className="rounded-lg p-2 hover:bg-slate-100"><X size={18} /></button></header>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Product name<input name="name" required defaultValue={product?.name} className={fieldClass} /></label>
          <label className="text-sm">URL slug<input name="slug" required defaultValue={product?.slug} placeholder="e.g. nour-signet-ring" className={fieldClass} /></label>
          <label className="text-sm">Category<input name="category" required list="admin-categories" defaultValue={product?.category} className={fieldClass} /><datalist id="admin-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist></label>
          <label className="text-sm">Collection<input name="collection" required defaultValue={product?.collection} placeholder="The Heirloom Edit" className={fieldClass} /></label>
          <label className="text-sm">Price (DZD)<input name="priceDzd" required type="number" min="0" step="1" defaultValue={product?.priceDzd} className={fieldClass} /></label>
          <label className="text-sm">Availability<select name="stockStatus" defaultValue={product?.stockStatus || 'In stock'} className={fieldClass}><option>In stock</option><option>Made to order</option><option>Sold out</option></select></label>
          <label className="text-sm sm:col-span-2">Image URLs <span className="text-slate-400">(one per line)</span><textarea name="images" required rows={2} defaultValue={product?.images.map((image) => image.src).join('\n')} className={fieldClass} placeholder="https://..." /></label>
          <label className="text-sm sm:col-span-2">Description<textarea name="description" required rows={3} defaultValue={product?.description} className={fieldClass} /></label>
          <label className="text-sm">Material<input name="material" required defaultValue={product?.material} className={fieldClass} /></label>
          <label className="text-sm">Variants <span className="text-slate-400">(comma separated)</span><input name="variants" required defaultValue={product?.variants.join(', ')} className={fieldClass} /></label>
          <div className="flex gap-5 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="featured" defaultChecked={product?.featured} className="accent-[#173c3b]" /> Feature on homepage</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="bestseller" defaultChecked={product?.bestseller} className="accent-[#173c3b]" /> Mark bestseller</label>
          </div>
        </div>
        <footer className="mt-7 flex justify-end gap-2 border-t border-[#e8e5de] pt-5"><button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-[#dedbd4] px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={saving} className="rounded-lg bg-[#173c3b] px-5 py-2 text-sm text-white disabled:opacity-50">{saving ? 'Saving...' : product ? 'Save changes' : 'Create product'}</button></footer>
      </form>
    </div>
  );
}

function CategoryForm({
  saving,
  onClose,
  onSubmit,
}: {
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-2xl bg-[#fbfaf7] p-6 shadow-2xl">
        <header className="mb-5 flex items-start justify-between"><div><h2 className="text-xl font-medium">Add category</h2><p className="mt-1 text-sm text-slate-500">A category will appear in the shop filters.</p></div><button type="button" onClick={onClose} aria-label="Close form" className="rounded-lg p-2 hover:bg-slate-100"><X size={18} /></button></header>
        <label className="block text-sm">Category name<input autoFocus name="categoryName" required maxLength={40} className="mt-1.5 w-full rounded-lg border border-[#e5e2da] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#648078]" placeholder="e.g. Pendants" /></label>
        <footer className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-[#dedbd4] px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={saving} className="rounded-lg bg-[#173c3b] px-5 py-2 text-sm text-white disabled:opacity-50">{saving ? 'Saving...' : 'Create category'}</button></footer>
      </form>
    </div>
  );
}

export function AdminDashboardPage() {
  return <AdminGate />;
}
