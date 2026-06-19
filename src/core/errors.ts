export interface ParseError {
  type: "ParseError";
  message: string;
  line: number;
  column: number;
  context: string;
  token?: string;
  suggestion?: string;
}

export type ParseResult<T> =
  | { success: true; value: T; errors: [] }
  | { success: false; errors: ParseError[] };
