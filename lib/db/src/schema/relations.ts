import { relations } from "drizzle-orm";
import { adminSessionsTable, adminUsersTable } from "./admin";
import { brandsTable } from "./brands";
import { categoriesTable } from "./categories";
import { inventoryTable, stockMovementsTable } from "./inventory";
import {
  orderItemsTable,
  orderStatusHistoryTable,
  ordersTable,
} from "./orders";
import {
  productImagesTable,
  productVariantsTable,
  productsTable,
} from "./products";
import { deliveryRatesTable, wilayasTable } from "./wilayas";

export const brandsRelations = relations(brandsTable, ({ many }) => ({
  products: many(productsTable),
}));

export const categoriesRelations = relations(
  categoriesTable,
  ({ one, many }) => ({
    parent: one(categoriesTable, {
      fields: [categoriesTable.parentId],
      references: [categoriesTable.id],
      relationName: "category_parent",
    }),
    children: many(categoriesTable, { relationName: "category_parent" }),
    products: many(productsTable),
  }),
);

export const productsRelations = relations(productsTable, ({ one, many }) => ({
  brand: one(brandsTable, {
    fields: [productsTable.brandId],
    references: [brandsTable.id],
  }),
  category: one(categoriesTable, {
    fields: [productsTable.categoryId],
    references: [categoriesTable.id],
  }),
  images: many(productImagesTable),
  variants: many(productVariantsTable),
}));

export const productImagesRelations = relations(
  productImagesTable,
  ({ one }) => ({
    product: one(productsTable, {
      fields: [productImagesTable.productId],
      references: [productsTable.id],
    }),
  }),
);

export const productVariantsRelations = relations(
  productVariantsTable,
  ({ one, many }) => ({
    product: one(productsTable, {
      fields: [productVariantsTable.productId],
      references: [productsTable.id],
    }),
    inventory: one(inventoryTable, {
      fields: [productVariantsTable.id],
      references: [inventoryTable.variantId],
    }),
    stockMovements: many(stockMovementsTable),
  }),
);

export const inventoryRelations = relations(inventoryTable, ({ one }) => ({
  variant: one(productVariantsTable, {
    fields: [inventoryTable.variantId],
    references: [productVariantsTable.id],
  }),
}));

export const stockMovementsRelations = relations(
  stockMovementsTable,
  ({ one }) => ({
    variant: one(productVariantsTable, {
      fields: [stockMovementsTable.variantId],
      references: [productVariantsTable.id],
    }),
    order: one(ordersTable, {
      fields: [stockMovementsTable.orderId],
      references: [ordersTable.id],
    }),
  }),
);

export const ordersRelations = relations(ordersTable, ({ one, many }) => ({
  wilaya: one(wilayasTable, {
    fields: [ordersTable.wilayaId],
    references: [wilayasTable.id],
  }),
  items: many(orderItemsTable),
  statusHistory: many(orderStatusHistoryTable),
}));

export const orderItemsRelations = relations(orderItemsTable, ({ one }) => ({
  order: one(ordersTable, {
    fields: [orderItemsTable.orderId],
    references: [ordersTable.id],
  }),
  variant: one(productVariantsTable, {
    fields: [orderItemsTable.variantId],
    references: [productVariantsTable.id],
  }),
}));

export const orderStatusHistoryRelations = relations(
  orderStatusHistoryTable,
  ({ one }) => ({
    order: one(ordersTable, {
      fields: [orderStatusHistoryTable.orderId],
      references: [ordersTable.id],
    }),
  }),
);

export const wilayasRelations = relations(wilayasTable, ({ one, many }) => ({
  parent: one(wilayasTable, {
    fields: [wilayasTable.parentWilayaId],
    references: [wilayasTable.id],
    relationName: "wilaya_parent",
  }),
  children: many(wilayasTable, { relationName: "wilaya_parent" }),
  deliveryRate: one(deliveryRatesTable, {
    fields: [wilayasTable.id],
    references: [deliveryRatesTable.wilayaId],
  }),
}));

export const deliveryRatesRelations = relations(
  deliveryRatesTable,
  ({ one }) => ({
    wilaya: one(wilayasTable, {
      fields: [deliveryRatesTable.wilayaId],
      references: [wilayasTable.id],
    }),
  }),
);

export const adminUsersRelations = relations(adminUsersTable, ({ many }) => ({
  sessions: many(adminSessionsTable),
}));

export const adminSessionsRelations = relations(
  adminSessionsTable,
  ({ one }) => ({
    adminUser: one(adminUsersTable, {
      fields: [adminSessionsTable.adminUserId],
      references: [adminUsersTable.id],
    }),
  }),
);
