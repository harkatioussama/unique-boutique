import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { config } from "./lib/config";
import { errorHandler } from "./lib/errors";
import { logger } from "./lib/logger";
import { securityHeaders } from "./middlewares/security-headers";

const app: Express = express();

app.disable("x-powered-by");
if (config.trustProxy) {
  const hops = Number(config.trustProxy);
  app.set("trust proxy", Number.isInteger(hops) ? hops : config.trustProxy);
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(securityHeaders);
// Only origins listed in CORS_ORIGINS may call the API from a browser with
// credentials. Same-origin requests do not need CORS.
app.use(
  cors({
    origin: (origin, callback) =>
      callback(null, origin ? config.corsOrigins.has(origin) : false),
    credentials: true,
    methods: ["GET", "POST", "PATCH"],
    allowedHeaders: ["Content-Type", "X-Requested-With"],
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

app.use("/api", router);

app.use(errorHandler);

export default app;
