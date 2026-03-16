/**
 * Represents a user authenticated via Google.
 */
export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
}
