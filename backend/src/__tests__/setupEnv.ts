process.env.WEATHERAI_API_KEY ??= "wai_test_key";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/weatherai_alert_hub_test";
process.env.REDIS_URL ??= "redis://localhost:6379/1";
process.env.NODE_ENV = "test";