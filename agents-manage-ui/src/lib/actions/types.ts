// Generic action result type
export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}
