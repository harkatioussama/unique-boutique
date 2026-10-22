
import { Router, type IRouter } from "express";
import { asc } from "drizzle-orm";
import { categoriesTable, insertCategorySchema } from "@workspace/db";
import { loadDb } from "../../lib/database";
import {
  currentAdmin,
  requireAdmin,
  requireRole,
} from "../../middlewares/require-admin";
import { writeAudit } from "../../lib/audit";

const router: IRouter = Router();

// List categories for authenticated admins.
router.get("/categories", requireAdmin, async (_req, res, next) => {
  try {
    const { db } = await loadDb();
    const categories = await db
      .select()
      .from(categoriesTable)
      .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.name));

    res.json({ categories });
  } catch (error) {
    next(error);
  }
});

// Create a category.
router.post(
  "/categories",
  requireAdmin,
  requireRole("owner"),
  async (req, res, next) => {
    try {
      const parsed = insertCategorySchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_category",
          details: parsed.error.flatten(),
        });
        return;
      }

      const { db } = await loadDb();
      const [category] = await db
        .insert(categoriesTable)
        .values(parsed.data)
        .returning();

      if (!category) {
        res.status(500).json({ error: "category_create_failed" });
        return;
      }

      await writeAudit({
        adminUserId: currentAdmin(res).id,
        action: "category.create",
        entityType: "category",
        entityId: String(category.id),
        after: { name: category.name, slug: category.slug },
        ip: req.ip,
      });

      res.status(201).json({ category });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/categories/:id",
  requireAdmin,
  requireRole("owner"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isSafeInteger(id) || id <= 0) {
        res.status(400).json({ error: "invalid_category_id" });
        return;
      }

      const parsed = insertCategorySchema
        .partial()
        .refine((data) => Object.keys(data).length > 0)
        .safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_category",
          details: parsed.error.flatten(),
        });
        return;
      }

      const { db } = await loadDb();
      const [category] = await db
        .update(categoriesTable)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where((await import("drizzle-orm")).eq(categoriesTable.id, id))
        .returning();

      if (!category) {
        res.status(404).json({ error: "category_not_found" });
        return;
      }

      await writeAudit({
        adminUserId: currentAdmin(res).id,
        action: "category.update",
        entityType: "category",
        entityId: String(category.id),
        after: {
          name: category.name,
          slug: category.slug,
          isActive: category.isActive,
        },
        ip: req.ip,
      });

      res.json({ category });
    } catch (error) {
      next(error);
    }
  },
);


router.delete(
  "/categories/:id",
  requireAdmin,
  requireRole("owner"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isSafeInteger(id) || id <= 0) {
        res.status(400).json({ error: "invalid_category_id" });
        return;
      }

      const { db } = await loadDb();
      const [category] = await db
        .delete(categoriesTable)
        .where((await import("drizzle-orm")).eq(categoriesTable.id, id))
        .returning({
          id: categoriesTable.id,
          name: categoriesTable.name,
          slug: categoriesTable.slug,
        });

      if (!category) {
        res.status(404).json({ error: "category_not_found" });
        return;
      }

      await writeAudit({
        adminUserId: currentAdmin(res).id,
        action: "category.delete",
        entityType: "category",
        entityId: String(category.id),
        after: { name: category.name, slug: category.slug },
        ip: req.ip,
      });

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);


export default router;
