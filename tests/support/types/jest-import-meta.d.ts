interface ImportMeta {
  readonly jest: {
    fn(): jest.Mock;
    fn<TImplementation extends (...args: never[]) => unknown>(
      implementation: TImplementation,
    ): jest.MockedFunction<TImplementation>;
    unstable_mockModule(
      moduleName: string,
      moduleFactory: () => Record<string, unknown>,
    ): void;
    useFakeTimers(): {
      setSystemTime(now: Date): void;
    };
    useRealTimers(): void;
  };
}
