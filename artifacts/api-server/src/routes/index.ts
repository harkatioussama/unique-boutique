import { Router, type IRouter } from "express";
import healthRouter from "./health";
import deliveryRouter from "./delivery";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(deliveryRouter);
router.use("/admin", adminRouter);

export default router;
