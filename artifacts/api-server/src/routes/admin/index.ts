import categoriesRouter from "./categories";
import { Router, type IRouter } from "express";
import brandsRouter from "./brands";
import { requireSameOrigin } from "../../lib/csrf";
import authRouter from "./auth";
import wilayasRouter from "./wilayas";
import productsRouter from "./products";

// Everything under /api/admin: CSRF/origin check on every state-changing
// request, then each route enforces its own session and role checks.
const router: IRouter = Router();

router.use(requireSameOrigin);
router.use(authRouter);
router.use(brandsRouter);
router.use(categoriesRouter);
router.use(productsRouter);
router.use(wilayasRouter);

export default router;
