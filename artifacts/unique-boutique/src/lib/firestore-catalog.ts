import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { categories as sampleCategories, products as sampleProducts } from '@/lib/catalog';
import type { Product } from '@/lib/catalog';

export type ProductInput = Omit<Product, 'id'>;

export function toDocumentId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function saveProduct(id: string | undefined, product: ProductInput) {
  const existingProducts = await getDocs(collection(firestore, 'products'));
  if (existingProducts.docs.some((item) => (
    item.id !== id && item.data().slug === product.slug
  ))) {
    throw new Error('That product URL slug is already in use.');
  }
  const categoryId = toDocumentId(product.category);
  if (!categoryId) throw new Error('Enter a valid product category.');
  const categoryReference = doc(firestore, 'categories', categoryId);
  const categorySnapshot = await getDoc(categoryReference);
  if (categorySnapshot.exists() && categorySnapshot.data().name !== product.category) {
    throw new Error('This category name conflicts with an existing category URL.');
  }
  const reference = id
    ? doc(firestore, 'products', id)
    : doc(collection(firestore, 'products'));
  const batch = writeBatch(firestore);
  batch.set(reference, {
    ...product,
    id: reference.id,
    updatedAt: serverTimestamp(),
    ...(id ? {} : { createdAt: serverTimestamp() }),
  }, { merge: true });
  batch.set(doc(firestore, 'settings', 'catalog'), {
    source: 'firestore',
    updatedAt: serverTimestamp(),
  }, { merge: true });
  if (!categorySnapshot.exists()) {
    batch.set(categoryReference, {
      name: product.category,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function removeProduct(id: string) {
  await deleteDoc(doc(firestore, 'products', id));
}

export async function saveCategory(name: string) {
  const id = toDocumentId(name);
  if (!id) throw new Error('Enter a category name containing letters or numbers.');
  const reference = doc(firestore, 'categories', id);
  const existing = await getDoc(reference);
  if (existing.exists()) throw new Error('A category with this name or URL slug already exists.');
  const batch = writeBatch(firestore);
  batch.set(reference, {
    name: name.trim(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(firestore, 'settings', 'catalog'), {
    source: 'firestore',
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await batch.commit();
}

export async function removeCategory(name: string) {
  const [productsSnapshot, categoriesSnapshot] = await Promise.all([
    getDocs(collection(firestore, 'products')),
    getDocs(collection(firestore, 'categories')),
  ]);
  const linkedProducts = productsSnapshot.docs.filter(
    (product) => product.data().category === name,
  );
  if (linkedProducts.length > 0) {
    throw new Error(`Move or delete the ${linkedProducts.length} products in this category first.`);
  }
  const category = categoriesSnapshot.docs.find((item) => item.data().name === name);
  if (category) await deleteDoc(category.ref);
}

export async function importSampleCatalog() {
  const existingProducts = await getDocs(collection(firestore, 'products'));
  const existingCatalog = await getDoc(doc(firestore, 'settings', 'catalog'));
  if (existingProducts.size > 0 || existingCatalog.exists()) {
    throw new Error('A live catalogue already exists. The starter import will not overwrite it.');
  }
  const batch = writeBatch(firestore);
  for (const product of sampleProducts) {
    batch.set(doc(firestore, 'products', product.id), {
      ...product,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  for (const name of sampleCategories) {
    batch.set(doc(firestore, 'categories', toDocumentId(name)), {
      name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  batch.set(doc(firestore, 'settings', 'catalog'), {
    source: 'firestore',
    initializedAt: serverTimestamp(),
  });
  await batch.commit();
}
