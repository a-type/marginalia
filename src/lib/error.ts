export enum AppErrorCode {
  BadRequest = 40000,
  Unauthorized = 40100,
  SessionExpired = 40101,
  SessionInvalid = 40102,
  Forbidden = 40300,
  NotFound = 40400,
  Conflict = 40900,
  InternalServerError = 50000,
  ExternalServiceError = 50200,
  Unknown = 60000,
}

export class AppError extends Error {
  static Code = AppErrorCode;
  name = 'AppError';
  response?: Response;

  static isInstance = (err: unknown): err is AppError => {
    if (err instanceof AppError) return true;
    if (err instanceof Error && err.name === 'AppError') return true;
    return false;
  };

  static isRpcInstance = (err: unknown) => {
    if (
      typeof err === 'object' &&
      (err as any).name === 'Error' &&
      !!(err as any).message &&
      (err as any).message.startsWith('AppError: ')
    )
      return true;

    return false;
  };

  static fromInstanceOrRpc = (err: unknown): AppError => {
    if (AppError.isInstance(err)) return err;
    if (
      err &&
      err instanceof Error &&
      'code' in err &&
      typeof err.code === 'number'
    ) {
      return new AppError(err.code, err.message);
    }
    if (err && err instanceof Error) {
      const code = /\(code: (\d+)\)/.exec(err.message);
      if (code) {
        return new AppError(Number(code[1]), err.message);
      }
    }
    return new AppError(AppErrorCode.Unknown, String(err));
  };

  static fromResponse = (res: Response): AppError | null => {
    if (res.ok) {
      return null;
    }
    const code = Number(res.headers.get('X-App-Error')) || 0;
    const message = res.headers.get('X-App-Message') || 'Unknown error';
    return new AppError(code, message, res);
  };

  static throwIfError = (res: Response): void => {
    const error = AppError.fromResponse(res);
    if (error) {
      throw error;
    }
  };

  static wrap = (err: unknown): AppError => {
    if (AppError.isInstance(err)) {
      return err;
    }
    if (err instanceof Error) {
      return new AppError(AppErrorCode.Unknown, err.message, err);
    }
    return new AppError(
      AppErrorCode.Unknown,
      'An unexpected error occurred',
      err,
    );
  };

  constructor(
    public code: AppErrorCode,
    message?: string,
    cause?: unknown,
  ) {
    super(message ? `${message}` : `Error (code: ${code})`, {
      cause,
    });
    this.name = 'AppError';
    this.code = code;
    if (cause instanceof Response) {
      this.response = cause;
    }
  }

  get statusCode() {
    if (this.code < 20000 || this.code >= 60000) {
      return 500;
    }
    return Math.floor(this.code / 100);
  }

  get body() {
    return { code: this.code, message: this.message };
  }

  get headers() {
    return {
      'X-App-Error': this.code.toString(),
      'X-App-Message': this.message,
    };
  }

  toResponse = (): Response =>
    new Response(JSON.stringify(this.body), {
      status: this.statusCode,
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
    });

  toLogs = async () => [
    `AppError: ${this.message} (code: ${this.code})`,
    ...(this.response
      ? [
          `Response status: ${this.response.status}`,
          `Response body: ${this.response.bodyUsed ? '[used]' : await this.response.text()}`,
        ]
      : []),
    ...(this.stack ? [this.stack] : []),
  ];

  toLogsSync = () => [
    `AppError: ${this.message} (code: ${this.code})`,
    ...(this.stack ? [this.stack] : []),
  ];
}
