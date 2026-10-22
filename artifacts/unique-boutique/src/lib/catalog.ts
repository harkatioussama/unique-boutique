export type Category = string;
export const categories = ['Rings', 'Necklaces', 'Bracelets', 'Earrings'];
export type ProductImage = { src: string; alt: string };
export type Product = {
  id: string; slug: string; name: string; category: Category; collection: string;
  priceDzd: number; images: ProductImage[]; description: string; material: string;
  variants: string[]; stockStatus: 'In stock' | 'Made to order' | 'Sold out';
  featured?: boolean; bestseller?: boolean;
};
const image = (src: string, alt: string): ProductImage => ({ src, alt });
const imagePath = (filename: string) =>
  `${import.meta.env.BASE_URL}images/${filename}`;
const ring = imagePath('ring.jpg');
const neck = imagePath('hero-necklace.jpg');
const ear = imagePath('earrings.jpg');
const bracelet = imagePath('bracelet.jpg');
export const products: Product[] = [
  { id:'u01', slug:'nour-signet-ring', name:'Nour Signet Ring', category:'Rings', collection:'The Heirloom Edit', priceDzd:48500, images:[image(ring,'18k gold signet ring resting on sunlit travertine'),image(neck,'Gold jewelry details on sculptural limestone')], description:'A quietly sculptural signet, softened by hand and finished with a brilliant point of light. Made to become part of your everyday story.', material:'18k recycled yellow gold · white sapphire', variants:['Size 50','Size 52','Size 54','Size 56'], stockStatus:'In stock',featured:true,bestseller:true },
  { id:'u02', slug:'safiya-collar', name:'Safiya Collar', category:'Necklaces', collection:'The Mediterranean Light', priceDzd:76800, images:[image(neck,'Sculptural gold collar necklace in warm late-afternoon light'),image(ring,'Fine gold jewelry in ivory silk and stone')], description:'A fluid collar inspired by the shifting light along the Algerian coast. A close, graceful line designed to sit beautifully on the skin.', material:'18k yellow gold vermeil · sterling silver core', variants:['40 cm','45 cm'], stockStatus:'In stock',featured:true },
  { id:'u03', slug:'lina-pearl-hoops', name:'Lina Pearl Hoops', category:'Earrings', collection:'The Heirloom Edit', priceDzd:32900, images:[image(ear,'Polished gold hoops with small pearl drops on ceramic'),image(neck,'Warm gold necklace and pearl detail')], description:'Our modern heirloom hoop pairs a softened golden curve with a luminous freshwater pearl. Light enough to wear from morning to late evening.', material:'18k gold vermeil · freshwater pearl', variants:['Pair'], stockStatus:'In stock',featured:true,bestseller:true },
  { id:'u04', slug:'amira-chain-bracelet', name:'Amira Chain Bracelet', category:'Bracelets', collection:'The Mediterranean Light', priceDzd:39500, images:[image(bracelet,'Fine gold bracelet with gemstone worn in golden light'),image(ear,'Gold jewelry detail on cream linen')], description:'An easy, considered chain bracelet with a petite hand-set stone. Finished with an adjustable clasp for a personal fit.', material:'18k gold vermeil · white zircon', variants:['16 cm + 3 cm extender'], stockStatus:'In stock',featured:true },
  { id:'u05', slug:'selma-stacking-band', name:'Selma Stacking Band', category:'Rings', collection:'The Heirloom Edit', priceDzd:26700, images:[image(ring,'Gold stacking band on pale stone'),image(bracelet,'Close detail of fine gold jewelry')], description:'A softly hammered band with a little warmth in every facet. Wear it alone or alongside the Nour signet.', material:'18k recycled yellow gold vermeil', variants:['Size 50','Size 52','Size 54','Size 56'], stockStatus:'In stock',bestseller:true },
  { id:'u06', slug:'yael-pendant', name:'Yael Pendant', category:'Necklaces', collection:'The Heirloom Edit', priceDzd:54800, images:[image(neck,'Fine pendant necklace on warm limestone'),image(ear,'Gold jewelry in soft Mediterranean sun')], description:'A clear, timeless pendant held in a delicate trace chain. A small keepsake, made to be given and kept close.', material:'18k gold vermeil · white sapphire', variants:['42 cm','48 cm'], stockStatus:'Made to order' },
  { id:'u07', slug:'ines-cuff', name:'Inès Cuff', category:'Bracelets', collection:'The Mediterranean Light', priceDzd:61900, images:[image(bracelet,'Sculptural gold cuff in Mediterranean sunlight'),image(ring,'Gold pieces arranged on linen')], description:'An open cuff with a quiet sculptural weight, shaped by hand and polished to catch the light without asking for it.', material:'18k gold vermeil · sterling silver core', variants:['Small','Medium'], stockStatus:'In stock',featured:true },
  { id:'u08', slug:'yasmine-studs', name:'Yasmine Studs', category:'Earrings', collection:'The Heirloom Edit', priceDzd:28900, images:[image(ear,'Gold and pearl stud earrings on chalk ceramic'),image(ring,'A gold ring photographed in directional sun')], description:'A luminous everyday pair, where a softly rounded gold setting meets a freshwater pearl with natural character.', material:'18k gold vermeil · freshwater pearl', variants:['Pair'], stockStatus:'In stock',bestseller:true },
  { id:'u09', slug:'noor-drop-earrings', name:'Noor Drop Earrings', category:'Earrings', collection:'The Mediterranean Light', priceDzd:44200, images:[image(ear,'Elegant pearl drop earrings in warm sun'),image(neck,'Gold jewelry against ivory silk')], description:'An elongated silhouette that moves gently with you. A study in balance: a fine gold line and a single pearl drop.', material:'18k gold vermeil · freshwater pearl', variants:['Pair'], stockStatus:'In stock' },
  { id:'u10', slug:'selene-chain', name:'Selene Chain', category:'Necklaces', collection:'The Mediterranean Light', priceDzd:57200, images:[image(neck,'Delicate gold chain around a limestone bust'),image(bracelet,'Fine gold chain in soft warm light')], description:'A finely linked chain with an almost liquid finish. Wear it as it is or layer it with a treasured pendant.', material:'18k recycled yellow gold', variants:['42 cm','50 cm'], stockStatus:'Made to order' },
  { id:'u11', slug:'dalia-gem-ring', name:'Dalia Gem Ring', category:'Rings', collection:'The Mediterranean Light', priceDzd:69800, images:[image(ring,'A delicate gold gemstone ring on travertine'),image(ear,'Gold jewelry close-up in soft light')], description:'A brilliant, hand-set stone is framed by a delicate gold band, creating a ring that feels personal from the first wear.', material:'18k gold vermeil · white sapphire', variants:['Size 50','Size 52','Size 54'], stockStatus:'In stock',featured:true },
  { id:'u12', slug:'mila-chain-bracelet', name:'Mila Chain Bracelet', category:'Bracelets', collection:'The Heirloom Edit', priceDzd:35400, images:[image(bracelet,'Fine chain bracelet draped over ivory silk'),image(neck,'Gold details in sunlit editorial setting')], description:'Fine links, finished by hand, catch the light with every gesture. A refined piece that layers effortlessly.', material:'18k gold vermeil', variants:['16 cm + 3 cm extender'], stockStatus:'In stock' },
];
export const collections = [
  { slug:'the-heirloom-edit', name:'The Heirloom Edit', subtitle:'Pieces to keep close, and pass on.', image:ring, alt:'Gold heirloom jewelry resting on warm travertine' },
  { slug:'the-mediterranean-light', name:'The Mediterranean Light', subtitle:'For the warmth that stays with you.', image:neck, alt:'Golden jewelry in late afternoon Mediterranean light' },
];
export const formatDzd = (amount: number) => `${new Intl.NumberFormat('fr-DZ').format(amount)} DZD`;

export function isProduct(value: unknown): value is Product {
  if (!value || typeof value !== 'object') return false;
  const product = value as Record<string, unknown>;
  return typeof product.id === 'string'
    && typeof product.slug === 'string'
    && typeof product.name === 'string'
    && typeof product.category === 'string'
    && typeof product.collection === 'string'
    && typeof product.priceDzd === 'number'
    && Number.isFinite(product.priceDzd)
    && product.priceDzd >= 0
    && Array.isArray(product.images)
    && product.images.length > 0
    && product.images.every((image) => !!image
      && typeof image === 'object'
      && typeof (image as Record<string, unknown>).src === 'string'
      && typeof (image as Record<string, unknown>).alt === 'string')
    && typeof product.description === 'string'
    && typeof product.material === 'string'
    && Array.isArray(product.variants)
    && product.variants.every((variant) => typeof variant === 'string')
    && product.variants.length > 0
    && ['In stock', 'Made to order', 'Sold out'].includes(product.stockStatus as string)
    && (product.featured === undefined || typeof product.featured === 'boolean')
    && (product.bestseller === undefined || typeof product.bestseller === 'boolean');
}
