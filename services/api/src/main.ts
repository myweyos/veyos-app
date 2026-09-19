import "dotenv/config";
import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Never log request bodies in this service. They contain Art.9 special-category data.
    logger: ["error", "warn", "log"],
  });
  // The web app is the only browser caller. Native apps aren't subject to CORS, so this list
  // is exactly the web origins and nothing else; unset means no browser may call the API.
  const webOrigins = (process.env.WEB_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o !== "");
  if (webOrigins.length > 0) {
    app.enableCors({ origin: webOrigins, methods: ["GET", "POST", "PUT", "DELETE"], allowedHeaders: ["Authorization", "Content-Type"] });
  }
  await app.listen(Number(process.env.PORT ?? 3000));
}

void bootstrap();
