/**
 * Module-level BYOK field supplier.
 *
 * Holds a getter that returns the current BYOK request fields from the
 * session-only settings context. The API key itself never lives here —
 * only a reference to the getter. Refreshing the page clears everything.
 */
export interface ByokFields {
  aiProvider?: string;
  aiApiKey?: string;
}

type Supplier = () => ByokFields;

let supplier: Supplier = () => ({});

export function setByokFieldsSupplier(next: Supplier): void {
  supplier = next;
}

export function getByokFields(): ByokFields {
  return supplier();
}
