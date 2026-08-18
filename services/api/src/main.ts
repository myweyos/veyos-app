import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Never log request bodies in this service. They contain Art.9 special-category data.
    logger: ["error", "warn", "log"],
  });
  await app.listen(Number(process.env.PORT ?? 3000));
}

void bootstrap();
