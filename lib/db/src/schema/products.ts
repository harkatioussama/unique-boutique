import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { brandsTable } from "./brands";
import { categoriesTable } from "./categories";
import { timestamps } from "./columns";
import { genderEnum } from "./enums";

// All prices are whole Algerian dinars (DZD) stored as integers.
export const productsTable = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    brandId: integer("brand_id")
      .notNull()
      .references(() => brandsTable.id, { onDelete: "restrict" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categoriesTable.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    gender: genderEnum("gender").notNull().default("unisex"),
    priceDzd: integer("price_dzd").notNull(),
    compareAtPriceDzd: integer("compare_at_price_dzd"),
    isActive: boolean("is_active").notNull().default(true),
    isFeatured: boolean("is_featured").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("products_slug_unique").on(t.slug),
    index("products_brand_idx").on(t.brandId),
    index("products_category_idx").on(t.categoryId),
    index("products_active_gender_idx").on(t.isActive, t.gender),
    index("products_featured_idx")
      .on(t.isFeatured)
      .where(sql`${t.isActive} and ${t.isFeatured}`),
    check("products_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("products_price_non_negative", sql`${t.priceDzd} >= 0`),
    check(
      "products_compare_at_price_valid",
      sql`${t.compareAtPriceDzd} is null or ${t.compareAtPriceDzd} > ${t.priceDzd}`,
    ),
  ],
);

export const productImagesTable = pgTable(
  "product_images",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    altText: text("alt_text"),
    sortOrder: integer("sort_order").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("product_images_product_sort_idx").on(t.productId, t.sortOrder),
    // At most one primary image per product.
    uniqueIndex("product_images_one_primary")
      .on(t.productId)
      .where(sql`${t.isPrimary}`),
  ],
);

// Every product has at least one variant; stock and order lines point at variants.
export const productVariantsTable = pgTable(
  "product_variants",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "restrict" }),
    sku: text("sku").notNull(),
    label: text("label").notNull().default("Default"),
    // Null means "use the product price".
    priceDzd: integer("price_dzd"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("product_variants_sku_unique").on(t.sku),
    index("product_variants_product_idx").on(t.productId),
    check(
      "product_variants_price_non_negative",
      sql`${t.priceDzd} is null or ${t.priceDzd} >= 0`,
    ),
  ],
);

const priceDzd = z.number().int().nonnegative();

export const insertProductSchema = createInsertSchema(productsTable, {
  priceDzd,
  compareAtPriceDzd: priceDzd.nullish(),
}).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;

export const insertProductImageSchema = createInsertSchema(
  productImagesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProductImage = z.infer<typeof insertProductImageSchema>;
export type ProductImage = typeof productImagesTable.$inferSelect;

export const insertProductVariantSchema = createInsertSchema(
  productVariantsTable,
  { priceDzd: priceDzd.nullish() },
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProductVariant = z.infer<typeof insertProductVariantSchema>;
export type ProductVariant = typeof productVariantsTable.$inferSelect;
