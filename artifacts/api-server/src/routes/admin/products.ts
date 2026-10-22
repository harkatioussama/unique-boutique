
import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import {
  brandsTable,
  categoriesTable,
  productsTable,
  productImagesTable,
  productVariantsTable,
  inventoryTable,
  insertProductSchema,
} from "@workspace/db";
import { loadDb } from "../../lib/database";
import {
  currentAdmin,
  requireAdmin,
  requireRole,
} from "../../middlewares/require-admin";
import { writeAudit } from "../../lib/audit";

const router: IRouter = Router();

// List products, including their brand, category, images, and variants.
router.get("/products", requireAdmin, async (_req, res, next) => {
  try {
    const { db } = await loadDb();

    const products = await db
      .select({
        id: productsTable.id,
        brandId: productsTable.brandId,
        categoryId: productsTable.categoryId,
        name: productsTable.name,
        slug: productsTable.slug,
        description: productsTable.description,
        gender: productsTable.gender,
        priceDzd: productsTable.priceDzd,
        compareAtPriceDzd: productsTable.compareAtPriceDzd,
        isActive: productsTable.isActive,
        isFeatured: productsTable.isFeatured,
        createdAt: productsTable.createdAt,
        updatedAt: productsTable.updatedAt,
        brandName: brandsTable.name,
        categoryName: categoriesTable.name,
      })
      .from(productsTable)
      .innerJoin(brandsTable, eq(productsTable.brandId, brandsTable.id))
      .innerJoin(
        categoriesTable,
        eq(productsTable.categoryId, categoriesTable.id),
      )
      .orderBy(asc(productsTable.name));

    res.json({ products });
  } catch (error) {
    next(error);
  }
});


 // Update stock for a product variant.
router.patch(
  "/products/:id/variants/:variantId/stock",
  requireAdmin,
  requireRole("owner"),
  async (req, res, next) => {
    try {
      const productId = Number(req.params.id);
      const variantId = Number(req.params.variantId);
      const { onHand, lowStockThreshold } = req.body ?? {};

      if (
        !Number.isSafeInteger(productId) ||
        productId <= 0 ||
        !Number.isSafeInteger(variantId) ||
        variantId <= 0
      ) {
        res.status(400).json({ error: "invalid_id" });
        return;
      }

      if (!Number.isSafeInteger(onHand) || onHand < 0) {
        res.status(400).json({ error: "invalid_on_hand" });
        return;
      }

      if (
        lowStockThreshold !== undefined &&
        (!Number.isSafeInteger(lowStockThreshold) || lowStockThreshold < 0)
      ) {
        res.status(400).json({ error: "invalid_low_stock_threshold" });
        return;
      }

      const { db } = await loadDb();

      const [variant] = await db
        .select({ id: productVariantsTable.id })
        .from(productVariantsTable)
        .where(
          eq(productVariantsTable.id, variantId),
        )
        .limit(1);

      if (!variant) {
        res.status(404).json({ error: "product_variant_not_found" });
        return;
      }

      const [inventory] = await db
        .select()
        .from(inventoryTable)
        .where(eq(inventoryTable.variantId, variantId))
        .limit(1);

      if (!inventory) {
        res.status(404).json({ error: "inventory_not_found" });
        return;
      }

      if (inventory.reserved > onHand) {
        res.status(400).json({
          error: "on_hand_below_reserved",
          reserved: inventory.reserved,
        });
        return;
      }

      const [updated] = await db
        .update(inventoryTable)
        .set({
          onHand,
          ...(lowStockThreshold !== undefined ? { lowStockThreshold } : {}),
          updatedAt: new Date(),
        })
        .where(eq(inventoryTable.variantId, variantId))
        .returning();

      await writeAudit({
        adminUserId: currentAdmin(res).id,
        action: "inventory.stock.update",
        entityType: "product_variant",
        entityId: String(variantId),
        after: {
          productId,
          onHand: updated?.onHand,
          lowStockThreshold: updated?.lowStockThreshold,
        },
        ip: req.ip,
      });

      res.json({ inventory: updated });
    } catch (error) {
      next(error);
    }
  },
);

 // Edit a product variant.
router.patch(
  "/products/:id/variants/:variantId",
  requireAdmin,
  requireRole("owner"),
  async (req, res, next) => {
    try {
      const productId = Number(req.params.id);
      const variantId = Number(req.params.variantId);
      const { sku, label, priceDzd, isActive, sortOrder } = req.body ?? {};

      if (
        !Number.isSafeInteger(productId) ||
        productId <= 0 ||
        !Number.isSafeInteger(variantId) ||
        variantId <= 0
      ) {
        res.status(400).json({ error: "invalid_id" });
        return;
      }

      const updates: {
        sku?: string;
        label?: string;
        priceDzd?: number | null;
        isActive?: boolean;
        sortOrder?: number;
      } = {};

      if (sku !== undefined) {
        if (typeof sku !== "string" || !sku.trim()) {
          res.status(400).json({ error: "invalid_sku" });
          return;
        }
        updates.sku = sku.trim();
      }

      if (label !== undefined) {
        if (typeof label !== "string" || !label.trim()) {
          res.status(400).json({ error: "invalid_label" });
          return;
        }
        updates.label = label.trim();
      }

      if (priceDzd !== undefined) {
        if (
          priceDzd !== null &&
          (!Number.isSafeInteger(priceDzd) || priceDzd < 0)
        ) {
          res.status(400).json({ error: "invalid_variant_price" });
          return;
        }
        updates.priceDzd = priceDzd;
      }

      if (isActive !== undefined) {
        if (typeof isActive !== "boolean") {
          res.status(400).json({ error: "invalid_is_active" });
          return;
        }
        updates.isActive = isActive;
      }

      if (sortOrder !== undefined) {
        if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) {
          res.status(400).json({ error: "invalid_sort_order" });
          return;
        }
        updates.sortOrder = sortOrder;
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: "no_valid_updates" });
        return;
      }

      const { db } = await loadDb();

      const [variant] = await db
        .update(productVariantsTable)
        .set(updates)
        .where(
          eq(productVariantsTable.id, variantId),
        )
        .returning();

      if (!variant || variant.productId !== productId) {
        res.status(404).json({ error: "product_variant_not_found" });
        return;
      }

      await writeAudit({
        adminUserId: currentAdmin(res).id,
        action: "product.variant.update",
        entityType: "product",
        entityId: String(productId),
        after: {
          variantId: variant.id,
          sku: variant.sku,
          label: variant.label,
          priceDzd: variant.priceDzd,
          isActive: variant.isActive,
        },
        ip: req.ip,
      });

      res.json({ variant });
    } catch (error) {
      next(error);
    }
  },
);


 // Create a variant for a product.
router.post(
  "/products/:id/variants",
  requireAdmin,
  requireRole("owner"),
  async (req, res, next) => {
    try {
      const productId = Number(req.params.id);
      const { sku, label, priceDzd, sortOrder } = req.body ?? {};

      if (!Number.isSafeInteger(productId) || productId <= 0) {
        res.status(400).json({ error: "invalid_product_id" });
        return;
      }

      if (typeof sku !== "string" || !sku.trim()) {
        res.status(400).json({ error: "invalid_sku" });
        return;
      }

      if (label !== undefined && typeof label !== "string") {
        res.status(400).json({ error: "invalid_label" });
        return;
      }

      if (
        priceDzd !== undefined &&
        priceDzd !== null &&
        (!Number.isSafeInteger(priceDzd) || priceDzd < 0)
      ) {
        res.status(400).json({ error: "invalid_variant_price" });
        return;
      }

      const { db } = await loadDb();

      const result = await db.transaction(async (tx) => {
        const [product] = await tx
          .select({ id: productsTable.id })
          .from(productsTable)
          .where(eq(productsTable.id, productId))
          .limit(1);

        if (!product) return null;

        const [variant] = await tx
          .insert(productVariantsTable)
          .values({
            productId,
            sku: sku.trim(),
            label: label?.trim() || "Default",
            priceDzd: priceDzd ?? null,
            sortOrder:
              Number.isSafeInteger(sortOrder) && sortOrder >= 0
                ? sortOrder
                : 0,
          })
          .returning();

        if (!variant) {
          throw new Error("product_variant_create_failed");
        }

        await tx.insert(inventoryTable).values({
          variantId: variant.id,
          onHand: 0,
          reserved: 0,
          lowStockThreshold: 2,
        });

        return variant;
      });

      if (!result) {
        res.status(404).json({ error: "product_not_found" });
        return;
      }

      await writeAudit({
        adminUserId: currentAdmin(res).id,
        action: "product.variant.create",
        entityType: "product",
        entityId: String(productId),
        after: {
          variantId: result.id,
          sku: result.sku,
          label: result.label,
        },
        ip: req.ip,
      });

      res.status(201).json({ variant: result });
    } catch (error) {
      next(error);
    }
  },
);

 // List variants for a product.
router.get(
  "/products/:id/variants",
  requireAdmin,
  async (req, res, next) => {
    try {
      const productId = Number(req.params.id);

      if (!Number.isSafeInteger(productId) || productId <= 0) {
        res.status(400).json({ error: "invalid_product_id" });
        return;
      }

      const { db } = await loadDb();

      const variants = await db
        .select({
          id: productVariantsTable.id,
          productId: productVariantsTable.productId,
          sku: productVariantsTable.sku,
          label: productVariantsTable.label,
          priceDzd: productVariantsTable.priceDzd,
          isActive: productVariantsTable.isActive,
          sortOrder: productVariantsTable.sortOrder,
          onHand: inventoryTable.onHand,
          reserved: inventoryTable.reserved,
          lowStockThreshold: inventoryTable.lowStockThreshold,
        })
        .from(productVariantsTable)
        .leftJoin(
          inventoryTable,
          eq(inventoryTable.variantId, productVariantsTable.id),
        )
        .where(eq(productVariantsTable.productId, productId))
        .orderBy(asc(productVariantsTable.sortOrder), asc(productVariantsTable.id));

      res.json({ variants });
    } catch (error) {
      next(error);
    }
  },
);

 // Create a product with a default variant and inventory record.
router.post(
  "/products",
  requireAdmin,
  requireRole("owner"),
  async (req, res, next) => {
    try {
      const parsed = insertProductSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_product",
          details: parsed.error.flatten(),
        });
        return;
      }

      const { db } = await loadDb();

      const result = await db.transaction(async (tx) => {
        const [product] = await tx
          .insert(productsTable)
          .values(parsed.data)
          .returning();

        if (!product) {
          throw new Error("product_create_failed");
        }

        const [variant] = await tx
          .insert(productVariantsTable)
          .values({
            productId: product.id,
            sku: `UNIQUE-${product.id}-DEFAULT`,
            label: "Default",
          })
          .returning();

        if (!variant) {
          throw new Error("product_variant_create_failed");
        }

        await tx.insert(inventoryTable).values({
          variantId: variant.id,
          onHand: 0,
          reserved: 0,
          lowStockThreshold: 2,
        });

        return { product, variant };
      });

      await writeAudit({
        adminUserId: currentAdmin(res).id,
        action: "product.create",
        entityType: "product",
        entityId: String(result.product.id),
        after: {
          name: result.product.name,
          slug: result.product.slug,
          brandId: result.product.brandId,
          categoryId: result.product.categoryId,
          variantId: result.variant.id,
        },
        ip: req.ip,
      });

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);


router.patch(
  "/products/:id",
  requireAdmin,
  requireRole("owner"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isSafeInteger(id) || id <= 0) {
        res.status(400).json({ error: "invalid_product_id" });
        return;
      }

      const parsed = insertProductSchema
        .partial()
        .refine((data) => Object.keys(data).length > 0)
        .safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_product",
          details: parsed.error.flatten(),
        });
        return;
      }

      const { db } = await loadDb();
      const [product] = await db
        .update(productsTable)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(productsTable.id, id))
        .returning();

      if (!product) {
        res.status(404).json({ error: "product_not_found" });
        return;
      }

      await writeAudit({
        adminUserId: currentAdmin(res).id,
        action: "product.update",
        entityType: "product",
        entityId: String(product.id),
        after: {
          name: product.name,
          slug: product.slug,
          brandId: product.brandId,
          categoryId: product.categoryId,
          priceDzd: product.priceDzd,
          isActive: product.isActive,
        },
        ip: req.ip,
      });

      res.json({ product });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/products/:id",
  requireAdmin,
  requireRole("owner"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isSafeInteger(id) || id <= 0) {
        res.status(400).json({ error: "invalid_product_id" });
        return;
      }

      const { db } = await loadDb();

      // Product variants may be referenced by inventory and order records.
      // Archive the product instead of physically deleting related records.
      const [product] = await db
        .update(productsTable)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(productsTable.id, id))
        .returning({
          id: productsTable.id,
          name: productsTable.name,
          slug: productsTable.slug,
        });

      if (!product) {
        res.status(404).json({ error: "product_not_found" });
        return;
      }

      await writeAudit({
        adminUserId: currentAdmin(res).id,
        action: "product.archive",
        entityType: "product",
        entityId: String(product.id),
        after: {
          name: product.name,
          slug: product.slug,
          isActive: false,
        },
        ip: req.ip,
      });

      res.json({ success: true, archived: true });
    } catch (error) {
      next(error);
    }
  },
);

 // List images for a product.
router.get(
  "/products/:id/images",
  requireAdmin,
  async (req, res, next) => {
    try {
      const productId = Number(req.params.id);

      if (!Number.isSafeInteger(productId) || productId <= 0) {
        res.status(400).json({ error: "invalid_product_id" });
        return;
      }

      const { db } = await loadDb();

      const images = await db
        .select()
        .from(productImagesTable)
        .where(eq(productImagesTable.productId, productId))
        .orderBy(asc(productImagesTable.sortOrder), asc(productImagesTable.id));

      res.json({ images });
    } catch (error) {
      next(error);
    }
  },
);


 // Delete a product image.
router.delete(
  "/products/:id/images/:imageId",
  requireAdmin,
  requireRole("owner"),
  async (req, res, next) => {
    try {
      const productId = Number(req.params.id);
      const imageId = Number(req.params.imageId);

      if (
        !Number.isSafeInteger(productId) ||
        productId <= 0 ||
        !Number.isSafeInteger(imageId) ||
        imageId <= 0
      ) {
        res.status(400).json({ error: "invalid_id" });
        return;
      }

      const { db } = await loadDb();

      const [deletedImage] = await db
        .delete(productImagesTable)
        .where(
          eq(productImagesTable.id, imageId),
        )
        .returning();

      if (!deletedImage || deletedImage.productId !== productId) {
        res.status(404).json({ error: "product_image_not_found" });
        return;
      }

      await writeAudit({
        adminUserId: currentAdmin(res).id,
        action: "product.image.delete",
        entityType: "product",
        entityId: String(productId),
        after: { imageId },
        ip: req.ip,
      });

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);


 // Add an image to a product.
router.post(
  "/products/:id/images",
  requireAdmin,
  requireRole("owner"),
  async (req, res, next) => {
    try {
      const productId = Number(req.params.id);
      const { url, altText, isPrimary, sortOrder } = req.body ?? {};

      if (!Number.isSafeInteger(productId) || productId <= 0) {
        res.status(400).json({ error: "invalid_product_id" });
        return;
      }

      if (typeof url !== "string" || !/^https?:\/\/\S+$/i.test(url)) {
        res.status(400).json({ error: "invalid_image_url" });
        return;
      }

      if (altText !== undefined && typeof altText !== "string") {
        res.status(400).json({ error: "invalid_alt_text" });
        return;
      }

      const { db } = await loadDb();

      const [image] = await db
        .insert(productImagesTable)
        .values({
          productId,
          url,
          altText: altText ?? null,
          isPrimary: isPrimary === true,
          sortOrder: Number.isInteger(sortOrder) && sortOrder >= 0 ? sortOrder : 0,
        })
        .returning();

      if (!image) {
        res.status(500).json({ error: "product_image_create_failed" });
        return;
      }

      await writeAudit({
        adminUserId: currentAdmin(res).id,
        action: "product.image.create",
        entityType: "product",
        entityId: String(productId),
        after: { imageId: image.id, url: image.url },
        ip: req.ip,
      });

      res.status(201).json({ image });
    } catch (error) {
      next(error);
    }
  },
);


 // Delete a product variant when no order references it.
router.delete(
  "/products/:id/variants/:variantId",
  requireAdmin,
  requireRole("owner"),
  async (req, res, next) => {
    try {
      const productId = Number(req.params.id);
      const variantId = Number(req.params.variantId);

      if (
        !Number.isSafeInteger(productId) ||
        productId <= 0 ||
        !Number.isSafeInteger(variantId) ||
        variantId <= 0
      ) {
        res.status(400).json({ error: "invalid_id" });
        return;
      }

      const { db } = await loadDb();

      const [variant] = await db
        .select()
        .from(productVariantsTable)
        .where(eq(productVariantsTable.id, variantId))
        .limit(1);

      if (!variant || variant.productId !== productId) {
        res.status(404).json({ error: "product_variant_not_found" });
        return;
      }

      await db
        .delete(productVariantsTable)
        .where(eq(productVariantsTable.id, variantId));

      await writeAudit({
        adminUserId: currentAdmin(res).id,
        action: "product.variant.delete",
        entityType: "product_variant",
        entityId: String(variantId),
       after: {
  deleted: true,
  productId,
  sku: variant.sku,
  label: variant.label,
},
        ip: req.ip,
      });

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
