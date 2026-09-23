/**
 * The signed-in person, as the UI shows them.
 *
 * `role` is what `core_api` reports on `GET /users/me` (TRA-222), merged into
 * the stored profile after sign-in. A profile stored before that has none,
 * and "no role" means not an administrator.
 */
export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  role?: UserRole;
}

export type UserRole = "user" | "admin";
