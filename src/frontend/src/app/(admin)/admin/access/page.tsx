/** Route `/admin/access/`: the static shell over the access list. */

import AccessClientPage from "./AccessClientPage";

/** `/admin/access/` — a static shell over the access list; nothing here reads the query. */
export default function AdminAccessPage() {
  return <AccessClientPage />;
}
