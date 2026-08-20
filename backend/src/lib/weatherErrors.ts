export class WeatherApiError extends Error {
    constructor(
      message: string,
      public readonly status: number,
      public readonly body?: unknown
    ) {
      super(message);
      this.name = "WeatherApiError";
    }
  }
  
  export class WeatherApiValidationError extends Error {
    constructor(message: string, public readonly issues: unknown) {
      super(message);
      this.name = "WeatherApiValidationError";
    }
  }
  
  export class QuotaExceededError extends Error {
    constructor(message = "WeatherAI monthly quota exhausted, refusing to make request") {
      super(message);
      this.name = "QuotaExceededError";
    }
  }