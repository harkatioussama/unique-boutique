
import { Router, type IRouter } from "express";
import { desc, eq, asc } from "drizzle-orm";
import { insertBrandSchema, brandsTable } from "@workspace/db";
import { loadDb } from "../../lib/database";
import { currentAdmin, requireAdmin, requireRole } from "../../middlewares/require-admin";
import { writeAudit } from "../../lib/audit";

const router: IRouter = Router();

// List brands for authenticated admin users.
router.get("/brands", requireAdmin, async (_req, res, next) => {
  try {
    const { db } = await loadDb();
    const brands = await db
      .select()
      .from(brandsTable)
      .orderBy(asc(brandsTable.sortOrder), asc(brandsTable.name));

    res.json({ brands });
  } catch (error) {
    next(error);
  }
});

// Create a brand. Only owners can manage the catalog for now.
router.post("/brands", requireAdmin, requireRole("owner"), async (req, res, next) => {
  try {
    const parsed = insertBrandSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_brand", details: parsed.error.flatten() });
      return;
    }

    const { db } = await loadDb();
    const [brand] = await db.insert(brandsTable).values(parsed.data).returning();

    if (!brand) {
      res.status(500).json({ error: "brand_create_failed" });
      return;
    }

    await writeAudit({
      adminUserId: currentAdmin(res).id,
      action: "brand.create",
      entityType: "brand",
      entityId: String(brand.id),
      after: { name: brand.name, slug: brand.slug },
      ip: req.ip,
    });

    res.status(201).json({ brand });
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/brands/:id",
  requireAdmin,
  requireRole("owner"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        res.status(400).json({ error: "invalid_brand_id" });
        return;
      }

      const parsed = insertBrandSchema
        .partial()
        .refine((data) => Object.keys(data).length > 0)
        .safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_brand",
          details: parsed.error.flatten(),
        });
        return;
      }

      const { db } = await loadDb();
      const [brand] = await db
        .update(brandsTable)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(brandsTable.id, id))
        .returning();

      if (!brand) {
        res.status(404).json({ error: "brand_not_found" });
        return;
      }

      await writeAudit({
        adminUserId: currentAdmin(res).id,
        action: "brand.update",
        entityType: "brand",
        entityId: String(brand.id),
        after: {
          name: brand.name,
          slug: brand.slug,
          isActive: brand.isActive,
        },
        ip: req.ip,
      });

      res.json({ brand });
    } catch (error) {
      next(error);
    }
  },
);


router.delete(
  "/brands/:id",
  requireAdmin,
  requireRole("owner"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        res.status(400).json({ error: "invalid_brand_id" });
        return;
      }

      const { db } = await loadDb();
      const [brand] = await db
        .delete(brandsTable)
        .where(eq(brandsTable.id, id))
        .returning({
          id: brandsTable.id,
          name: brandsTable.name,
          slug: brandsTable.slug,
        });

      if (!brand) {
        res.status(404).json({ error: "brand_not_found" });
        return;
      }

      await writeAudit({
        adminUserId: currentAdmin(res).id,
        action: "brand.delete",
        entityType: "brand",
        entityId: String(brand.id),
        after: { name: brand.name, slug: brand.slug },
        ip: req.ip,
      });

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);


export default router;
