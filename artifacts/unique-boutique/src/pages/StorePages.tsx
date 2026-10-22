import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'wouter';
import { ArrowLeft, ArrowRight, Check, Heart, Minus, Plus, ShoppingBag } from 'lucide-react';
import { collections, formatDzd } from '@/lib/catalog';
import { useStore } from '@/context/StoreContext';
import { ProductGrid } from '@/components/Shell';

function Seo({ title, description }: { title: string; description: string }) {
  useEffect(() => {
    document.title = `${title} | UNIQUE Jewellery`;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement('meta'); meta.setAttribute('name','description'); document.head.appendChild(meta); }
    meta.setAttribute('content', description);
    let og = document.querySelector('meta[property="og:title"]');
    if (!og) { og = document.createElement('meta'); og.setAttribute('property','og:title'); document.head.appendChild(og); }
    og.setAttribute('content', `${title} | UNIQUE Jewellery`);
    let ogd = document.querySelector('meta[property="og:description"]');
    if (!ogd) { ogd = document.createElement('meta'); ogd.setAttribute('property','og:description'); document.head.appendChild(ogd); }
    ogd.setAttribute('content', description);
  }, [title, description]);
  return null;
}
function PageHero({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <section className="inner-hero"><span className="eyebrow">{eyebrow}</span><h1 className="display">{title}</h1><p>{copy}</p></section>;
}
export function HomePage() {
  const { products, categories: storeCategories } = useStore();
  const featured = products.filter(p => p.featured).slice(0,4);
  const defaultCategoryImages = [
    `${import.meta.env.BASE_URL}images/ring.jpg`,
    `${import.meta.env.BASE_URL}images/hero-necklace.jpg`,
    `${import.meta.env.BASE_URL}images/bracelet.jpg`,
    `${import.meta.env.BASE_URL}images/earrings.jpg`,
  ];
  const categories = storeCategories.map((name, index) => ({
    name,
    src: products.find(product => product.category === name)?.images[0]?.src || defaultCategoryImages[index % defaultCategoryImages.length],
  }));
  return <>
    <Seo title="Fine Jewellery in Algeria" description="Discover UNIQUE, a considered collection of fine jewellery selected in Algiers. Heirloom-worthy gold pieces, made to be kept close."/>
    <main className="page-main">
      <section className="hero">
        <div className="hero-copy fade-in"><span className="eyebrow">Considered pieces · Algiers</span><h1 className="display">A feeling,<br/>made tangible.</h1><p>Fine jewellery with a point of view. Chosen slowly, worn often, and kept for a long time.</p><Link className="button-dark" href="/shop">Discover the collection <ArrowRight size={14}/></Link></div>
        <div className="hero-image"><img src={`${import.meta.env.BASE_URL}images/hero-necklace.jpg`} alt="Sculptural gold necklace on limestone in late afternoon sunlight" width="1200" height="1500"/><span className="hero-label">The Mediterranean Light · 01 / 02</span></div>
      </section>
      <section className="section-pad">
        <div className="section-head"><div><span className="eyebrow">Choose your keepsake</span><h2 className="display">A piece for every day.</h2></div><Link className="quiet-link" href="/shop">Explore all jewellery</Link></div>
        <div className="category-strip">{categories.map((cat,i)=><Link className="category-tile" href={`/shop?category=${encodeURIComponent(cat.name)}`} key={cat.name}><img src={cat.src} alt={`${cat.name} jewellery`} loading="lazy"/><i>0{i+1}</i><span>{cat.name}</span></Link>)}</div>
      </section>
      <section className="section-pad" style={{paddingTop:22}}>
        <div className="section-head"><div><span className="eyebrow">A few favourites</span><h2 className="display">Loved, and lived in.</h2></div><Link className="quiet-link" href="/shop">View the full edit</Link></div>
        <div style={{maxWidth:1380,margin:'auto'}}><ProductGrid items={featured}/></div>
      </section>
      <section className="editorial-band">
        <img src={`${import.meta.env.BASE_URL}images/bracelet.jpg`} alt="A fine gold bracelet catching warm Mediterranean sunlight" loading="lazy" width="1000" height="800"/>
        <div className="editorial-copy"><span className="eyebrow">The UNIQUE point of view</span><h2 className="display">Made personal.<br/>Never ordinary.</h2><p>We believe jewellery should feel like it already belongs to you. Our edit brings together thoughtful design, considered materials and details that reward a closer look.</p><Link className="quiet-link" href="/about">A little about us <ArrowRight size={12}/></Link></div>
      </section>
      <section className="section-pad" style={{paddingTop:54,paddingBottom:54}}>
        <div className="promise-row"><div className="promise"><strong>Chosen with care</strong><span>Thoughtful materials, always</span></div><div className="promise"><strong>From Algiers, with love</strong><span>Delivery across Algeria</span></div><div className="promise"><strong>Here to help</strong><span>Personal care, at every step</span></div></div>
      </section>
    </main>
  </>;
}

export function ShopPage() {
  const { products, categories } = useStore();
  const params = new URLSearchParams(window.location.search);
  const [query,setQuery] = useState('');
  const [category,setCategory] = useState(params.get('category') || 'All');
  const [sort,setSort] = useState('featured');
  const visible = useMemo(() => {
    let items = products.filter(p => (category === 'All' || p.category === category) && `${p.name} ${p.category} ${p.collection}`.toLowerCase().includes(query.toLowerCase()));
    if (sort === 'low') items = [...items].sort((a,b)=>a.priceDzd-b.priceDzd);
    if (sort === 'high') items = [...items].sort((a,b)=>b.priceDzd-a.priceDzd);
    if (sort === 'name') items = [...items].sort((a,b)=>a.name.localeCompare(b.name));
    return items;
  },[query,category,sort]);
  const categoryFilters = ['All', ...categories];
  return <><Seo title="Shop Fine Jewellery" description="Shop rings, necklaces, bracelets and earrings from UNIQUE's considered jewellery edit. Find your next keepsake in Algeria."/><main className="page-main"><PageHero eyebrow="The UNIQUE edit" title="Find your piece." copy="A considered collection of jewellery to wear close, give with meaning, and keep."/><section className="catalog-layout">
    <div className="catalog-tools"><label className="sr-only" htmlFor="shop-search">Search jewellery</label><input id="shop-search" className="search-field" type="search" placeholder="Search the collection" value={query} onChange={e=>setQuery(e.target.value)} data-testid="input-search-products"/><span className="result-count">{visible.length} pieces</span><label className="sr-only" htmlFor="sort-products">Sort products</label><select id="sort-products" className="select-field" value={sort} onChange={e=>setSort(e.target.value)} data-testid="select-sort"><option value="featured">Curated order</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="name">Name: A to Z</option></select></div>
    <div className="filter-list" aria-label="Filter by category">{categoryFilters.map(c=><button key={c} className={`filter-chip ${category===c?'selected':''}`} aria-pressed={category===c} onClick={()=>setCategory(c)} data-testid={`filter-category-${c.toLowerCase()}`}>{c}</button>)}</div>
    {visible.length ? <ProductGrid items={visible}/> : <div className="empty-state"><h2>No pieces found.</h2><p>Try a different name or category. Your next keepsake may be just around the corner.</p><button className="button-outline" onClick={()=>{setQuery('');setCategory('All')}}>Clear filters</button></div>}
  </section></main></>;
}

export function ProductPage() {
  const { slug } = useParams<{slug:string}>();
  const { products } = useStore();
  const product = products.find(p=>p.slug===slug);
  const { addToCart, toggleWishlist, isWishlisted } = useStore();
  const [imageIndex,setImageIndex] = useState(0);
  const [variant,setVariant] = useState(product?.variants[0] || '');
  const [quantity,setQuantity] = useState(1);
  const [message,setMessage] = useState('');
  useEffect(()=>{setImageIndex(0);setVariant(product?.variants[0] || '');setQuantity(1)},[slug]);
  useEffect(()=>{if(!message)return;const timer=window.setTimeout(()=>setMessage(''),2300);return()=>window.clearTimeout(timer)},[message]);
  if(!product) return <NotFoundPage/>;
  const saved=isWishlisted(product.id);
  return <><Seo title={`${product.name} — ${product.category}`} description={`${product.description} ${formatDzd(product.priceDzd)} in Algeria.`}/><main className="page-main"><div className="product-detail">
    <section className="gallery" aria-label={`${product.name} image gallery`}>
      <div className="gallery-main"><img src={product.images[imageIndex].src} alt={product.images[imageIndex].alt} width="1000" height="1000"/></div>
      {product.images.map((im,i)=><button key={`${im.src}-${i}`} aria-label={`Show image ${i+1} of ${product.name}`} onClick={()=>setImageIndex(i)} style={{padding:0,border:i===imageIndex?'2px solid var(--sapphire-light)':'2px solid transparent',background:'transparent',cursor:'pointer'}}><img src={im.src} alt={im.alt} width="450" height="450" loading="lazy"/></button>)}
    </section>
    <section className="detail-copy"><Link className="eyebrow" href="/shop"><ArrowLeft size={12}/> {product.category} · {product.collection}</Link><h1 className="display">{product.name}</h1><p className="detail-price">{formatDzd(product.priceDzd)}</p><p className="detail-description">{product.description}</p><hr className="detail-rule"/>
      <p className="detail-attribute"><b>Material</b><br/>{product.material}</p><p className="detail-attribute"><b>Availability</b><br/>{product.stockStatus}</p>
      {product.variants.length>1 && <label className="detail-attribute" style={{display:'block',marginTop:15}}><b>Choose your size</b><br/><select className="select-field" value={variant} onChange={e=>setVariant(e.target.value)} aria-label="Choose size" style={{marginTop:8}}>{product.variants.map(v=><option key={v}>{v}</option>)}</select></label>}
      <hr className="detail-rule"/><div className="detail-actions"><div className="quantity-control"><button aria-label="Decrease quantity" onClick={()=>setQuantity(q=>Math.max(1,q-1))} data-testid="button-quantity-decrease"><Minus size={14}/></button><span>{quantity}</span><button aria-label="Increase quantity" onClick={()=>setQuantity(q=>Math.min(12,q+1))} data-testid="button-quantity-increase"><Plus size={14}/></button></div><button className="button-dark" disabled={product.stockStatus==='Sold out'} onClick={()=>{addToCart(product.id,quantity);setMessage(`${product.name} added to your bag`)}} data-testid="button-add-to-cart"><ShoppingBag size={14}/> Add to bag</button></div>
      <button onClick={()=>{toggleWishlist(product.id);setMessage(saved?'Removed from your wishlist':'Saved to your wishlist')}} aria-pressed={saved} className="quiet-link" style={{marginTop:21,background:'none',borderTop:0,borderLeft:0,borderRight:0,cursor:'pointer'}}><Heart size={14} fill={saved?'currentColor':'none'}/> {saved?'Saved to your wishlist':'Add to wishlist'}</button>
      <div className="detail-attribute" style={{marginTop:28,borderTop:'1px solid var(--line)',paddingTop:18}}>Complimentary delivery across Algeria on orders over 65,000 DZD.<br/><Link href="/shipping-returns" className="quiet-link" style={{display:'inline-block',marginTop:10}}>Shipping & returns</Link></div>
    </section>
  </div></main>{message&&<div role="status" className="toast-message">{message}</div>}</>;
}

export function CollectionsPage() {
  return <><Seo title="Jewellery Collections" description="Explore UNIQUE jewellery collections, from the heirloom edit to pieces inspired by Mediterranean light."/><main className="page-main"><PageHero eyebrow="A story in every collection" title="Collected with care." copy="Two considered edits. One feeling: finding the piece that feels like it was always yours."/><div className="collection-grid">{collections.map((c,i)=><Link key={c.slug} href={`/collections/${c.slug}`} className="collection-card"><img src={c.image} alt={c.alt} loading="lazy"/><div><p>COLLECTION 0{i+1}</p><h2>{c.name}</h2><p>{c.subtitle}</p></div></Link>)}</div></main></>;
}
export function CollectionPage() {
  const {slug}=useParams<{slug:string}>();
  const { products } = useStore();
  const collection=collections.find(c=>c.slug===slug);
  if(!collection) return <NotFoundPage/>;
  const items=products.filter(p=>p.collection===collection.name);
  return <><Seo title={collection.name} description={`${collection.subtitle} Discover the ${collection.name} from UNIQUE, selected in Algiers.`}/><main className="page-main"><PageHero eyebrow="The UNIQUE collections" title={collection.name} copy={collection.subtitle}/><section className="catalog-layout"><div className="catalog-tools"><Link className="quiet-link" href="/collections"><ArrowLeft size={12}/> All collections</Link><span className="result-count">{items.length} considered pieces</span></div><ProductGrid items={items}/></section></main></>;
}
export function CartPage() {
  const {cartProducts,setQuantity,removeFromCart,subtotal}=useStore();
  return <><Seo title="Your Jewellery Bag" description="Review your UNIQUE jewellery selection and subtotal in Algerian dinars. Checkout is not enabled in this preview."/><main className="page-main"><PageHero eyebrow="Your considered selection" title="Your bag." copy="Pieces you have chosen to keep close."/>
    {cartProducts.length===0?<div className="empty-state"><ShoppingBag size={28} strokeWidth={1}/><h2>Your bag is waiting.</h2><p>There is room for something meaningful. Explore our considered edit.</p><Link className="button-dark" href="/shop">Discover jewellery <ArrowRight size={14}/></Link></div>:
    <div className="cart-layout"><section aria-label="Items in your bag">{cartProducts.map(({product,quantity})=><article className="cart-line" key={product.id} data-testid={`cart-item-${product.id}`}><Link href={`/product/${product.slug}`}><img src={product.images[0].src} alt={product.images[0].alt} width="116" height="130"/></Link><div><h2>{product.name}</h2><p>{product.category} · {product.variants[0]}</p><div className="quantity-control"><button aria-label={`Decrease ${product.name} quantity`} onClick={()=>setQuantity(product.id,quantity-1)}><Minus size={13}/></button><span>{quantity}</span><button aria-label={`Increase ${product.name} quantity`} onClick={()=>setQuantity(product.id,quantity+1)}><Plus size={13}/></button></div><br/><button className="remove-button" onClick={()=>removeFromCart(product.id)} data-testid={`button-remove-${product.id}`}>Remove</button></div><span className="line-price">{formatDzd(product.priceDzd*quantity)}</span></article>)}</section>
      <aside className="summary-box"><h2>Bag summary</h2><div className="summary-total" style={{border:0,paddingTop:0,marginTop:0}}><span>Subtotal</span><strong>{formatDzd(subtotal)}</strong></div><p className="summary-note">Delivery is calculated and arranged personally. Complimentary delivery across Algeria on orders over 65,000 DZD.</p><button className="button-dark" style={{width:'100%',opacity:.55,cursor:'not-allowed'}} disabled aria-disabled="true">Checkout not enabled</button><p className="summary-note" style={{marginBottom:0}}>Online checkout and orders are not yet available. Please contact us to enquire about a piece.</p><Link className="quiet-link" href="/contact" style={{display:'inline-block',marginTop:17}}>Contact UNIQUE</Link></aside>
    </div>}
  </main></>;
}
export function WishlistPage() {
  const {wishlist, products}=useStore();
  const saved=products.filter(p=>wishlist.includes(p.id));
  return <><Seo title="Your Wishlist" description="The UNIQUE pieces you have saved, kept here for your next visit."/><main className="page-main"><PageHero eyebrow="A collection of your own" title="Your wishlist." copy="The pieces that caught your eye, all in one thoughtful place."/><section className="catalog-layout">{saved.length?<ProductGrid items={saved}/>:<div className="empty-state"><Heart size={28} strokeWidth={1}/><h2>Keep what you love.</h2><p>Save a piece with the heart and it will be waiting here when you return.</p><Link className="button-dark" href="/shop">Explore the edit <ArrowRight size={14}/></Link></div>}</section></main></>;
}

function EditorialPage({ kind }: {kind:'about'|'care'|'shipping'|'privacy'|'terms'}) {
  const content = {
    about:{eyebrow:'A quieter kind of jewellery',title:'An eye for the meaningful.',description:'UNIQUE is a considered jewellery boutique, selected in Algiers for the feeling a piece leaves behind.',sections:[['Our point of view','We believe the most beautiful pieces are the ones you reach for without thinking. Our edit is small by choice: thoughtful shapes, tactile finishes and details that feel personal.'],['Selected in Algiers','Rooted in the warmth and character of our home, UNIQUE brings together an intimate collection for everyday rituals and the moments worth keeping.'],['A personal experience','We are here to help you find the right piece, answer questions about care and make every selection feel considered. Reach out whenever you need us.']]},
    care:{eyebrow:'Keep close, for longer',title:'A little care goes a long way.',description:'A few simple rituals will help your jewellery keep its light, day after day.',sections:[['The daily ritual','Put your jewellery on after perfume, lotions and hair products. Remove it before swimming, bathing, exercising or sleeping. Avoid contact with water and household chemicals.'],['A gentle clean','Use a clean, soft lint-free cloth after wearing. For gold vermeil, keep cleaning gentle and dry; do not use abrasive polish or dips. Pearls prefer a dry, soft cloth and a little extra care.'],['A safe place to keep it','Store each piece separately in a soft pouch or lined box, away from direct sunlight and humidity. Keeping pieces apart helps prevent tangling and scratches.'],['Need a hand?','For material-specific advice about a UNIQUE piece, please contact us. We would be happy to help.']]},
    shipping:{eyebrow:'Made easy, from here',title:'Shipping & returns.',description:'We take care with every detail, from choosing your piece to arranging its delivery across Algeria.',sections:[['Delivery across Algeria','Delivery is arranged personally. Complimentary delivery is available on orders over 65,000 DZD; delivery fees for other orders are confirmed with you before arrangements are made. Timing depends on destination and will be shared directly.'],['Before you order','Online checkout and order processing are not enabled in this preview. Your bag is a saved selection only. Please contact UNIQUE to ask about availability, delivery and next steps. No payment is collected through this website.'],['Returns & exchanges','Because orders are handled personally, please contact us before making a purchase to confirm the return or exchange terms for your selected piece. We will clearly share those details before any order is placed.'],['Questions','We are glad to help. Visit our contact page and tell us which piece you have in mind.']]},
    privacy:{eyebrow:'Your privacy matters',title:'Privacy notice.',description:'A clear note about what this sample UNIQUE storefront does and does not store.',sections:[['Local browser storage','This Phase 1 storefront stores your bag and wishlist in your own browser using localStorage so they remain available after refresh. This information is not sent to a server.'],['No accounts or payments','There is no account registration, analytics integration, payment processing or order submission in this preview. The contact form is a local demonstration and does not transmit messages.'],['Your choices','You can clear your browser storage at any time to remove your saved bag and wishlist. For questions, contact details for UNIQUE can be requested through the contact page.']]},
    terms:{eyebrow:'A note before you browse',title:'Terms of use.',description:'Terms for using this sample storefront, where prices and saved selections are for preview only.',sections:[['A preview storefront','This website demonstrates the UNIQUE customer storefront using local sample catalogue data. Product availability and prices are illustrative and do not create an offer or order.'],['No purchase or payment','Checkout, orders and payments are not enabled. Adding a piece to your bag only saves a local selection in your browser; no order is created.'],['Product details','We aim to describe materials and pieces clearly. Sample descriptions, pricing and availability should be confirmed directly with UNIQUE before any purchase.'],['Using the site','You may browse the catalogue and use local features for personal, non-commercial purposes. All brand presentation and original media remain part of the UNIQUE storefront experience.']]},
  }[kind];
  return <><Seo title={content.title} description={content.description}/><main className="page-main"><article className="text-page"><span className="eyebrow">{content.eyebrow}</span><h1>{content.title}</h1><p>{content.description}</p>{content.sections.map(([heading,copy])=><section key={heading}><h2>{heading}</h2><p>{copy}</p></section>)}<Link className="quiet-link" href="/contact" style={{display:'inline-flex',marginTop:25}}>We are here to help <ArrowRight size={13}/></Link></article></main></>;
}
export const AboutPage=()=> <EditorialPage kind="about"/>;
export const CarePage=()=> <EditorialPage kind="care"/>;
export const ShippingPage=()=> <EditorialPage kind="shipping"/>;
export const PrivacyPage=()=> <EditorialPage kind="privacy"/>;
export const TermsPage=()=> <EditorialPage kind="terms"/>;

export function FaqPage() {
  const [open,setOpen]=useState<number|null>(0);
  const questions=[
    ['What materials are used?','Each piece lists its material on its product page. The collection includes 18k gold vermeil, recycled yellow gold, sterling silver and selected natural stones and pearls. Please check the individual piece details.'],
    ['Do you deliver outside Algiers?','Yes, delivery is available across Algeria. Complimentary delivery is available on selections over 65,000 DZD; we confirm delivery timing and any applicable fee personally.'],
    ['Can I place an order online?','Not yet. This storefront is currently a preview: the bag and wishlist are saved on your device, but checkout, payments and order placement are not enabled. Contact UNIQUE to enquire about a piece.'],
    ['How should I care for my jewellery?','Put pieces on after applying perfume and remove them before bathing, swimming or exercising. Wipe gently with a soft cloth and keep each piece in a dry, separate pouch. Visit our care guide for more.'],
    ['Can you help me choose a size?','We are happy to help you find a comfortable fit. Contact us with the piece and your question before enquiring about an order.'],
    ['How do I learn about returns?','Since each enquiry is handled personally, the return and exchange terms will be shared and confirmed before an order is placed. See shipping & returns for more detail.'],
  ];
  return <><Seo title="Frequently Asked Questions" description="Answers about UNIQUE jewellery materials, delivery across Algeria, care, sizing and the current checkout preview."/><main className="page-main"><PageHero eyebrow="The details, considered" title="A few answers." copy="If you are wondering about a piece, its care or what comes next, begin here."/><article className="text-page" style={{paddingTop:42}}>{questions.map(([question,answer],i)=><section className="faq-item" key={question}><button className="faq-q" aria-expanded={open===i} onClick={()=>setOpen(open===i?null:i)} data-testid={`button-faq-${i}`}><span>{question}</span><span aria-hidden="true">{open===i?'−':'+'}</span></button>{open===i&&<p className="faq-a">{answer}</p>}</section>)}<p style={{marginTop:30}}>Still curious? <Link href="/contact">We would love to hear from you.</Link></p></article></main></>;
}

export function ContactPage() {
  const [sent,setSent]=useState(false);
  const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setSent(true)};
  return <><Seo title="Contact UNIQUE" description="Speak with UNIQUE about a jewellery piece, materials, delivery across Algeria or care."/><main className="page-main"><article className="text-page"><span className="eyebrow">A personal note</span><h1>We are here.</h1><p>Questions about a piece, materials, delivery or finding the right fit? Leave a note below. This preview form stays on this device and does not send a message.</p>{sent?<div role="status" style={{marginTop:28,padding:20,background:'var(--surface-soft)',color:'var(--sapphire)',fontSize:12}}><Check size={18}/> Your note is ready. In this preview, nothing has been sent. Please reach out to UNIQUE directly to continue.</div>:<form className="contact-form" onSubmit={submit}><label>Your name<input name="name" autoComplete="name" required placeholder="How should we address you?"/></label><label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@example.com"/></label><label>Your note<textarea name="message" required placeholder="Tell us what you have in mind."/></label><button className="button-dark" type="submit">Prepare your note <ArrowRight size={14}/></button></form>}<div style={{marginTop:38}}><span className="eyebrow">A quicker answer</span><p>Browse our <Link href="/faq">frequently asked questions</Link>, or find details in our <Link href="/shipping-returns">shipping & returns</Link> guide.</p></div></article></main></>;
}
export function NotFoundPage() {
  return <><Seo title="Page Not Found" description="This UNIQUE page could not be found. Return to the jewellery collection."/><main className="page-main"><div className="empty-state"><span className="eyebrow">A small detour</span><h1 className="display" style={{fontSize:'clamp(48px,8vw,86px)',margin:'16px 0'}}>This page wandered.</h1><p>We could not find that page, but there is plenty more to discover.</p><Link className="button-dark" href="/">Return to UNIQUE <ArrowRight size={14}/></Link></div></main></>;
}
