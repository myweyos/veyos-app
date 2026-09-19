import { RedisHealthIndicator } from "./redis.health";
import { REDIS_CLIENT } from "./redis.tokens";

function makeRedis(pingResult: Promise<string> | Error): jest.Mocked<{ ping: () => Promise<string> }> {
  return {
    ping: jest.fn().mockImplementation(() =>
      pingResult instanceof Error ? Promise.reject(pingResult) : pingResult,
    ),
  };
}

describe("RedisHealthIndicator.ping()", () => {
  it("returns reachable: true when PING responds with PONG", async () => {
    const redis = makeRedis(Promise.resolve("PONG"));
    const indicator = new RedisHealthIndicator(redis as never);
    expect(await indicator.ping()).toEqual({ reachable: true });
  });

  it("returns reachable: false when PING throws", async () => {
    const redis = makeRedis(new Error("connection refused"));
    const indicator = new RedisHealthIndicator(redis as never);
    expect(await indicator.ping()).toEqual({ reachable: false });
  });

  it("returns reachable: false when PING does not return PONG", async () => {
    const redis = makeRedis(Promise.resolve("unexpected"));
    const indicator = new RedisHealthIndicator(redis as never);
    expect(await indicator.ping()).toEqual({ reachable: false });
  });

  it("uses the injected REDIS_CLIENT token", () => {
    // Verifies the token is wired to the constructor parameter.
    const tokens = Reflect.getMetadata("design:paramtypes", RedisHealthIndicator) as unknown[];
    expect(tokens).toBeDefined();
    const injectTokens =
      (Reflect.getMetadata("self:paramtypes", RedisHealthIndicator) as { index: number; param: symbol }[] | undefined) ?? [];
    const clientToken = injectTokens.find((t) => t.index === 0);
    expect(clientToken?.param ?? REDIS_CLIENT).toBe(REDIS_CLIENT);
  });
});
