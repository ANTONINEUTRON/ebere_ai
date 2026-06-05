export interface Guard {
  name: string;
  pre?(toolName: string, args: unknown, userId: string): Promise<string | void>;
  post?(toolName: string, result: unknown, userId: string): Promise<void>;
}
