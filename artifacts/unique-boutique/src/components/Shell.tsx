import { useState } from 'react';
import { Link } from 'wouter';
import { Heart, Menu, ShoppingBag, X } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import type { Product } from '@/lib/catalog';
import { formatDzd } from '@/lib/catalog';

export function Header() {
  const { cartCount, wishlist } = useStore();
  const [open, setOpen] = useState(false);
  return <>
    <div className="announcement">Complimentary delivery across Algeria on orders over 65,000 DZD</div>
    <header className="site-header">
      <div className="header-inner">
        <button className="mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)} data-testid="button-mobile-menu">{open ? <X size={21}/> : <Menu size={21}/>}</button>
        <Link className="brand" href="/" aria-label="UNIQUE home">UNIQUE<small>ALGIERS · EST. 2024</small></Link>
        <nav className={`nav-links ${open ? 'open' : ''}`} aria-label="Main navigation">
          <Link onClick={() => setOpen(false)} href="/shop" data-testid="link-shop">Shop</Link>
          <Link onClick={() => setOpen(false)} href="/collections" data-testid="link-collections">Collections</Link>
          <Link onClick={() => setOpen(false)} href="/about" data-testid="link-about">Our story</Link>
          <Link onClick={() => setOpen(false)} href="/care-guide" data-testid="link-care-guide">Care guide</Link>
        </nav>
        <div className="header-actions">
          <Link className="icon-link" href="/wishlist" aria-label={`Wishlist, ${wishlist.length} saved`} data-testid="link-wishlist"><Heart size={19} strokeWidth={1.5}/>{wishlist.length > 0 && <span className="count-badge">{wishlist.length}</span>}</Link>
          <Link className="icon-link" href="/cart" aria-label={`Shopping bag, ${cartCount} items`} data-testid="link-cart"><ShoppingBag size={19} strokeWidth={1.5}/>{cartCount > 0 && <span className="count-badge">{cartCount}</span>}</Link>
        </div>
      </div>
    </header>
  </>;
}
export function Footer() {
  return <footer className="site-footer">
    <div className="footer-top">
      <div><Link href="/" className="footer-brand">UNIQUE</Link><p className="footer-note">Jewellery made to be lived in, held close, and kept for a long time. Thoughtfully selected in Algiers.</p></div>
      <div className="footer-col"><h3>Discover</h3><Link href="/shop">Shop all jewellery</Link><Link href="/collections">Collections</Link><Link href="/about">Our story</Link><Link href="/contact">Get in touch</Link></div>
      <div className="footer-col"><h3>Care & service</h3><Link href="/care-guide">Jewellery care</Link><Link href="/shipping-returns">Shipping & returns</Link><Link href="/faq">Frequently asked</Link><Link href="/contact">Contact us</Link></div>
      <div className="footer-col"><h3>A note from UNIQUE</h3><p className="footer-note">A considered collection of pieces, chosen for the way they make you feel.</p><span className="eyebrow">ALGIERS · DZ</span></div>
    </div>
    <div className="footer-bottom"><span>© 2025 UNIQUE JEWELLERY · ALGIERS, ALGERIA</span><span><Link href="/privacy">Privacy</Link> &nbsp;·&nbsp; <Link href="/terms">Terms</Link> &nbsp;·&nbsp; Prices in DZD</span></div>
  </footer>;
}
export function ProductCard({ product }: { product: Product }) {
  const { toggleWishlist, isWishlisted } = useStore();
  const saved = isWishlisted(product.id);
  return <article className="product-card" data-testid={`card-product-${product.id}`}>
    <div className="product-image-wrap">
      <Link href={`/product/${product.slug}`} aria-label={`View ${product.name}`}><img src={product.images[0].src} alt={product.images[0].alt} width="700" height="850" loading="lazy"/></Link>
      {(product.featured || product.bestseller) && <span className="product-badge">{product.bestseller ? 'Bestseller' : 'Selected piece'}</span>}
      <button className={`wishlist-toggle ${saved ? 'active' : ''}`} aria-label={saved ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`} aria-pressed={saved} onClick={() => toggleWishlist(product.id)} data-testid={`button-wishlist-${product.id}`}><Heart size={16} fill={saved ? 'currentColor' : 'none'} strokeWidth={1.5}/></button>
      <Link className="quick-view" href={`/product/${product.slug}`}>Discover the piece</Link>
    </div>
    <div className="product-meta">
      <div><Link className="product-name" href={`/product/${product.slug}`}>{product.name}</Link><div className="product-category">{product.category} · {product.collection}</div></div>
      <span className="product-price">{formatDzd(product.priceDzd)}</span>
    </div>
  </article>;
}
export function ProductGrid({ items }: { items: Product[] }) {
  return <div className="product-grid">{items.map(product => <ProductCard key={product.id} product={product}/>)}</div>;
}
